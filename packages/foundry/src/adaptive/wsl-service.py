"""Trusted WSL lifecycle controller; only Bubblewrap executes the supplied argv.

Control and evidence stay outside the sole writable task mount. No host-network
HTTP fallback, model calls, credential access, global config, or package installs.
"""
import base64
import contextlib
import datetime
import fcntl
import hashlib
import http.client
import json
import os
import pathlib
import resource
import re
import selectors
import signal
import socket
import subprocess
import sys
import time
import traceback

CAP = 65536
ENV = {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'}


def atomic(path, value):
    temporary = path.with_name(path.name + '.' + str(os.getpid()) + '.tmp')
    with open(temporary, 'w', encoding='utf-8') as stream:
        json.dump(value, stream)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


def read(path):
    # DrvFS readers may briefly observe ENOENT across an atomic replacement.
    for attempt in range(5):
        try:
            with open(path, encoding='utf-8') as stream:
                return json.load(stream)
        except FileNotFoundError:
            if attempt == 4:
                raise
            time.sleep(.01)


def iso(timestamp):
    return datetime.datetime.fromtimestamp(timestamp, datetime.timezone.utc).isoformat()


def process_start(pid):
    # comm may contain spaces and parentheses; fields after the final ')' begin at 3.
    return pathlib.Path('/proc/' + str(pid) + '/stat').read_text().rsplit(')', 1)[1].split()[19]


def boot_id():
    return pathlib.Path('/proc/sys/kernel/random/boot_id').read_text().strip()


def unit_info(unit):
    result = subprocess.run(['systemctl', '--user', 'show', unit, '--property=ActiveState,InvocationID,LoadState'], capture_output=True, text=True, timeout=3)
    return dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)


def public(config, state):
    return {key: value for key, value in {**config['public'], **state}.items()
            if key not in ['pid', 'pidStart', 'bootId', 'invocationId', 'unit']}


def current(config, directory):
    state = read(directory / 'runtime.json') if (directory / 'runtime.json').exists() else {'status': 'starting', 'stdout': '', 'stderr': '', 'truncated': False}
    info = unit_info(config['unit'])
    state['quiescent'] = info.get('ActiveState') in ['inactive', 'failed'] or info.get('LoadState') == 'not-found'
    if state['status'] in ['stopped', 'expired', 'failed']:
        return state
    if time.time() >= config['deadline']:
        return {**state, 'status': 'expired', 'reason': 'SERVICE_LEASE_EXPIRED'}
    if info.get('ActiveState') not in ['active', 'activating']:
        return {**state, 'status': 'uncertain' if state['status'] == 'starting' else 'failed', 'reason': 'SERVICE_UNIT_NOT_ACTIVE'}
    if state.get('pid') and (not state.get('invocationId') or info.get('InvocationID') != state['invocationId']):
        return {**state, 'status': 'uncertain', 'reason': 'SERVICE_UNIT_IDENTITY_CHANGED'}
    if state.get('pid'):
        try:
            if state.get('bootId') != boot_id() or process_start(state['pid']) != state.get('pidStart'):
                raise ValueError()
        except (OSError, ValueError):
            return {**state, 'status': 'uncertain', 'reason': 'SERVICE_PROCESS_IDENTITY_CHANGED'}
    return state


def namespace_call(config, state, request, timeout=10):
    if state.get('bootId') != boot_id():
        raise ValueError('SERVICE_PROCESS_IDENTITY_CHANGED')
    pid, expected = state['pid'], state['pidStart']
    if process_start(pid) != expected:
        raise ValueError('SERVICE_PROCESS_IDENTITY_CHANGED')
    if config['unit'] not in pathlib.Path('/proc/' + str(pid) + '/cgroup').read_text():
        raise ValueError('SERVICE_CGROUP_IDENTITY_CHANGED')
    descriptor = os.pidfd_open(pid)
    try:
        for kind in ['user', 'net']:
            name = '/proc/' + str(pid) + '/ns/' + kind
            if os.readlink(name) == os.readlink('/proc/self/ns/' + kind):
                raise ValueError('SERVICE_NAMESPACE_NOT_PRIVATE')
        # A pinned process descriptor plus atomic setns prevents PID reuse and
        # enters the related user/network namespaces in one kernel operation.
        if process_start(pid) != expected:
            raise ValueError('SERVICE_PROCESS_IDENTITY_CHANGED')
        result = subprocess.run(['python3', str(pathlib.Path(__file__).resolve()), '--http', str(descriptor)],
                                input=json.dumps({'port': config['request']['port'], **request}),
                                capture_output=True, text=True, pass_fds=(descriptor,), env=ENV, timeout=timeout)
        try:
            value = json.loads(result.stdout)
        except ValueError:
            raise ValueError('SERVICE_HTTP_FAILED: ' + result.stderr[:512])
        if 'error' in value:
            raise ValueError(value['error'])
        if result.returncode != 0:
            raise ValueError('SERVICE_HTTP_FAILED')
        return value['value']
    finally:
        os.close(descriptor)


def http_broker():
    descriptor = int(sys.argv[2])
    os.setns(descriptor, 0x10000000 | 0x40000000)  # CLONE_NEWUSER | CLONE_NEWNET
    os.close(descriptor)
    request = json.load(sys.stdin)
    if request.get('probe'):
        with socket.create_connection(('127.0.0.1', request['port']), timeout=.3):
            return True
    method, path = request['method'], request['path']
    body = request.get('body', '').encode('utf-8')
    if method not in ['GET', 'POST'] or not path.startswith('/') or path.startswith('//') or len(path) > 8192 or any(ord(c) <= 32 or ord(c) == 127 or c == '\\' for c in path) or len(body) > CAP:
        raise ValueError('SERVICE_HTTP_REQUEST_INVALID')
    # http.client uses neither environment proxies nor redirect following.
    connection = http.client.HTTPConnection('127.0.0.1', request['port'], timeout=8)
    try:
        connection.request(method, path, body=body, headers={'Content-Type': 'application/json', 'Connection': 'close'})
        response = connection.getresponse()
        headers = response.getheaders()
        header_bytes = len(json.dumps(headers).encode())
        if header_bytes >= CAP:
            raise ValueError('SERVICE_HTTP_RESPONSE_LIMIT')
        data = response.read(CAP - header_bytes + 1)
        if len(data) + header_bytes > CAP:
            raise ValueError('SERVICE_HTTP_RESPONSE_LIMIT')
        return {'statusCode': response.status, 'headers': headers, 'body': data.decode('utf-8', errors='replace'),
                'bodyBase64': base64.b64encode(data).decode(), 'bytes': len(data)}
    finally:
        connection.close()


def supervise(config_path):
    config_path = pathlib.Path(config_path)
    config, directory = read(config_path), config_path.parent
    request = config['request']
    workspace, cwd = pathlib.Path(request['workspace']).resolve(strict=True), pathlib.Path(request['cwd']).resolve(strict=True)
    cwd.relative_to(workspace)
    if directory.resolve().is_relative_to(workspace):
        raise ValueError('SERVICE_CONTROL_MOUNT_DENIED')
    status_r, status_w = os.pipe()
    args = ['bwrap', '--die-with-parent', '--new-session', '--unshare-all', '--cap-drop', 'ALL', '--clearenv',
            '--setenv', 'PATH', '/usr/bin:/bin', '--setenv', 'HOME', '/workspace/.home',
            '--setenv', 'LANG', 'C.UTF-8', '--setenv', 'TMPDIR', '/tmp']
    for path in ['/usr', '/bin', '/lib', '/lib64']:
        if os.path.exists(path):
            args += ['--ro-bind', os.path.realpath(path), path]
    args += ['--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp', '--dir', '/etc',
             '--bind', str(workspace), '/workspace', '--chdir', '/workspace/' + str(cwd.relative_to(workspace)),
             '--json-status-fd', str(status_w), '--'] + request['argv']

    def limits():
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        resource.setrlimit(resource.RLIMIT_FSIZE, (67108864, 67108864))
        resource.setrlimit(resource.RLIMIT_AS, (1073741824, 1073741824))
        resource.setrlimit(resource.RLIMIT_NOFILE, (256, 256))

    process = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               start_new_session=True, env=ENV, pass_fds=(status_w,), preexec_fn=limits)
    os.close(status_w)
    state = {'status': 'starting', 'stdout': '', 'stderr': '', 'truncated': False,
             'invocationId': os.environ.get('INVOCATION_ID'), 'bootId': boot_id()}
    cancelled = False

    def stop(*signals):
        nonlocal cancelled
        if signals:
            cancelled = True
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    selector = selectors.DefaultSelector()
    selector.register(status_r, selectors.EVENT_READ, 'status')
    selector.register(process.stdout, selectors.EVENT_READ, 'stdout')
    selector.register(process.stderr, selectors.EVENT_READ, 'stderr')
    collected, size, status_buffer = {'stdout': bytearray(), 'stderr': bytearray()}, 0, b''
    next_scan, next_probe, next_save = 0, 0, 0
    atomic(directory / 'runtime.json', state)
    try:
        while process.poll() is None or selector.get_map():
            now = time.time()
            if now >= config['deadline']:
                state.update(status='expired', reason='SERVICE_LEASE_EXPIRED')
                stop()
            if now >= next_scan:
                count, total = 0, 0
                for folder, dirs, files in os.walk(workspace, followlinks=False):
                    count += len(dirs) + len(files)
                    for name in files:
                        try:
                            total += os.lstat(os.path.join(folder, name)).st_size
                        except FileNotFoundError:
                            pass
                    if count > 4096 or total > 268435456:
                        state.update(status='failed', reason='WORKSPACE_MONITORED_LIMIT')
                        stop()
                        break
                next_scan = now + .2
            if state['status'] == 'starting' and state.get('pid') and now >= next_probe:
                try:
                    namespace_call(config, state, {'probe': True}, timeout=1)
                    state['status'] = 'ready'
                    state.pop('readinessError', None)
                except (ValueError, OSError, subprocess.TimeoutExpired) as error:
                    state['readinessError'] = str(error)[:512]
                next_probe = now + .1
            for key, _ in selector.select(.05):
                descriptor = key.fileobj if isinstance(key.fileobj, int) else key.fileobj.fileno()
                data = os.read(descriptor, 8192)
                if not data:
                    selector.unregister(key.fileobj)
                    continue
                if key.data == 'status':
                    status_buffer += data
                    if len(status_buffer) > 8192:
                        raise ValueError('SERVICE_NAMESPACE_STATUS_INVALID')
                    if b'\n' in status_buffer:
                        for line in status_buffer.splitlines():
                            report = json.loads(line)
                            if 'child-pid' in report:
                                pid = report['child-pid']
                                state.update(pid=pid, pidStart=process_start(pid))
                        status_buffer = b''
                else:
                    take = data[:max(0, CAP - size)]
                    size += len(take)
                    collected[key.data] += take
                    state['truncated'] |= len(take) != len(data)
            if now >= next_save:
                for name in collected:
                    state[name] = collected[name].decode('utf-8', errors='replace')
                atomic(directory / 'runtime.json', state)
                next_save = now + .2
        if state['status'] not in ['expired', 'failed']:
            state.update(status='stopped' if cancelled else 'failed', reason='SERVICE_STOPPED' if cancelled else 'SERVICE_PROCESS_EXITED')
    finally:
        stop()
        process.wait(timeout=2)
        selector.close()
        os.close(status_r)
        for name in collected:
            state[name] = collected[name].decode('utf-8', errors='replace')
        atomic(directory / 'runtime.json', state)


def operation(payload):
    control = pathlib.Path(payload['control']).resolve(strict=True)
    digest = hashlib.sha256(payload['operationId'].encode()).hexdigest()
    directory = control / digest
    if payload['action'] != 'start' and not directory.exists():
        return None
    directory.mkdir(mode=0o700, exist_ok=True)
    with open(directory / 'lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        config_path = directory / 'config.json'
        config = read(config_path) if config_path.exists() else None
        if config and (config.get('control') != str(control) or config['public']['businessId'] != payload['businessId'] or config['public']['taskId'] != payload['taskId']):
            # Restored history cannot control a still-running source installation.
            raise ValueError('SERVICE_STATE_RELOCATED')
        if payload['action'] == 'start':
            request = payload['request']
            workspace = pathlib.Path(request['workspace']).resolve(strict=True)
            pathlib.Path(request['cwd']).resolve(strict=True).relative_to(workspace)
            if control.is_relative_to(workspace) or pathlib.Path(__file__).resolve().is_relative_to(workspace):
                raise ValueError('SERVICE_CONTROL_MOUNT_DENIED')
            if not isinstance(request['port'], int) or not 1024 <= request['port'] <= 65535 or not isinstance(request['lifetimeMs'], int) or not 1000 <= request['lifetimeMs'] <= 600000:
                raise ValueError('SERVICE_LIMIT_INVALID')
            if not request['argv'] or len(request['argv']) > 128 or any(not isinstance(a, str) or '\0' in a for a in request['argv']):
                raise ValueError('SERVICE_ARGV_INVALID')
            input_hash = hashlib.sha256(json.dumps([payload['businessId'], payload['taskId'], request], sort_keys=True).encode()).hexdigest()
            if config:
                if config['public']['inputHash'] != input_hash:
                    raise ValueError('SERVICE_ID_CONFLICT')
            else:
                now = time.time()
                unit = 'midas-service-' + hashlib.sha256(str(directory).encode()).hexdigest()[:40] + '.service'
                config = {'unit': unit, 'control': str(control), 'request': request, 'deadline': now + request['lifetimeMs'] / 1000,
                          'public': {'operationId': payload['operationId'], 'businessId': payload['businessId'], 'taskId': payload['taskId'],
                                     'inputHash': input_hash, 'isolation': 'wsl-bubblewrap', 'startedAt': iso(now),
                                     'expiresAt': iso(now + request['lifetimeMs'] / 1000), 'port': request['port'],
                                     'resourceLimits': {'memoryBytes': 1073741824, 'processes': 64, 'cpuPercent': 100,
                                                        'lifetimeMs': request['lifetimeMs'], 'diskQuota': False}}}
                # Durable dispatch intent precedes systemd-run. Ambiguous starts
                # are never automatically retried, even if the unit is missing.
                atomic(config_path, config)
                result = subprocess.run(['systemd-run', '--user', '--quiet', '--collect', '--unit=' + unit,
                                         '-p', 'MemoryMax=1073741824', '-p', 'MemorySwapMax=0', '-p', 'TasksMax=64',
                                         '-p', 'CPUQuota=100%', '-p', 'RuntimeMaxSec=' + str(request['lifetimeMs'] / 1000) + 's',
                                         '-p', 'TimeoutStopSec=2s', '-p', 'KillMode=control-group',
                                         '-p', 'StandardOutput=null', '-p', 'StandardError=null',
                                         'python3', str(pathlib.Path(__file__).resolve()), '--supervise', str(config_path)],
                                        capture_output=True, text=True, timeout=5)
                if result.returncode:
                    atomic(directory / 'runtime.json', {'status': 'failed', 'reason': 'SERVICE_CGROUP_UNAVAILABLE',
                                                       'stdout': '', 'stderr': result.stderr[:2048], 'truncated': False})
                until = time.monotonic() + 10
                while time.monotonic() < until:
                    state = current(config, directory)
                    if state['status'] != 'starting':
                        break
                    time.sleep(.1)
            return public(config, current(config, directory))
        if not config:
            return None
        state = current(config, directory)
        if payload['action'] == 'status':
            return public(config, state)
        if payload['action'] == 'stop':
            subprocess.run(['systemctl', '--user', 'stop', config['unit']], capture_output=True, timeout=5)
            state = current(config, directory)
            if not state['quiescent']:
                raise ValueError('SERVICE_STOP_UNCONFIRMED')
            if state['status'] not in ['stopped', 'expired', 'failed']:
                state.update(status='stopped', reason='SERVICE_STOPPED')
            result = public(config, state)
            result['stopConfirmed'] = True
            atomic(directory / 'terminal.json', result)
            return result
        if payload['action'] == 'request':
            if state['status'] != 'ready':
                raise ValueError('SERVICE_NOT_READY')
            response = namespace_call(config, state, payload['request'])
            response.update(isolation='wsl-bubblewrap', operationId=payload['operationId'])
            return response
        raise ValueError('SERVICE_ACTION_INVALID')


def controller():
    payload = json.load(sys.stdin)
    control = pathlib.Path(payload['control']).resolve(strict=True)
    if payload['action'] != 'start':
        return operation(payload)
    # One service lease per task, including uncertain/expired instances until
    # explicit stop confirms the cgroup is empty. No racy check-then-launch.
    with open(control / 'scope.lock', 'a') as scope_lock:
        fcntl.flock(scope_lock, fcntl.LOCK_EX)
        own = hashlib.sha256(payload['operationId'].encode()).hexdigest()
        if not (control / own / 'config.json').exists():
            entries = [path for path in control.iterdir() if path.name != 'scope.lock']
            if len(entries) >= 1024:
                raise ValueError('SERVICE_CONTROL_LIMIT')
            for directory in entries:
                if not directory.is_dir() or directory.is_symlink() or not (directory / 'config.json').exists() or not (directory / 'terminal.json').exists():
                    raise ValueError('SERVICE_TASK_BUSY')
                config, terminal = read(directory / 'config.json'), read(directory / 'terminal.json')
                if not terminal.get('stopConfirmed') or not terminal.get('quiescent') or not current(config, directory)['quiescent']:
                    raise ValueError('SERVICE_TASK_BUSY')
        return operation(payload)


def verify_stopped(evidence, locks):
    scopes = list(evidence.iterdir())
    if len(scopes) > 1024:
        raise ValueError('SERVICE_CONTROL_LIMIT')
    for scope in scopes:
        if not re.fullmatch('[a-f0-9]{64}', scope.name) or scope.is_symlink() or not scope.is_dir():
            raise ValueError('SERVICE_CONTROL_INVALID')
        if (scope / 'scope.lock').is_symlink():
            raise ValueError('SERVICE_CONTROL_INVALID')
        scope_lock = locks.enter_context(open(scope / 'scope.lock', 'a'))
        try:
            fcntl.flock(scope_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError('SERVICE_CONTROL_BUSY')
        operations = [path for path in scope.iterdir() if path.name != 'scope.lock']
        if (scope / 'scope.lock').exists() and ((scope / 'scope.lock').is_symlink() or (scope / 'scope.lock').stat().st_size != 0):
            raise ValueError('SERVICE_CONTROL_INVALID')
        if len(operations) > 1024:
            raise ValueError('SERVICE_CONTROL_LIMIT')
        for directory in operations:
            if not re.fullmatch('[a-f0-9]{64}', directory.name) or directory.is_symlink() or not directory.is_dir():
                raise ValueError('SERVICE_CONTROL_INVALID')
            files = list(directory.iterdir())
            if {path.name for path in files} != {'config.json', 'runtime.json', 'lock', 'terminal.json'} or any(path.is_symlink() or not path.is_file() or path.stat().st_size > 524288 for path in files):
                raise ValueError('SERVICE_STOP_UNCONFIRMED')
            with open(directory / 'lock', 'a') as lock:
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    raise ValueError('SERVICE_CONTROL_BUSY')
                config, terminal = read(directory / 'config.json'), read(directory / 'terminal.json')
                if config['control'] != str(scope) or hashlib.sha256(config['public']['operationId'].encode()).hexdigest() != directory.name:
                    raise ValueError('SERVICE_STATE_RELOCATED')
                if terminal.get('stopConfirmed') is not True or terminal.get('quiescent') is not True or terminal.get('inputHash') != config['public']['inputHash']:
                    raise ValueError('SERVICE_STOP_UNCONFIRMED')
                state = current(config, directory)
                if not state['quiescent']:
                    raise ValueError('SERVICE_STOP_UNCONFIRMED')
    return True


def assert_stopped():
    evidence = pathlib.Path(json.load(sys.stdin)['evidence']).resolve(strict=True)
    with contextlib.ExitStack() as locks:
        return verify_stopped(evidence, locks)


if __name__ == '__main__':
    try:
        if sys.argv[1:2] == ['--supervise']:
            supervise(sys.argv[2])
        else:
            value = http_broker() if sys.argv[1:2] == ['--http'] else assert_stopped() if sys.argv[1:2] == ['--assert-stopped'] else controller()
            print(json.dumps({'value': value}))
    except Exception as error:
        location = traceback.extract_tb(error.__traceback__)[-1]
        print(json.dumps({'error': str(error)[:1900] + ' [' + location.name + ':' + str(location.lineno) + ']'}))
        sys.exit(1)

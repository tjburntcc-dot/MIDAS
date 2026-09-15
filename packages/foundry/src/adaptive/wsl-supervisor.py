"""Trusted local command supervisor. Worker code runs only inside Bubblewrap.

Input arrives on stdin, never as shell source. No credentials/environment inherited.
The Windows controller retains receipts outside the mounted task workspace.
"""
import json, os, pathlib, resource, signal, subprocess, sys, time, datetime


def main():
    request = json.load(sys.stdin)
    workspace = pathlib.Path(request['workspace']).resolve(strict=True)
    cwd = pathlib.Path(request['cwd']).resolve(strict=True)
    cwd.relative_to(workspace)
    if request['network'] != 'off':
        raise ValueError('WSL_NETWORK_REQUIRES_ACQUISITION_BROKER')
    argv = request['argv']
    if not argv or any(not isinstance(x, str) or '\0' in x for x in argv):
        raise ValueError('INVALID_ARGV')
    timeout = request['timeoutMs'] / 1000
    if not 0 < timeout <= 600:
        raise ValueError('INVALID_DEADLINE')
    cap = request['maxOutputBytes']
    if not isinstance(cap, int) or not 0 < cap <= 1048576:
        raise ValueError('INVALID_OUTPUT_LIMIT')
    args = ['bwrap', '--die-with-parent', '--new-session', '--unshare-all', '--cap-drop', 'ALL', '--clearenv',
            '--setenv', 'PATH', '/usr/bin:/bin', '--setenv', 'HOME', '/workspace/.home',
            '--setenv', 'LANG', 'C.UTF-8', '--setenv', 'TMPDIR', '/tmp']
    for path in ['/usr', '/bin', '/lib', '/lib64']:
        if os.path.exists(path):
            args += ['--ro-bind', os.path.realpath(path), path]
    args += ['--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp', '--dir', '/etc',
             '--bind', str(workspace), '/workspace', '--chdir', '/workspace/' + str(cwd.relative_to(workspace)), '--'] + argv

    def limits():
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        resource.setrlimit(resource.RLIMIT_FSIZE, (67108864, 67108864))
        resource.setrlimit(resource.RLIMIT_AS, (1073741824, 1073741824))
        resource.setrlimit(resource.RLIMIT_NOFILE, (256, 256))
        resource.setrlimit(resource.RLIMIT_CPU, (int(timeout) + 1, int(timeout) + 2))

    import selectors
    process = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               start_new_session=True, env={'PATH': '/usr/bin:/bin'}, preexec_fn=limits)
    cancelled = False
    def stop(*signals):
        nonlocal cancelled
        if signals: cancelled = True
        try: os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError: pass
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    selector = selectors.DefaultSelector()
    selector.register(process.stdout, selectors.EVENT_READ, 'stdout')
    selector.register(process.stderr, selectors.EVENT_READ, 'stderr')
    collected = {'stdout': bytearray(), 'stderr': bytearray()}
    size, truncated, timed_out = 0, False, False
    resource_stop, next_scan = None, 0
    deadline = time.monotonic() + timeout
    try:
        while selector.get_map():
            if time.monotonic() >= next_scan:
                # A monitored persistent-disk limit, not a filesystem quota. The
                # cgroup bounds the whole process tree; tmpfs also counts as memory.
                count, total = 0, 0
                for directory, dirs, files in os.walk(workspace, followlinks=False):
                    count += len(dirs) + len(files)
                    for name in files:
                        try: total += os.lstat(os.path.join(directory, name)).st_size
                        except FileNotFoundError: pass
                    if count > 4096 or total > 268435456:
                        resource_stop = 'WORKSPACE_MONITORED_LIMIT'
                        stop()
                        break
                next_scan = time.monotonic() + .05
            if time.monotonic() >= deadline:
                timed_out = True
                stop()
            for key, _ in selector.select(.05):
                data = os.read(key.fileobj.fileno(), 8192)
                if not data:
                    selector.unregister(key.fileobj)
                    continue
                take = data[:max(0, cap - size)]
                size += len(take)
                collected[key.data] += take
                truncated |= len(take) != len(data)
        code = process.wait(timeout=2)
    finally:
        stop()
        selector.close()
    stderr = collected['stderr'].decode('utf-8', errors='replace')
    unavailable = code != 0 and ('bwrap:' in stderr and any(x in stderr.lower() for x in ['permission', 'namespace', 'not permitted']))
    result = {'status': 'blocked' if unavailable else 'timed_out' if timed_out else 'completed' if code == 0 else 'failed',
                      'exitCode': code, 'stdout': collected['stdout'].decode('utf-8', errors='replace'),
                      'stderr': stderr, 'truncated': truncated, 'isolation': 'wsl-bubblewrap',
                      'resourceLimits': {'memoryBytes':1073741824,'processes':64,'cpuPercent':100,'perFileBytes':67108864,
                                         'workspaceMonitoredBytes':268435456,'workspaceMonitoredEntries':4096,'diskQuota':False},
                      **({'reason': 'SANDBOX_UNAVAILABLE'} if unavailable else {'reason':'EXECUTOR_CANCELLED'} if cancelled else {'reason':resource_stop} if resource_stop else {})}
    completion=request.get('completion')
    if completion:
        path=pathlib.Path(completion['path']).resolve()
        if path.is_relative_to(workspace) or not path.parent.is_dir():
            raise ValueError('COMPLETION_PATH_DENIED')
        record={'version':'wsl-command-completion-v1','binding':completion['binding'],'result':result,
                'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        temporary=path.with_suffix('.tmp')
        with open(temporary,'x',encoding='utf-8') as output:
            json.dump(record,output); output.flush(); os.fsync(output.fileno())
        os.replace(temporary,path)
    print(json.dumps(result))


if __name__ == '__main__':
    try: main()
    except Exception as error:
        print(json.dumps({'status': 'blocked', 'exitCode': None, 'stdout': '', 'stderr': str(error),
                          'truncated': False, 'isolation': 'wsl-bubblewrap', 'reason': 'SUPERVISOR_FAILURE'}))

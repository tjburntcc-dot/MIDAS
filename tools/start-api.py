
import os, subprocess, sys
os.chdir('/workspace/midas')
env = os.environ.copy()
env.setdefault('MIDAS_EVALUATOR_SECRET', 'dev-local-only')
env.setdefault('MIDAS_STATE_DIR', '/workspace/midas/var/state')
env.setdefault('PORT', '3000')
# do not print env
subprocess.Popen(['node', '--import', './tools/register-ts.mjs', 'apps/api/src/http-server.ts'], env=env)
print('SPAWNED')

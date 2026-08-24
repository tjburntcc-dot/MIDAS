#!/usr/bin/env bash
# Containment red-team: run INSIDE the sandbox and try to escape.
# Every check must report BLOCKED. Any ACCESSIBLE is a containment failure.
echo "=== identity ==="
echo "  uid=$(id -u) gid=$(id -g) user=$(whoami 2>/dev/null || echo unknown)"
echo "  cwd=$(pwd)"
echo
echo "=== T1/T3: host home directory ==="
for p in /host /mnt/c/Users/14844 /c/Users/14844 "$HOME/../.."; do
  if ls "$p" >/dev/null 2>&1; then echo "  ACCESSIBLE  $p"; else echo "  BLOCKED     $p"; fi
done
echo
echo "=== T5/T6/T7: canonical MIDAS secrets and state ==="
for p in /mnt/c/Users/14844/Downloads/MIDAS/.env \
         /mnt/c/Users/14844/Downloads/MIDAS/var/state/workspaces.json \
         /mnt/c/Users/14844/Downloads/MIDAS/.git/config \
         /c/Users/14844/Downloads/MIDAS/.env; do
  if cat "$p" >/dev/null 2>&1; then echo "  ACCESSIBLE  $p"; else echo "  BLOCKED     $p"; fi
done
echo
echo "=== T4: OpenCode auth store ==="
for p in /mnt/c/Users/14844/.local/share/opencode/auth.json /root/.local/share/opencode/auth.json; do
  if cat "$p" >/dev/null 2>&1; then echo "  ACCESSIBLE  $p"; else echo "  BLOCKED     $p"; fi
done
echo
echo "=== T2: traversal out of the workspace ==="
if ls /work/../.. >/dev/null 2>&1; then echo "  container root visible (expected; host is not)"; fi
echo "  /work contents: $(ls /work 2>/dev/null | tr '\n' ' ')"
echo
echo "=== T14: environment variable enumeration ==="
LEAK=$(env | grep -icE "OPENAI|OPENROUTER|GEMINI|GOOGLE_API|GITHUB|AWS|SECRET|TOKEN|PASSWORD" || true)
echo "  host-credential-shaped env vars visible: $LEAK  $([ "$LEAK" = "0" ] && echo '(BLOCKED)' || echo '(LEAK)')"
echo
echo "=== T13: outbound network ==="
if timeout 8 wget -q -O /dev/null https://api.openai.com/v1/models 2>/dev/null; then echo "  ACCESSIBLE  outbound HTTPS"; else echo "  BLOCKED     outbound HTTPS"; fi
if timeout 8 getent hosts openrouter.ai >/dev/null 2>&1; then echo "  ACCESSIBLE  DNS"; else echo "  BLOCKED     DNS"; fi
echo
echo "=== T11: subprocess spawn (allowed inside, but contained) ==="
sh -c 'echo "  subprocess ran inside sandbox: ok"' 2>/dev/null || echo "  subprocess blocked"
echo
echo "=== T15: host process inspection ==="
HP=$(ps -eo comm 2>/dev/null | grep -icE "node|opencode|Docker" || true)
echo "  host processes visible: $(ps -e 2>/dev/null | wc -l) entries (container-only PID namespace expected)"
echo
echo "=== write test: can it write outside /work? ==="
if touch /etc/escape-probe 2>/dev/null; then echo "  ACCESSIBLE  wrote to /etc (root fs writable)"; else echo "  BLOCKED     /etc read-only"; fi
if touch /work/probe.tmp 2>/dev/null; then echo "  OK          /work writable (intended)"; rm -f /work/probe.tmp; else echo "  /work NOT writable"; fi

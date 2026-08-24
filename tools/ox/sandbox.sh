#!/usr/bin/env bash
# Ox sandbox launcher. Two profiles, both mount ONLY the safe workspace.
#   ./tools/ox/sandbox.sh agent  <dir>   network ON  (agent needs OpenRouter)
#   ./tools/ox/sandbox.sh test   <dir>   network OFF (runs Ox-written code)
DOCKER="/c/Users/14844/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe"
MODE="${1:-test}"; DIR="${2:-C:/Users/14844/Downloads/MIDAS-OX-SAFE}"; shift 2 2>/dev/null
case "$MODE" in
  agent) NET="bridge" ;;
  test)  NET="none" ;;
  *) echo "usage: sandbox.sh [agent|test] <hostDir> [cmd...]"; exit 2 ;;
esac
MSYS_NO_PATHCONV=1 "$DOCKER" run --rm -it \
  --network "$NET" \
  --user 1000:1000 \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=256m \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --pids-limit 512 \
  --memory 4g --cpus 3 \
  -v "$DIR:/work:rw" \
  -w /work \
  node:22-alpine "${@:-sh}"

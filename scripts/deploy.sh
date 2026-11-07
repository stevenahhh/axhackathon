#!/usr/bin/env bash
# 팀 서버(ssh ax)에 web/ 빌드를 배포한다. 실행: web/ 에서 `bash scripts/deploy.sh`
# .env, data/, 다른 프로세스는 건드리지 않는다. 서버에 sftp가 없어 tar를 ssh 파이프로 보낸다.
# 시연 사진(data-demo/drone)은 빌드 밖 $REMOTE_DIR/data/drone에 두고, 서버에 없거나 크기가 다른 파일만 보낸다. 서버 사진은 지우지 않는다.
# serve.py는 /api/align에 numpy·pillow가 필요하므로 $REMOTE_DIR/.venv를 uv로 만들어 그 파이썬으로 띄운다.
# 서버 홈(/home/ubuntu)은 쓰지 않는다: uv 캐시와 파이썬은 /data/hackathon 아래에 둔다.
set -euo pipefail

cd "$(dirname "$0")/.."
REMOTE_DIR=/data/hackathon/web
UV=/data/hackathon/.tools/bin/uv
UV_ENV="UV_CACHE_DIR=/data/hackathon/.cache/uv UV_PYTHON_INSTALL_DIR=/data/hackathon/.tools/uv-python XDG_CACHE_HOME=/data/hackathon/.cache"

bun run build

if [ -d data-demo/drone ]; then
  list=$(mktemp -d)
  trap 'rm -rf "$list"' EXIT
  ssh ax "mkdir -p $REMOTE_DIR/data/drone && cd $REMOTE_DIR/data/drone && find . -maxdepth 1 -type f -name '*.jpg' -printf '%f %s\n'" | sort > "$list/remote"
  (cd data-demo/drone && find . -maxdepth 1 -type f -name '*.jpg' -exec stat -f '%N %z' {} + | sed 's|^\./||') | sort > "$list/local"
  comm -23 "$list/local" "$list/remote" | cut -d' ' -f1 > "$list/send"
  echo "시연 사진 $(wc -l < "$list/send" | tr -d ' ')장 전송"
  if [ -s "$list/send" ]; then
    COPYFILE_DISABLE=1 tar --no-xattrs -cf - -C data-demo/drone -T "$list/send" | ssh ax "tar -xf - -C $REMOTE_DIR/data/drone"
  fi
fi

COPYFILE_DISABLE=1 tar --no-xattrs -czf - dist serve.py agentstream.py samples.json scripts/align.py scripts/align_params.json | ssh ax "rm -rf $REMOTE_DIR/next && mkdir -p $REMOTE_DIR/next && tar -xzf - -C $REMOTE_DIR/next"

# venv는 없을 때만 만든다. 매번 pip install을 돌려도 이미 있으면 몇 초 안에 끝난다.
ssh ax "set -e
cd $REMOTE_DIR
export $UV_ENV
[ -x .venv/bin/python ] || $UV venv --python 3.12 .venv
$UV pip install --python .venv/bin/python --quiet numpy pillow
.venv/bin/python -c 'import numpy, PIL; print(\"venv ok\", numpy.__version__, PIL.__version__)'"

# 서버 프로세스는 누가 띄웠느냐에 따라 'python3 serve.py'일 수도 '.venv/bin/python serve.py'일 수도 있다.
# 명령줄이 serve.py로 끝나고 작업 폴더(/proc/<pid>/cwd)가 $REMOTE_DIR인 프로세스만 멈춘다. 다른 폴더의 serve.py는 건드리지 않는다.
# 다시 띄울 때는 .venv 파이썬이 있으면 그것을, 없으면 python3을 쓴다.
ssh ax bash -s -- "$REMOTE_DIR" <<'REMOTE'
set -e
REMOTE_DIR=$1
cd "$REMOTE_DIR"
rm -rf dist.prev serve.py.prev
[ -e dist ] && mv dist dist.prev
[ -e serve.py ] && mv serve.py serve.py.prev
mv next/dist dist
mv next/serve.py serve.py
mv next/agentstream.py agentstream.py
mv next/samples.json samples.json
mkdir -p scripts && mv next/scripts/align.py scripts/align.py && mv next/scripts/align_params.json scripts/align_params.json
rm -rf next
serve_pids() {
  for pid in $(pgrep -f 'serve\.py$' || true); do
    [ "$(readlink "/proc/$pid/cwd" 2>/dev/null)" = "$REMOTE_DIR" ] && echo "$pid"
  done
  return 0
}
pids=$(serve_pids)
if [ -n "$pids" ]; then
  echo "기존 serve.py 종료: $pids"
  kill $pids
fi
for i in 1 2 3 4 5 6 7 8 9 10; do
  [ -z "$(serve_pids)" ] && break
  sleep 0.5
done
if [ -x .venv/bin/python ]; then PY=.venv/bin/python; else PY=python3; fi
setsid nohup "$PY" serve.py >> server.log 2>&1 < /dev/null &
sleep 1
for pid in $(serve_pids); do ps -o pid=,args= -p "$pid"; done
REMOTE

echo
echo "배포 완료. 롤백은 dist.prev·serve.py.prev를 되돌린 뒤 같은 방식으로 다시 띄운다:"
cat <<'EOF'
ssh ax 'cd /data/hackathon/web && rm -rf dist && mv dist.prev dist && mv serve.py.prev serve.py && for p in $(pgrep -f "serve\.py$"); do [ "$(readlink /proc/$p/cwd)" = /data/hackathon/web ] && kill $p; done; sleep 1; setsid nohup .venv/bin/python serve.py >> server.log 2>&1 < /dev/null &'
EOF

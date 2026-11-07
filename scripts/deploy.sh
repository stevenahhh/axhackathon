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
RESTART="setsid nohup .venv/bin/python serve.py >> server.log 2>&1 < /dev/null &"
SERVE_PATTERN='^(\.venv/bin/python|python3) serve\.py$'

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

# pgrep 패턴은 ^로 고정해 원격 셸(bash -c ...)이나 다른 프로세스와 겹치지 않게 한다.
ssh ax "set -e
cd $REMOTE_DIR
rm -rf dist.prev serve.py.prev
[ -e dist ] && mv dist dist.prev
[ -e serve.py ] && mv serve.py serve.py.prev
mv next/dist dist
mv next/serve.py serve.py
mv next/agentstream.py agentstream.py
mv next/samples.json samples.json
mkdir -p scripts && mv next/scripts/align.py scripts/align.py && mv next/scripts/align_params.json scripts/align_params.json
rm -rf next
pids=\$(pgrep -f '$SERVE_PATTERN' || true)
[ -n \"\$pids\" ] && kill \$pids
for i in 1 2 3 4 5 6 7 8 9 10; do
  [ -z \"\$(pgrep -f '$SERVE_PATTERN' || true)\" ] && break
  sleep 0.5
done
$RESTART
sleep 1
pgrep -af '$SERVE_PATTERN'"

echo
echo "배포 완료. 롤백 명령(dist, serve.py 둘 다 복원):"
cat <<'EOF'
ssh ax "cd /data/hackathon/web && rm -rf dist && mv dist.prev dist && mv serve.py.prev serve.py && kill \$(pgrep -f '^(\.venv/bin/python|python3) serve\.py\$'); sleep 1; setsid nohup .venv/bin/python serve.py >> server.log 2>&1 < /dev/null &"
EOF

#!/usr/bin/env bash
# 팀 서버(ssh ax)에 web/ 빌드를 배포한다. 실행: web/ 에서 `bash scripts/deploy.sh`
# .env, data/, 다른 프로세스는 건드리지 않는다. 서버에 sftp가 없어 tar를 ssh 파이프로 보낸다.
set -euo pipefail

cd "$(dirname "$0")/.."
REMOTE_DIR=/data/hackathon/web
RESTART="setsid nohup python3 serve.py >> server.log 2>&1 < /dev/null &"

bun run build

COPYFILE_DISABLE=1 tar -czf - dist serve.py agentstream.py | ssh ax "rm -rf $REMOTE_DIR/next && mkdir -p $REMOTE_DIR/next && tar -xzf - -C $REMOTE_DIR/next"

# pgrep 패턴은 ^로 고정해 원격 셸(bash -c ...)이나 다른 프로세스와 겹치지 않게 한다.
ssh ax "set -e
cd $REMOTE_DIR
rm -rf dist.prev serve.py.prev
[ -e dist ] && mv dist dist.prev
[ -e serve.py ] && mv serve.py serve.py.prev
mv next/dist dist
mv next/serve.py serve.py
mv next/agentstream.py agentstream.py
rm -rf next
pids=\$(pgrep -f '^python3 serve\\.py\$' || true)
[ -n \"\$pids\" ] && kill \$pids
for i in 1 2 3 4 5 6 7 8 9 10; do
  [ -z \"\$(pgrep -f '^python3 serve\\.py\$' || true)\" ] && break
  sleep 0.5
done
$RESTART
sleep 1
pgrep -af '^python3 serve\\.py\$'"

echo
echo "배포 완료. 롤백 명령(dist, serve.py 둘 다 복원):"
cat <<'EOF'
ssh ax "cd /data/hackathon/web && rm -rf dist && mv dist.prev dist && mv serve.py.prev serve.py && kill \$(pgrep -f '^python3 serve\.py\$'); sleep 1; setsid nohup python3 serve.py >> server.log 2>&1 < /dev/null &"
EOF

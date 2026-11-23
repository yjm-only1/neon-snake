#!/usr/bin/env bash
# 仅发布构建产物 index.html 到公开仓库（源码 / 工具 / 截图一律不上传）。
# 用法：bash tools/publish_site.sh
set -euo pipefail
cd "$(dirname "$0")/.."

python tools/build_single.py

# 用临时 index 构造「只含 index.html」的孤立提交，不改动本地工作区与分支
TMP_INDEX="$(mktemp)"
trap 'rm -f "$TMP_INDEX"' EXIT
GIT_INDEX_FILE="$TMP_INDEX" git read-tree --empty
BLOB="$(git hash-object -w index.html)"
GIT_INDEX_FILE="$TMP_INDEX" git update-index --add --cacheinfo "100644,$BLOB,index.html"
TREE="$(GIT_INDEX_FILE="$TMP_INDEX" git write-tree)"
COMMIT="$(git commit-tree "$TREE" -m "Neon Snake playable site (single-file build)")"

echo "发布提交：$COMMIT（仅 index.html）"
git push --force origin "$COMMIT:main"
echo "已发布：https://yjm-only1.github.io/neon-snake/"
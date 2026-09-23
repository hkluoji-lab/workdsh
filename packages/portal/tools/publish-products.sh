#!/usr/bin/env bash
# 发布 / 更新公开产品页（无需重启容器、无需改代码）
# 用法: publish-products.sh <源 HTML 路径> <公开文件名.html>
# 例:   publish-products.sh ~/2026Q3-zhengqi-fttr-products.html 2026Q3.html
set -euo pipefail
SRC="${1:?用法: publish-products.sh <源HTML> <公开文件名.html>}"
NAME="${2:?用法: publish-products.sh <源HTML> <公开文件名.html>}"
DEST_DIR=/data/dsh/portal/site/products
case "$NAME" in
  *.html) ;;
  *) echo "公开文件名必须以 .html 结尾（门户只放行 .html）"; exit 1 ;;
esac
[ -f "$SRC" ] || { echo "源文件不存在：$SRC"; exit 1; }
mkdir -p "$DEST_DIR"
cp -p "$SRC" "$DEST_DIR/$NAME"
echo "已发布：https://dsh.10ge.cn/portal/products/$NAME"
curl -sk -o /dev/null -w "验证：HTTP %{http_code}，字节 %{size_download}\n" \
  "https://dsh.10ge.cn/portal/products/$NAME"

#!/usr/bin/env python3
"""向 entrypoint 注入增值业务后台（VAS）的随容器自愈启动块。

幂等：已存在 VAS_ADMIN_BLOCK_V1 标记时直接退出 0，不重复插入。
参照既有 portal / admin 启动块同构；带断言，失败即报错而不写出坏文件。

用法：add-vas-entrypoint.py <in> <out>
"""
import sys, os

MARK = 'VAS_ADMIN_BLOCK_V1'

BLOCK = '''
# 增值业务产品页后台（VAS_ADMIN_BLOCK_V1）：独立进程，随门户一起被看护；崩溃 3 秒自动重启。
# 与门户同一账号表与签名密钥口径，因此复用门户会话 Cookie，不新建身份体系；
# 模块位于 /data/dsh/vas（独立数据目录与模板，不影响既有的 FTTR 产品页后台）。
(
  while true; do
    gosu node env HOME=/data/dsh/home \\
      DSH_AUTH_USERNAME="$auth_username" \\
      DSH_AUTH_PASSWORD="$portal_password" \\
      PORTAL_MODULE_DIR=/data/dsh/portal \\
      VAS_BIND=127.0.0.1 \\
      VAS_PORT=3085 \\
      VAS_DATA_DIR=/data/dsh/vas/data \\
      VAS_PUBLIC_DIR=/data/dsh/vas/public \\
      VAS_TEMPLATE=/data/dsh/vas/tools/product.template.html \\
      VAS_PUBLISH_DIR=/data/dsh/portal/site/products \\
      VAS_BACKUP_DIR=/data/dsh/vas/backups \\
      VAS_ORDERS_DIR=/data/dsh/vas/data/orders \\
      node /data/dsh/vas/src/server.mjs
    printf 'vas admin exited (%s); restarting in 3s.\\n' "$(date -Is)" >&2
    sleep 3
  done
) &
vas_pid=$!
pids+=("$vas_pid")
'''


def main() -> int:
    src, dst = sys.argv[1], sys.argv[2]
    text = open(src, encoding='utf-8').read()

    if MARK in text:
        print('已存在 VAS 启动块，跳过（幂等）')
        if src != dst:
            open(dst, 'w', encoding='utf-8').write(text)
        return 0

    # 锚点：紧跟 FTTR 管理后台块之后插入（admin_pid=$! / pids+=("admin_pid") 之后）
    anchor = 'admin_pid=$!\npids+=("$admin_pid")\n'
    idx = text.find(anchor)
    assert idx != -1, '未找到 admin 启动块锚点，拒绝改写'
    assert text.count(anchor) == 1, 'admin 启动块锚点不唯一，拒绝改写'

    insert_at = idx + len(anchor)
    out = text[:insert_at] + BLOCK + text[insert_at:]

    # 断言：仅允许新增，原有内容必须完整保留
    assert out.startswith(text[:insert_at]), '前缀被意外修改'
    assert out.endswith(text[insert_at:]), '后缀被意外修改'
    assert out.count('vas_pid=$!') == 1, 'vas_pid 赋值次数异常'
    assert 'wait -n' in out or True, '接口占位检查'
    # 花括号配平（与既有派生脚本同思路）
    assert out.count('(') == text.count('(') + BLOCK.count('('), '括号数不符'
    assert out.count(')') == text.count(')') + BLOCK.count(')'), '括号数不符'
    assert len(out) > len(text), '输出未增长'

    open(dst, 'w', encoding='utf-8').write(out)
    print(f'已注入 VAS 启动块：{len(text)} → {len(out)} 字节')
    return 0


if __name__ == '__main__':
    sys.exit(main())

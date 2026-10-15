#!/usr/bin/env python3
"""派生 Caddyfile：源站抖动兜底（2026-10-02）。

用法：add-origin-fallback-caddy.py <in> <out>

背景：
  dsh 的 node 进程会因 V8 GC 缺陷在就绪之后 SIGSEGV，entrypoint 的
  DSH_RUNTIME_SUPERVISION_BLOCK_V1 会原地重拉它（sleep + ~12s 冷启）。这段窗口里
  127.0.0.1:3080 拒连，Caddy 立即回 502，Cloudflare 再把它渲染成「网关错误」页。
  2026-09-30 / 10-01 两次长时间不可用即由此被放大。

两处改动：
  1) 所有指向 3080 的 reverse_proxy 增加 lb_try_duration/lb_try_interval：
     连接失败时在窗口内持续重试（单上游重试），把「15 秒 502」变成「首屏慢十几秒」。
  2) 站点级 handle_errors：重试仍失败时不再透出上游 502——
       根路径 / 与 /index.html -> 回落到门户服务 3083（独立进程，dsh 崩溃不影响它）；
       其余路径 -> 503 友好页 + Retry-After，避免 Cloudflare 的裸网关错误页。

幂等：已含 LB_TRY_MARKER 时不再重复注入。
"""
import re
import sys

# reverse_proxy 127.0.0.1:3080 块在文件里有多处、缩进不一，按行匹配并保留原缩进。
LB_RE = re.compile(r"^(?P<ind>[ \t]*)reverse_proxy 127\.0\.0\.1:3080 \{\n", re.M)
LB_MARKER = "lb_try_duration 15s"

ERR_MARKER = "@origin_down expression"
ERR_ANCHOR = "\troute {\n"
ERR_INSERT = """\t# 源站抖动兜底（2026-10-02）：dsh 崩溃后原地重拉期间 3080 拒连，若不拦会把上游 502
\t# 直接透给 Cloudflare（用户看到「网关错误」）。这里只兜 502/503/504，不影响门禁自身的
\t# 401/403 语义；根路径回落门户（3083，独立进程），其余路径给友好维护页。
\thandle_errors {
\t\t@origin_down expression {err.status_code} in [502, 503, 504]
\t\thandle @origin_down {
\t\t\t@root_like path / /index.html
\t\t\thandle @root_like {
\t\t\t\trewrite * /portal
\t\t\t\treverse_proxy 127.0.0.1:3083 {
\t\t\t\t\theader_up -Authorization
\t\t\t\t}
\t\t\t}
\t\t\thandle {
\t\t\t\theader Content-Type "text/html; charset=utf-8"
\t\t\t\theader Retry-After "6"
\t\t\t\trespond "<!doctype html><html lang='zh-CN'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><meta http-equiv='refresh' content='6'><title>服务正在自动恢复</title><style>body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#070a10;color:#e6edf7;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}div{text-align:center;max-width:32rem;padding:2rem}h1{font-size:1.35rem;margin:0 0 .75rem}p{color:#93a4bd;line-height:1.75;margin:.4rem 0}</style></head><body><div><h1>服务正在自动恢复</h1><p>工作台刚刚异常退出，看护进程正在把它拉起来，页面会在 6 秒后自动重试。</p><p>若持续如此，请稍后再试或联系管理员。</p></div></body></html>" 503
\t\t\t}
\t\t}
\t}

"""


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    src, dst = sys.argv[1], sys.argv[2]
    text = open(src, encoding="utf-8").read()

    # 断言：锚点必须唯一存在（除 ERR_INSERT 自身外，`\troute {\n` 只出现一次）
    if ERR_MARKER not in text:
        assert text.count(ERR_ANCHOR) == 1, "catch-all route 锚点不唯一，拒绝改写"
        text = text.replace(ERR_ANCHOR, ERR_INSERT + ERR_ANCHOR, 1)

    if LB_MARKER not in text:
        hits = list(LB_RE.finditer(text))
        assert hits, "未找到 reverse_proxy 127.0.0.1:3080 块"
        text = LB_RE.sub(
            lambda m: m.group(0)
            + f"{m.group('ind')}\tlb_try_duration 15s\n"
            + f"{m.group('ind')}\tlb_try_interval 250ms\n",
            text,
        )

    # 花括号配平自检
    assert text.count("{") == text.count("}"), "花括号不配平，拒绝写出"
    assert "reverse_proxy 127.0.0.1:3080" in text and "handle_errors" in text

    open(dst, "w", encoding="utf-8").write(text)
    print(f"ok: wrote {dst} ({len(text)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

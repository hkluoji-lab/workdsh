#!/usr/bin/env python3
"""把 survey.10ge.cn 发布到公网：Cloudflare DNS CNAME + 隧道 ingress 规则。

幂等；改动前会把隧道配置备份到 /opt/survey-gateway/backup/。

用法：publish-cf.py [--check]     （--check 只打印现状，不做任何修改）
"""
import base64
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

CERT = "/root/.cloudflared/cert.pem"
HOSTNAME = "survey.10ge.cn"
DNS_NAME = "survey"
ORIGIN = "http://127.0.0.1:3092"
TUNNEL = "de305491-d57d-40b0-93ca-bcf592d5a8d5"
TUNNEL_TARGET = TUNNEL + ".cfargotunnel.com"
BACKUP_DIR = "/opt/survey-gateway/backup"

CHECK_ONLY = "--check" in sys.argv


def load_creds():
    text = open(CERT).read()
    m = re.search(r"-----BEGIN ARGO TUNNEL TOKEN-----\s*(.*?)\s*-----END", text, re.S)
    if not m:
        raise SystemExit("cert.pem 中找不到 ARGO TUNNEL TOKEN")
    d = json.loads(base64.b64decode(m.group(1)).decode())
    return d["zoneID"], d["accountID"], d["apiToken"]


def api(method, path, token, body=None):
    url = "https://api.cloudflare.com/client/v4" + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            return json.loads(raw)
        except Exception:
            return {"success": False, "errors": [{"message": f"HTTP {e.code}: {raw[:200]}"}]}


def result_of(resp, what):
    if not resp.get("success"):
        raise SystemExit(f"{what} 失败：{json.dumps(resp.get('errors'), ensure_ascii=False)}")
    return resp["result"]


def main():
    zone, acct, token = load_creds()
    print(f"zone={zone} account={acct} hostname={HOSTNAME} origin={ORIGIN}")
    if CHECK_ONLY:
        print("（--check：只读，不做修改）")

    # ---------------- DNS ----------------
    recs = result_of(
        api("GET", f"/zones/{zone}/dns_records?name={HOSTNAME}", token), "查询 DNS"
    )
    if recs:
        r = recs[0]
        ok = r["type"] == "CNAME" and r["content"] == TUNNEL_TARGET and r.get("proxied")
        print(f"DNS 已存在：{r['type']} {r['content']} proxied={r.get('proxied')} -> {'符合预期' if ok else '需要修正'}")
        if not ok and not CHECK_ONLY:
            result_of(
                api("PUT", f"/zones/{zone}/dns_records/{r['id']}", token, {
                    "type": "CNAME", "name": DNS_NAME, "content": TUNNEL_TARGET,
                    "proxied": True, "ttl": 1,
                }),
                "更新 DNS",
            )
            print("DNS 已修正")
    else:
        print("DNS 不存在")
        if not CHECK_ONLY:
            result_of(
                api("POST", f"/zones/{zone}/dns_records", token, {
                    "type": "CNAME", "name": DNS_NAME, "content": TUNNEL_TARGET,
                    "proxied": True, "ttl": 1, "comment": "agent survey public entry",
                }),
                "创建 DNS",
            )
            print(f"DNS 已创建：CNAME {DNS_NAME} -> {TUNNEL_TARGET} (proxied)")

    # ---------------- 隧道 ingress ----------------
    cfg_resp = result_of(
        api("GET", f"/accounts/{acct}/cfd_tunnel/{TUNNEL}/configurations", token), "读取隧道配置"
    )
    cfg = cfg_resp.get("config") or {}
    ingress = cfg.get("ingress") or []
    before = [r.get("hostname") or "(catch-all)" for r in ingress]
    print("现有 ingress:", " | ".join(before))

    mine = {"hostname": HOSTNAME, "service": ORIGIN}
    existing = next((r for r in ingress if r.get("hostname") == HOSTNAME), None)

    if existing:
        if existing.get("service") == ORIGIN and not existing.get("originRequest"):
            print("隧道规则已存在且正确，无需改动")
            return
        existing.clear()
        existing.update(mine)
        print("隧道规则已更新为", mine)
    else:
        if not ingress or "hostname" in ingress[-1]:
            # 没有兜底规则：直接追加一条兜底，避免影响其它 hostname 的匹配
            ingress.append({"service": "http_status:404"})
        ingress.insert(len(ingress) - 1, mine)
        print("隧道规则已插入（位于兜底规则之前）")

    os.makedirs(BACKUP_DIR, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = os.path.join(BACKUP_DIR, f"tunnel-ingress-backup-{stamp}.json")
    with open(backup, "w", encoding="utf-8") as fh:
        json.dump(cfg_resp.get("config"), fh, ensure_ascii=False, indent=2)
    print("隧道配置已备份 ->", backup)

    if CHECK_ONLY:
        print("（--check：跳过写入）")
        return

    result_of(
        api("PUT", f"/accounts/{acct}/cfd_tunnel/{TUNNEL}/configurations", token, {"config": cfg}),
        "写入隧道配置",
    )
    after = [r.get("hostname") or "(catch-all)" for r in cfg["ingress"]]
    print("写入成功，新 ingress:", " | ".join(after))


if __name__ == "__main__":
    main()

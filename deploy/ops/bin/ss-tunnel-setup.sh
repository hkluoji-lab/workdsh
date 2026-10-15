#!/bin/bash
# 服务器侧: DNAT 7844->443, 让隧道流量以443经路由器passwall代理
for cidr in 198.41.192.0/24 198.41.200.0/24 198.41.201.0/24; do
  iptables -t nat -C OUTPUT -p tcp -d "$cidr" --dport 7844 -j DNAT --to-destination :443 2>/dev/null || \
  iptables -t nat -A OUTPUT -p tcp -d "$cidr" --dport 7844 -j DNAT --to-destination :443 2>/dev/null
done

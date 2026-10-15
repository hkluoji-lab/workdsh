#!/usr/bin/env bash
# apply-c4.sh —— C4（技能/连接器授权判定点）生产上线件
#
# 设计原则与既有的 caddy/备份脚本一致：**本脚本只做「准备（stage）」与「回滚」，
# 不重启容器**。生效必须由宿主机重启（新增 file: 插件行、替换插件 JS 都要重启才进树）。
#
# 顺序不能颠倒（这是本方案唯一的硬约束）：
#   ① vendored 错误文案补丁  ② 基线授权升级为覆盖技能/连接器  ③ 装强制插件
#   ④ 生产补丁层插入 enforce:false  ⑤ 重启  ⑥ 观察  ⑦ 再切 enforce:true
#   原因：若先开拦截而基线还没覆盖这两个域，管理岗位也拿不到 manage → 管理面被一起拦住。
#
# 用法：
#   apply-c4.sh --status                 只看现状（默认）
#   apply-c4.sh --stage                  执行 ①②③④（有备份、幂等、YAML 校验；不重启）
#   apply-c4.sh --set-enforce true|false 只改我们那个块的 enforce 开关（不重启）
#   apply-c4.sh --verify                 重启后的核验：自检 + 授权覆盖 + 最近判定
#   apply-c4.sh --rollback               还原 ①②③④ 的全部改动（不重启）
set -u

LAB=/data/dsh/tools/workdsh-access-lab
PROD_PLUGIN=/data/dsh/tools/workdsh-access-enforce
PROD_BASELINE=/data/dsh/tools/workdsh-grant-baseline/dist/index.js
PATCH=/data/dsh/profiles/web/cordis.patch.yml
STATUS_FILE=/data/dsh/tmp/access-enforce-status.json
BACKUP_ROOT=/data/dsh/backups/c4-rollout
YAML_LIB=/data/dsh/profiles/web/node_modules/js-yaml
MARK_BEGIN='# >>> C4 技能/连接器授权判定点 BEGIN >>>'
MARK_END='# <<< C4 技能/连接器授权判定点 END <<<'

block() {
  local enforce="$1"
  cat <<EOF

$MARK_BEGIN
# 2026-09-29 上线。先 enforce:false 观察真实流量，确认无误后再 --set-enforce true。
# 前置：workdsh-grant-baseline 必须已是覆盖 workdsh-skills / workdsh-connectors 的版本，
#       否则管理岗位也拿不到 manage，管理面会被一起拦住（沙箱已复现过这个失败态）。
- insert:
    - id: workdsh-access-enforce
      name: 'file://$PROD_PLUGIN/dist/index.js'
      config:
        organizationId: local-personal
        siteOwnerPrincipalId: local-user
        enforce: $enforce
        statusFile: $STATUS_FILE
$MARK_END
EOF
}

yaml_check() {
  node -e "
    const yaml=require('$YAML_LIB'); const fs=require('fs');
    try { const d=yaml.load(fs.readFileSync('$PATCH','utf8')); if(!Array.isArray(d)) throw new Error('顶层不是数组');
      console.log('  ✓ YAML 校验通过（顶层数组，'+d.length+' 项）'); }
    catch(e){ console.error('  ✗ YAML 校验失败：'+e.message); process.exit(1); }
  "
}

case "${1:---status}" in
  --status)
    echo "① vendored 错误文案补丁："; bash "$LAB/patch-access-error-messages.sh" --check | sed 's/^/  /'
    echo "② 基线授权："
    echo "     生产 $PROD_BASELINE"
    echo -n "       sha=$(sha256sum "$PROD_BASELINE" 2>/dev/null | cut -c1-16) "
    sha256sum "$PROD_BASELINE" 2>/dev/null | cut -c1-16 | grep -q "$(sha256sum "$LAB/grant-baseline/dist/index.js" | cut -c1-16)" \
      && echo "（= 沙箱扩展版，已升级）" || echo "（未升级，仍是原始版）"
    echo "      沙箱扩展版 sha=$(sha256sum "$LAB/grant-baseline/dist/index.js" | cut -c1-16)"
    echo "③ 强制插件目录： $([ -d "$PROD_PLUGIN" ] && echo "已安装 $PROD_PLUGIN" || echo "未安装")"
    echo "④ 生产补丁层块： $(grep -qF "$MARK_BEGIN" "$PATCH" && grep -A9 -F "$MARK_BEGIN" "$PATCH" | grep -m1 'enforce:' | sed 's/^ *//' || echo '未插入')"
    echo "   重启后的自检文件： $([ -f "$STATUS_FILE" ] && echo "$STATUS_FILE" || echo '（尚未生成，说明还没重启过）')"
    ;;

  --stage)
    ts=$(date +%Y%m%d%H%M%S); bk="$BACKUP_ROOT/$ts"; mkdir -p "$bk"
    echo "备份目录：$bk"
    echo; echo "① vendored 错误文案补丁"
    bash "$LAB/patch-access-error-messages.sh" | sed 's/^/  /'
    echo; echo "② 升级基线授权（覆盖技能/连接器）"
    [ -f "$PROD_BASELINE" ] && cp -p "$PROD_BASELINE" "$bk/grant-baseline.index.js" && echo "  已备份原文件 → $bk/grant-baseline.index.js"
    cp -p "$LAB/grant-baseline/dist/index.js" "$PROD_BASELINE" && echo "  已替换：$(sha256sum "$PROD_BASELINE" | cut -c1-16)"
    echo; echo "③ 安装强制插件"
    [ -d "$PROD_PLUGIN" ] && cp -a "$PROD_PLUGIN" "$bk/workdsh-access-enforce.dir" && echo "  已备份旧插件目录"
    rm -rf "$PROD_PLUGIN"; cp -a "$LAB/access-enforce" "$PROD_PLUGIN" && echo "  已安装 → $PROD_PLUGIN"
    echo; echo "④ 生产补丁层插入（enforce: false）"
    cp -p "$PATCH" "$bk/cordis.patch.yml"
    if grep -qF "$MARK_BEGIN" "$PATCH"; then
      echo "  已存在我们的块，跳过插入（幂等）"
    else
      printf '\n' >> "$PATCH"; block false >> "$PATCH"
      echo "  已插入（备份：$bk/cordis.patch.yml）"
    fi
    yaml_check
    echo; echo "—— 下一步（宿主机）——"
    echo "  docker restart dsh      # 约 1 分钟中断；生效后跑 --verify"
    ;;

  --set-enforce)
    want="${2:-}"; case "$want" in true|false) ;; *) echo "用法：$0 --set-enforce true|false" >&2; exit 1;; esac
    grep -qF "$MARK_BEGIN" "$PATCH" || { echo "生产补丁层还没有我们的块，请先 --stage" >&2; exit 1; }
    ts=$(date +%Y%m%d%H%M%S); mkdir -p "$BACKUP_ROOT/$ts"; cp -p "$PATCH" "$BACKUP_ROOT/$ts/cordis.patch.yml"
    node -e "
      const fs=require('fs'); const p='$PATCH';
      const lines=fs.readFileSync(p,'utf8').split('\n');
      const b=lines.findIndex(l=>l.includes('$MARK_BEGIN')), e=lines.findIndex(l=>l.includes('$MARK_END'));
      if(b<0||e<0||e<b){console.error('块边界异常');process.exit(1)}
      let n=0;
      for(let i=b;i<=e;i++){ if(/^\s*enforce: (true|false)\s*$/.test(lines[i])){ lines[i]=lines[i].replace(/enforce: (true|false)/,'enforce: $want'); n++; } }
      if(n!==1){console.error('块内 enforce 行数异常：'+n);process.exit(1)}
      fs.writeFileSync(p,lines.join('\n')); console.log('  已设为 enforce: $want（备份 $BACKUP_ROOT/$ts/）');
    " || exit 1
    yaml_check
    echo "  需重启容器生效：docker restart dsh"
    ;;

  --verify)
    echo "自检状态文件："
    node -e "
      try { const j=JSON.parse(require('fs').readFileSync('$STATUS_FILE','utf8'));
        console.log('  enforce =', j.enforce, '| wrapped =', j.wrapped.length, '| missing =', j.missing.length, '| failed =', j.failed.length);
        if (j.missing.length||j.failed.length) console.log('  **有未包装项**：', JSON.stringify({missing:j.missing,failed:j.failed}));
        const d=j.decisions; console.log('  最近判定：allow=', d.filter(x=>x.effect==='allow').length, ' deny=', d.filter(x=>x.effect==='deny').length);
        for (const x of d.slice(-3)) console.log('    ·', x.key, x.domain+'/'+x.id, '→', x.effect ?? x.error, '('+x.principalId+')');
      } catch(e){ console.log('  读不到（可能还没重启）：'+e.message) }
    "
    echo; echo "授权覆盖（生产 storages）："
    node -e "
      const fs=require('fs'),path=require('path');
      const root='/data/dsh/storages/workdsh_access';
      const out={}; const walk=(d)=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name); if(e.isDirectory())walk(f); else if(e.name.endsWith('.json')){try{const r=(JSON.parse(fs.readFileSync(f,'utf8')).record??{}); if(r.resource){const k=r.resource.domain; out[k]=out[k]||{n:0,ids:new Set(),mgr:new Set()}; out[k].n++; out[k].ids.add(r.resource.id); if((r.actions||[]).includes('manage')) out[k].mgr.add(r.subjectPrincipalId);}}catch{}}}};
      try{walk(root)}catch(e){console.log('  读不到授权存储：'+e.message);process.exit(0)}
      for(const [k,v] of Object.entries(out)) console.log('  '+k.padEnd(20)+' grants='+String(v.n).padEnd(5)+'资源='+String(v.ids.size).padEnd(4)+'manage='+[...v.mgr].join(','));
    "
    echo; echo "提醒：拦截轮（enforce=true）的拒绝/放行矩阵已在沙箱验证（两轮各 18/18），生产侧不重复跑签名探针。"
    ;;

  --rollback)
    echo "还原 C4 上线改动（不重启）："
    bash "$LAB/patch-access-error-messages.sh" --revert | sed 's/^/  /'
    latest=$(ls -1d "$BACKUP_ROOT"/*/ 2>/dev/null | sort | tail -1)
    if [ -n "${latest:-}" ]; then
      [ -f "$latest/cordis.patch.yml" ] && cp -p "$latest/cordis.patch.yml" "$PATCH" && echo "  已还原生产补丁层 ← $latest"
      [ -f "$latest/grant-baseline.index.js" ] && cp -p "$latest/grant-baseline.index.js" "$PROD_BASELINE" && echo "  已还原基线授权 ← $latest"
      echo "  备份目录：$latest"
    else
      echo "  找不到备份目录（$BACKUP_ROOT），未动补丁层与基线" >&2
    fi
    [ -d "$PROD_PLUGIN" ] && rm -rf "$PROD_PLUGIN" && echo "  已移除强制插件目录"
    echo "  需重启容器生效：docker restart dsh"
    ;;

  *) echo "用法：$0 --status|--stage|--set-enforce true|false|--verify|--rollback" >&2; exit 1 ;;
esac

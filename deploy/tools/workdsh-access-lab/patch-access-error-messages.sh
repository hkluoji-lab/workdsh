#!/usr/bin/env bash
# vendored 补丁 —— 让「无权限」不再显示成「请重试」（C4 上线的最后一块体验）
#
# 背景（实测两个插件的判定条件不同）：
#   · workdsh-plugin-connectors：`known.has(cause.message)` —— 整条 message 必须**等于**
#     已知码，否则退化成 connector/internal +「连接器操作失败，请重试。」
#   · workdsh-plugin-skills：`message.startsWith('skill/')` 即错误码，但 messages 表里没有
#     我们的码，于是显示兜底的「技能操作失败，请重试。」
# 两处都在共享 node_modules 里（沙箱与生产共用），所以做成**带哈希守卫、可回滚**的补丁：
#   · 执行前核对基线 sha256，不匹配就**拒绝执行**（包版本变了必须重新评估，绝不盲目覆盖）
#   · 执行前整文件备份到 /data/dsh/backups/vendor-patches/<时间戳>/，且备份名带路径标签
#     （两个文件同名 connection-api.js —— 曾经因此互相覆盖并还原错文件，见 tag 字段）
#   · 幂等：已打过则直接报告，不重复插入
#   · --revert 从最近一次备份还原
#
# 用法：
#   patch-access-error-messages.sh            # 应用（幂等）
#   patch-access-error-messages.sh --check    # 只看状态，不改动
#   patch-access-error-messages.sh --revert   # 还原最近一次备份
set -u

NM=/data/dsh/profiles/web/node_modules
BACKUP_ROOT=/data/dsh/backups/vendor-patches
MODE="${1:-apply}"

CONN="$NM/workdsh-plugin-connectors/dist/connection-api.js"
SKILL="$NM/workdsh-plugin-skills/dist/services/connection-api.js"
CONN_SHA="d3abb8c87b13b00bf55500759a40e2182ebe3d3627c0020649d0ac6051a4f69d"
SKILL_SHA="02cf58438cb9c8d9bb119911934515c190c0cc4f430da221ed52b3ad3e2c5ba8"

export CONN SKILL CONN_SHA SKILL_SHA BACKUP_ROOT MODE

node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const { CONN, SKILL, CONN_SHA, SKILL_SHA, BACKUP_ROOT, MODE } = process.env
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex')

const TARGETS = [
  {
    file: CONN, base: CONN_SHA, tag: 'connectors__connection-api.js', marker: "'connector/access-not-granted'",
    edits: [
      {
        name: '把新码加入 known 集合',
        from: "const known = new Set(['connector/not-found', 'connector/command-required', 'connector/url-required', 'connector/server-name-conflict']);",
        to: "const known = new Set(['connector/not-found', 'connector/command-required', 'connector/url-required', 'connector/server-name-conflict', 'connector/access-not-granted']);",
      },
      {
        name: '为新码补文案',
        from: "const messages = { 'connector/not-found': '未找到该连接器。',",
        to: "const messages = { 'connector/access-not-granted': '当前账号没有管理该连接器的权限，请联系管理员。', 'connector/not-found': '未找到该连接器。',",
      },
    ],
  },
  {
    file: SKILL, base: SKILL_SHA, tag: 'skills__connection-api.js', marker: "'skill/access-not-granted'",
    edits: [
      {
        name: '为新码补文案',
        from: "const messages = {\n        'skill/invalid-name': '技能名称无效。',",
        to: "const messages = {\n        'skill/access-not-granted': '当前账号没有管理该技能的权限，请联系管理员。',\n        'skill/invalid-name': '技能名称无效。',",
      },
    ],
  },
]

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
const backupDir = join(BACKUP_ROOT, stamp)

if (MODE === '--check' || MODE === 'check') {
  for (const t of TARGETS) {
    const text = readFileSync(t.file, 'utf8')
    const patched = text.includes(t.marker)
    console.log(`  ${t.tag}: ${patched ? '已打补丁' : '未打补丁'} | sha=${sha(t.file).slice(0, 16)} | 基线${sha(t.file) === t.base ? '一致' : '**不一致**'}`)
  }
  process.exit(0)
}

if (MODE === '--revert' || MODE === 'revert') {
  const dirs = existsSync(BACKUP_ROOT) ? readdirSync(BACKUP_ROOT).sort() : []
  if (!dirs.length) { console.error('没有可还原的备份'); process.exit(1) }
  const latest = join(BACKUP_ROOT, dirs[dirs.length - 1])
  let n = 0
  for (const t of TARGETS) {
    const src = join(latest, t.tag)
    if (!existsSync(src)) continue
    copyFileSync(src, t.file)
    n += 1
    console.log(`  已还原 ${t.file}（sha=${sha(t.file).slice(0, 16)}）`)
  }
  console.log(`从 ${latest} 还原了 ${n} 个文件`)
  process.exit(0)
}

// apply
mkdirSync(backupDir, { recursive: true })
let changed = 0
for (const t of TARGETS) {
  const text = readFileSync(t.file, 'utf8')
  if (text.includes(t.marker)) { console.log(`  跳过（已打过）：${t.tag}`); continue }
  const actual = sha(t.file)
  if (actual !== t.base) {
    console.error(`  拒绝执行：${t.tag} 的 sha256 与基线不符`)
    console.error(`    期望 ${t.base}`)
    console.error(`    实际 ${actual}`)
    console.error('  包版本可能已变，请重新评估补丁锚点后再执行。')
    process.exit(1)
  }
  copyFileSync(t.file, join(backupDir, t.tag))
  let next = text
  for (const e of t.edits) {
    const hits = next.split(e.from).length - 1
    if (hits !== 1) { console.error(`  锚点不唯一（${hits} 次），中止：${e.name} @ ${t.tag}`); process.exit(1) }
    next = next.replace(e.from, e.to)
  }
  writeFileSync(t.file, next)
  changed += 1
  console.log(`  已打补丁 ${t.tag}（新 sha=${sha(t.file).slice(0, 16)}）`)
}
console.log(changed ? `完成，备份在 ${backupDir}` : '无需改动（全部已是打过补丁的状态）')
NODE

# 语法自检：补丁必须不破坏可加载性
if [ "$MODE" != "--revert" ] && [ "$MODE" != "revert" ] && [ "$MODE" != "--check" ] && [ "$MODE" != "check" ]; then
  for f in "$CONN" "$SKILL"; do
    node --check "$f" >/dev/null 2>&1 && echo "  ✓ 语法通过 $(basename "$f")" || { echo "  ✗ 语法失败 $(basename "$f")，请立即 --revert" >&2; exit 1; }
  done
fi

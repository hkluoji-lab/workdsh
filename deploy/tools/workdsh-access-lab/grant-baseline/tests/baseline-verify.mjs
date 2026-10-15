// 基线授权迁移 + 授权判定 的端到端验证（对着沙箱实例跑）。
//
// 验证的是一条完整的因果链，而不是某个函数：
//   ① 撤销基线 grant → 门户账号对既有资源被拒（access/not-granted）  ← 复现 P1 硬阻塞
//   ② 以所有者身份签发 read/use 基线 grant（dry-run → apply）
//   ③ 迁移后：同一账号同一资源被放行（access/explicit-grant）        ← 证明修法有效
//   ④ 重跑迁移：全部 unchanged，不重复写盘                            ← 幂等
//   ⑤ manage 仍未授权，依然被拒                                       ← 最小权限没有被放宽
//
// 顺序很重要：必须先撤销再用探针判定，否则断言会依赖上一次执行留下的状态。
//
// 运行：BASE=http://127.0.0.1:3099 node tests/baseline-verify.mjs
const BASE = process.env.BASE ?? 'http://127.0.0.1:3099';
const { writeFileSync, rmSync, readFileSync } = await import('node:fs');

let pass = 0;
let fail = 0;
const ok = (name, condition, extra = '') => {
  if (condition) { pass += 1; console.log(`  PASS ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}  ${extra}`); }
};

const get = async (path) => {
  const response = await fetch(`${BASE}${path}`, { redirect: 'manual' });
  return response.json();
};

try {
  console.log('[0] 前置：探针与迁移工具都在');
  const ping = await get('/workdsh-access-probe/run?action=read');
  ok('探针可用', ping?.ok === true, JSON.stringify(ping?.error ?? ping));
  ok('被测账号是组织活跃成员', ping?.subjectMembership === 'active', ping?.subjectMembership);
  ok('所有者 local-user 始终放行（对照）', ping?.asOwner?.code === 'access/resource-owner',
    JSON.stringify(ping?.asOwner));

  console.log('\n[1] 撤销基线授权 → 复现阻塞：既有资源对门户账号被拒');
  const revoked = await get('/workdsh-access-probe/run?revoke=1');
  ok('撤销链路可用（回滚要用）', Array.isArray(revoked?.revoked) && (revoked?.revokeErrors?.length ?? 0) === 0,
    JSON.stringify(revoked?.revokeErrors ?? revoked?.error));
  ok('撤销后：read → deny / access/not-granted',
    revoked?.afterRevoke_asSubject?.effect === "deny"
    && revoked?.afterRevoke_asSubject?.code === "access/not-granted",
    JSON.stringify(revoked?.afterRevoke_asSubject));

  console.log('\n[2] 迁移：dry-run 不写盘');
  const dry = await get('/workdsh-grant-baseline/run');
  ok('dry-run 模式', dry?.mode === 'dry-run');
  ok('枚举到站点资源', (dry?.counts?.resources ?? 0) > 0, String(dry?.counts?.resources));
  ok('给出了计划条数', (dry?.counts?.planned ?? 0) > 0, String(dry?.counts?.planned));
  ok('dry-run 未创建任何 grant', dry?.counts?.created === 0, String(dry?.counts?.created));

  console.log('\n[3] 迁移：apply 幂等');
  const first = await get('/workdsh-grant-baseline/run?apply=1');
  ok('apply 无失败', first?.counts?.failed === 0, JSON.stringify(first?.errors));
  const second = await get('/workdsh-grant-baseline/run?apply=1');
  ok('重跑 apply：全部 unchanged', second?.counts?.unchanged === second?.counts?.planned,
    `unchanged=${second?.counts?.unchanged} planned=${second?.counts?.planned}`);
  ok('重跑 apply：没有新增', second?.counts?.created === 0, String(second?.counts?.created));
  ok('重跑 apply：没有改写', second?.counts?.updated === 0, String(second?.counts?.updated));

  console.log('\n[4] 迁移后：同一账号同一资源被放行');
  const afterRead = await get('/workdsh-access-probe/run?action=read');
  ok('read → allow / access/explicit-grant', afterRead?.asSubject?.effect === 'allow'
    && afterRead?.asSubject?.code === 'access/explicit-grant',
    JSON.stringify(afterRead?.asSubject));
  const afterUse = await get('/workdsh-access-probe/run?action=use');
  ok('use → allow', afterUse?.asSubject?.effect === 'allow',
    JSON.stringify(afterUse?.asSubject));

  console.log('\n[5] 最小权限：未授予的动作仍然被拒');
  const afterManage = await get('/workdsh-access-probe/run?action=manage');
  ok('manage → deny（基线只给 read/use）', afterManage?.asSubject?.effect === 'deny',
    JSON.stringify(afterManage?.asSubject));
  ok('manage 拒绝理由是 not-granted', afterManage?.asSubject?.code === 'access/not-granted',
    afterManage?.asSubject?.code);

  console.log('\n[6] 缺口2：持续收敛（新资源 / 新成员不必等人工再跑一次）');
  const status = await get('/workdsh-grant-baseline/status');
  ok('ensure 循环已启动', status?.state?.timerActive === true, JSON.stringify(status?.state));
  ok('watch 到 domain/changed（即时触发的入口存在）', typeof status?.config?.watchedDomains === 'string'
    && status.config.watchedDomains.length > 0, status?.config?.watchedDomains);

  // 造一条"站点所有者新建的资源"，模拟管理员新发布一个专家。
  const newId = `expert-converge-${Date.now().toString(36)}`;
  const expertsDir = process.env.EXPERTS_DIR ?? '/data/dsh/tmp/p1sandbox-home/storages/workdsh_experts/experts';
  writeFileSync(`${expertsDir}/${newId}.json`, JSON.stringify({
    version: 1,
    record: {
      id: newId,
      revision: `r-${newId}`,
      name: '收敛探针',
      owner: { organizationId: 'local-personal', ownerPrincipalId: 'local-user', scope: 'personal' },
    },
  }, null, 2));

  const beforeNew = await get(`/workdsh-access-probe/run?subject=portal:alice&resourceId=${newId}`);
  ok('新资源刚出现时成员无权限', beforeNew?.asSubject?.code === 'access/not-granted',
    JSON.stringify(beforeNew?.asSubject));

  const converged = await get('/workdsh-grant-baseline/run?apply=1');
  ok('收敛轮次把新资源算进去了', (converged?.counts?.resources ?? 0) >= 1, JSON.stringify(converged?.counts));
  ok('收敛轮次确实写了盘（created+updated > 0）',
    (converged?.counts?.created ?? 0) + (converged?.counts?.updated ?? 0) > 0,
    JSON.stringify(converged?.counts));

  const afterNew = await get(`/workdsh-access-probe/run?subject=portal:alice&resourceId=${newId}`);
  ok('新资源在成员侧变为放行', afterNew?.asSubject?.code === 'access/explicit-grant',
    JSON.stringify(afterNew?.asSubject));

  const again = await get('/workdsh-grant-baseline/run?apply=1');
  ok('再收敛一次：pending 归零（幂等）', again?.counts?.pending === 0, JSON.stringify(again?.counts));
  ok('再收敛一次：没有新增授权', again?.counts?.created === 0, String(again?.counts?.created));

  rmSync(`${expertsDir}/${newId}.json`, { force: true });

  console.log('\n[7] 岗位角色决定 manage，且降级后会被真正回收');
  const rosterFile = process.env.ROSTER ?? '/data/dsh/tmp/p1sandbox-home/principals.json';
  const probe = process.env.PROBE_SUBJECT ?? 'portal:bob';
  const fixtureResource = 'document-review-advisor';
  const setRole = (jobRole) => {
    const parsed = JSON.parse(readFileSync(rosterFile, 'utf8'));
    for (const entry of parsed.principals ?? []) {
      if (entry.principalId === probe) entry.jobRole = jobRole;
    }
    writeFileSync(rosterFile, `${JSON.stringify(parsed, null, 2)}\n`);
  };
  const askManage = async () => (await get(
    `/workdsh-access-probe/run?subject=${encodeURIComponent(probe)}&action=manage&resourceId=${fixtureResource}`,
  ))?.asSubject;
  const askRead = async () => (await get(
    `/workdsh-access-probe/run?subject=${encodeURIComponent(probe)}&action=read&resourceId=${fixtureResource}`,
  ))?.asSubject;

  setRole('management');
  await get('/workdsh-grant-baseline/run?apply=1');
  const asManager = await askManage();
  ok('管理岗位 → manage 放行', asManager?.effect === 'allow', JSON.stringify(asManager));
  ok('管理岗位 → read 仍放行', (await askRead())?.effect === 'allow');

  setRole('sales');
  const before = await askManage();
  ok('降级那一刻旧授权还在（说明必须靠收敛回收）', before?.effect === 'allow', JSON.stringify(before));
  const demoted = await get('/workdsh-grant-baseline/run?apply=1');
  ok('收敛轮次回收了降级后的旧授权', (demoted?.counts?.pruned ?? 0) > 0, JSON.stringify(demoted?.counts));
  const demotedManage = await askManage();
  ok('降级后 manage 被拒（权限不是只增不减）', demotedManage?.effect === 'deny', JSON.stringify(demotedManage));
  const demotedRead = await askRead();
  ok('降级后 read 仍放行（成员基线还在）', demotedRead?.effect === 'allow', JSON.stringify(demotedRead));

  // 复原，避免影响后续手动实验
  setRole('management');
  await get('/workdsh-grant-baseline/run?apply=1');
} catch (error) {
  fail += 1;
  console.log(`  FAIL 运行异常  ${error?.message ?? error}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

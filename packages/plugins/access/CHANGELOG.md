## 0.1.0-alpha.6 — 2026-10-15

- P1-15 批 1（access 域收敛，[ADR-0035](../../../docs/adr/0035-online-plugin-ownership-consolidation.md)）：把线上 `deploy/tools/` 四件手写插件按业务所有权并入本模块，不新建 npm 包。
- 新增 Host 服务子入口 `./grant-admin`（面板「资源授权」后端：门户签名鉴权、岗位门槛、资源摘要、授权签发与撤销）、`./grant-baseline`（基线 grant 一次性迁移 + 持续幂等收敛，**默认 dry-run**，可回收自己签发且已不在计划内的授权）、`./access-enforce`（在技能与连接器的破坏性方法上做运行时授权判定，判定异常一律放行并记 decisions）。
- 三者由模块 `cordis.patch.yml` 的 `dsh.bundle.patch` 声明（`insert` 6 条），取代 `deploy/tools/workdsh-access-lab/apply-c4.sh` 现场生成 loader 块。
- 新增 `src/host/portal-signature.ts`：门户身份签名协议的同构内建副本（ADR-0019 自包含要求），唯一真源为 `workdsh-contracts/portal-identity`；`tests/portal-signature.test.mjs` 逐向量交叉校验两端同值，守护「签名静默恒失败」风险。
- 新增仓库内测试 5 个文件共 21 条用例，等价迁移自线上 `verify-enforce.mjs`、`baseline-verify.mjs` 与 `workdsh-access-probe` 探针；`package.json` 新增 `test` 脚本与 `@deepseek-ai/dsh-host-webserver`（peer `optional` + devDep 精确 `0.2.1-alpha.2`）、`@deepseek-ai/schemastery` devDep。
- 未部署；`deploy/tools/` 四件尚未删除（前置＝线上引用已切换）。未验证：新服务在真实 Loader/Profile 下的加载与路由可达性、`domain/changed` 触发路径（仓库内暂无发出方）、`ctx.logger` 占位符的运行时输出格式。

## 0.1.0-alpha.5 — 2026-09-15

- 将 Session、Storage Domain 与工具授权边界适配到 DeepSeek Harness 0.1.6-alpha.1。
- 配套官方 Team 专家执行链路，保留既有主体、资源授权与审计边界。

# 0.1.0-alpha.3

## 0.1.0-alpha.4 — 2026-09-12

- 单个专家 alpha.1 配套：独立 Host 组合、共享 Skill 修订与受控任务入口。
- Companion for Experts alpha.1: standalone Host composition, shared Skill revisions and governed task entry points.


- 增加 `workdshSessionAccess` 受控 Host 入口，在调用官方 Session Controller 创建前持久绑定稳定 owner。
- Session 恢复在激活官方 Agent 前重新检查当前成员关系和 grant，拒绝请求不会触达 Controller。
- 创建失败保留不可替换的 owner 预留，允许同一主体安全重试并阻止其他主体接管 Session id。
- 显式 Session id 在首次绑定前使用官方冷读 `inspect()` 排除已存在但无 owner 的会话，阻止历史会话被补绑接管。

# 0.1.0-alpha.2

- 增加独立 Storage Domain 保存不可替换的 Session owner binding，冷重启后仍可解析当前 RuntimeBinding。
- 增加官方工具流水线桥接：`tools/pre-execute` 执行 Host 身份解析与授权，`tools/result` 观察最终结果，`session/flush` 排空审计。
- 个人 Profile 可在首次 Agent 工具调用时安全自动绑定；企业式组合可关闭自动绑定并要求创建入口显式登记。

# 0.1.0-alpha.1

- 增加持久化 `AccessService` Cordis Host 服务和操作级授权判定。
- 跨组织默认拒绝；资源 owner、成员资格和显式 grant 分别检查。
- 增加带预期修订的授权与撤权管理，并将判定和修改写入审计服务。

最新用户决定：许可证文本收集缺项不作为本次发布准备阻塞，README已补项目引用及声明许可证，完整Office打包依赖清单已保存。已有notice不移除；报告仍如实保留缺项，不宣称正文收集已通过。

最新提交准备：experts alpha.2 / skills alpha.28 / contracts alpha.7 / activity alpha.1；本次源码包含协作栏状态刷新。旧目录候选仍保留，最新重打包目录为 `.artifacts/release-submit-2026-09-14`，以该目录清单为准。尚未对外发布。

# 2026-09-14 本地发布候选

注意：顶部团队场景栏的后续56px/成员组成改动晚于本候选打包；候选包不含该最新改动，发布前必须重打包。

状态：已准备本地安装包与说明，未创建公开 Release、未提交/推送、未发布 npm。不是稳定版，不能覆盖历史同版本安装包。

## 更新内容

- 独立活动插件：普通问答、技能、专家、团队的顶部工作动态；宽屏半宽居中、46px单行，运行时彩色边框流动，动画开关持久化及减少动态效果支持。
- 专家/专家团详情：能力、任务示例、主理人与成员，草稿和已发布修订分离。
- 修复普通对话默认误用内部专家preset，以及召唤后的名称退回内部ID。
- README保存三张用户原始应用截图，区分当前开发候选与历史下载包。团队截图为0个子代理，不作为多成员执行验收证据。

## 候选制品

目录：`.artifacts/release-candidate-2026-09-14/`。8个独立tgz，配套 `SHA256SUMS.txt` 与 `release-manifest.json`。包由本次完整build后使用官方pnpm pack生成；清单记录源HEAD、未提交状态、大小及SHA256，不把源HEAD冒充干净发布提交。

| 包 | 当前候选版本 | 制品 |
| --- | --- | --- |
| workdsh-provider-identity-local | 0.1.0-alpha.4 | workdsh-provider-identity-local-0.1.0-alpha.4.tgz |
| workdsh-plugin-audit | 0.1.0-alpha.3 | workdsh-plugin-audit-0.1.0-alpha.3.tgz |
| workdsh-plugin-access | 0.1.0-alpha.4 | workdsh-plugin-access-0.1.0-alpha.4.tgz |
| workdsh-plugin-skills | 0.1.0-alpha.27 | workdsh-plugin-skills-0.1.0-alpha.27.tgz |
| workdsh-plugin-experts | 0.1.0-alpha.1 | workdsh-plugin-experts-0.1.0-alpha.1.tgz |
| workdsh-plugin-office | 0.1.0-alpha.3 | workdsh-plugin-office-0.1.0-alpha.3.tgz |
| workdsh-plugin-activity | 0.1.0-alpha.1 | workdsh-plugin-activity-0.1.0-alpha.1.tgz |
| workdsh-bundle | 0.1.0-alpha.40 | workdsh-bundle-0.1.0-alpha.40.tgz |

## 发布前待处理

1. 审查并固定本次所有未提交/未跟踪源码和资源。共享工作区仍有其他开发变更；不得把不完整变更夹带为已验收能力。
2. 每个变更模块分配尚未发布的版本及独立tag，按精确配套版本重打包。当前制品保留工作区版本，不能上传覆盖历史alpha同名包。
3. Office报告10项许可证文本收集缺项；用户要求不作为本次阻塞，改为README依赖引用说明并保留已有notice。
4. 使用新版本制品在独立官方Profile完成完整组合安装、冷启动与移除回归；本次候选尚未执行。此前活动插件隔离与停用证据不替代全部新制品验收。
5. 专家团TM-01仍待整体验收；真实付费模型、多平台测试本次未执行。可发布明确范围的alpha，不能宣称完整专家团已通过。

许可证文本缺项（源为 `packages/plugins/office/dist/license-review.json`）：

- `@ai-sdk/provider-utils@5.0.0`
- `@ai-sdk/provider-utils@5.0.28`
- `@nodable/entities@3.0.0`
- `@pdf-lib/fontkit@1.1.1`
- `franc-min@6.2.0`
- `ot-json1@1.0.2`
- `ot-text-unicode@4.0.0`
- `pptx-viewer-mcp@2.5.1`
- `react-remove-scroll-bar@2.3.8`
- `unicount@1.1.0`

## 验证记录

完整build通过；集成回归、活动投影测试、计划完整性结果见 `docs/STATUS.md` 与 `/tmp/workdsh-release-candidate-*.log`。打包不自动安装或重启用户preview。

## 安装路径

发布版本确定并完成上述准入后，在停止的专用官方Harness0.1.5-rc.1 Web Profile中，经 `dsh plugin --profile <profile> add /absolute/path/<package>.tgz` 安装。基础身份/审计/授权、Skill、专家、Office、活动及可选展示bundle为独立插件；按已验证配套顺序装配后冷启动。不要把GitHub源代码zip当成插件安装包。保持用户对象/修订和历史会话，不覆盖用户Profile。

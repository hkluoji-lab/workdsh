# D02 基础插件与工作台 0.1

日期：2026-09-12。状态：进行中。

## 已具备的前置基础

- P1-09 的本地单用户基线已完成：可信 local identity、个人组织、资源 owner/access、持久审计、Session owner/runtime binding 和官方工具 guard。
- D01 已验证官方 Host/Client、Storage Domain、Skill、Session、Conversation、Connection exact Fetch 与插件生命周期边界。
- 企业认证、多人 Remote、撤权取消、隔离 Worker、企业服务端和管理 Web 已移入[企业版架构说明](../ENTERPRISE-EDITION.md)，不进入 D02 本地验收。

## 当前工作

D02 只收口 P1-01 的工作台和共享 UI `0.1`：在 Harness 官方 Sidebar、Workspace、Session 与 Conversation 所有权下提供 WorkDSH 业务导航、真实状态和公共展示组件，并保持本地身份、授权与审计服务可由后续领域插件复用。

## 退出条件

- 工作台不复制 Harness 的 Sidebar、Composer、Session 或 Workspace 行为。
- 页面入口、空状态、加载、失败、重试和卸载清理有真实行为及验证。
- 公共 UI 组件只负责展示与交互，不直接访问领域存储或 Host 服务。
- build、typecheck、相关集成与真实打包浏览器验收通过后，D02 才能完成。


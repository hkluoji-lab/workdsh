# 0.1.0-alpha.6 — 2026-09-15

- 适配 DeepSeek Harness `0.1.7-alpha.1`（2026-09-25，并入本未发布增量，不单独 bump）：`styles/tokens.ts` 的 7 个别名收敛为裸 `var(--dsw-*)`，`modal.ts` / `navigation.ts` 清除硬编码 fallback。口径：名字须属 0.1.7 官方词表（361 名）**且**在官方 light 基态有声明，全树 fallback-free，由新增门禁 `probe:theme` 双向断言。
- 统一共享 Modal 的紧凑层级、关闭按钮、滚动区、底部操作栏和窄屏边界。

# 0.1.0-alpha.5

- Icon 图标集新增 `back` 左向返回图标，供独立列表页（技能「我安装的」页等）的返回入口使用；24×24、1.7px 描边约定不变。

# 0.1.0-alpha.4

- 将公开入口改为纯 TypeScript barrel，拆分 Icon、导航组件、主题令牌、导航样式和 Modal 样式。
- 新增跨平台 WorkDSH LogoMark，供 Harness 品牌 Slot 和其他插件复用。
- 保持既有导出和 CSS class 兼容，继续由 Harness 官方 renderer 渲染。

# 0.1.0-alpha.3

- 公共组件源码迁移为 TSX。
- 新增带 Escape、遮罩关闭、焦点返回和焦点约束的共享 Modal，供技能、专家、连接器与行业应用复用。

# 0.1.0-alpha.1

Icon、IconButton、NavItem、NavGroup、主题令牌和导航样式。纯展示，无 Host、账号、数据库或执行状态。

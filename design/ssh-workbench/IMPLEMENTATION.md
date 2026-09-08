# SSH Desktop 实现决策

2026-09-08 · 首个可运行闭环

- 不修改 upstream。SSH 作为 Desktop-owned Host 插件，以独立包导出子路径内置到默认 bundle；先 Beta 验证再同步稳定包。
- 复用 Web carrier 的 HTTP/WebSocket 与 Connection 请求认证。仅允许本机回环请求，写操作/升级额外检查 Origin；SSH 会话使用随机 ID，不信任 renderer 的“当前主机”。
- SSH 协议用 ssh2，终端展示用 xterm.js。远程 PTY 由 ssh2 的 shell 通道创建，不把系统 ssh 子进程或 Harness 本地 Agent 终端当作用户 SSH 会话。
- 首次连接先取得指纹并终止握手，用户核对后再提交认证；连接阶段再次严格比对指纹。口令与私钥不写入普通配置或日志。
- SFTP 复用对应连接，上传首版拒绝覆盖同名文件，避免竞态导致静默覆盖；流式传输并在失败时清理本次创建的未完成文件。大文件不转为 Base64 JSON。
- 内存、消息大小、连接数量和握手时间有界；关闭 WebSocket 或插件 generation 时关闭相应 SSH 连接。
- 原有兼容模式继续使用官方 UI；增强/扩展模式提供 SSH 工作区入口。SSH 页面通过同源静态资源加载，使用默认 Host 插件服务。
- 首版不把 AI 预置回复作为真实能力。模型/Agent 上下文桥接、本地 PTY、持久凭据、覆盖冲突与编辑版本检测作为后续明确阶段。

替代方案：系统 ssh 子进程对已有 ssh_config 兼容更好，但跨平台口令输入、主机验证与 SFTP 任务管理需要额外适配；本阶段选择统一的 Node SSH 客户端。WebSocket 相比轮询更适合交互终端，需要同时实现背压与断开清理。

发布前需验证 Beta 与稳定包、变体一致性、打包闭包和本地 SSH 集成测试。真实安装包构建不等同于签名、公证或对外发布。

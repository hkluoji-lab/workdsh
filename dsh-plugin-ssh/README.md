# DSH SSH

DeepSeek Harness 的 SSH／SFTP 工作区插件。安装到现有 Harness，通过侧栏的 **SSH** 打开；顶部 **DSH SSH** 返回 Harness，连接保持到关闭会话、刷新页面或退出 Harness。


**在 Harness 中连接服务器、管理文件，并随时让 AI 协助排查命令问题。**

DSH SSH 是可安装的社区插件，无需另装独立 SSH 客户端。适合日常服务器维护、日志查看和配置修改。AI 使用宿主已配置的模型服务，模型调用费用由对应服务商计算。

| 功能 | 说明 |
| --- | --- |
| 主机管理 | 添加、编辑、删除主机；核对服务器指纹；可选择记住密码 |
| SSH 终端 | 多会话标签、交互式终端、快捷命令 |
| SFTP 文件 | 目录浏览、多文件上传、下载、UTF-8 文本编辑 |
| 工作区布局 | 文件与终端上下排列，拖动分隔线调整比例 |
| 传输管理 | 查看进度、取消上传、删除单条记录、批量清理已结束记录 |
| AI 助手 | 解释选区、分析常见报错、流式回答、停止生成 |
| 命令操作 | AI 单行 Shell 代码块可填入终端，或确认后执行 |

当前为 **0.1.0-beta.10 测试版**，尚未在市场收录。macOS 已完成实际 SSH 连接验证；Windows 提供构建流程，尚未完成实机验收。

## 快速上手

1. 安装到正在使用的 Harness profile，重启宿主，从侧栏打开 **SSH**。
2. 在 **连接中心 → 添加主机** 输入地址、端口、用户名和认证信息，核对指纹后连接。
3. 如需免重复输入，勾选 **记住密码**；已有主机可点 **编辑** 修改并保存。
4. 点 **文件** 打开目录面板。先进入目标目录，再点 **上传**；点文件名编辑文本，点下载箭头下载文件。
5. 点 **AI**，或选中终端内容按 **⌘ / Ctrl + J**。检查要发送的内容后提问。
6. AI 命令代码块下可点 **填入终端** 或 **执行**。执行前确认目标主机，终端应处于空命令提示符。

## 数据与权限

- 主机名称、地址、用户名、指纹及布局偏好保存在浏览器本地；清除站点数据后这些配置可能丢失。
- 勾选记住密码后，宿主以 AES-256-GCM 加密存储在 `DSH_HOME/ssh-credentials`。密钥文件与密文位于本机，并以当前用户文件权限保护；这不是系统钥匙串，也不抵御已取得该用户文件访问权限的程序。
- 编辑时密码留空沿用，取消勾选并保存可清除；删除主机同时清除对应密码。私钥和私钥口令不保存。
- 终端输出仅在用户选择附带上下文并发送时交给所选模型服务。报错检测在本地进行，AI 不自动运行命令。
- 删除传输记录不会删除远程文件。关闭 SSH 标签或退出宿主会断开连接。

## 安装

需要 Node.js 22.19+ 或 24+、pnpm、DeepSeek Harness Web。最低兼容／测试基线为官方 `@deepseek-ai/dsh@0.1.2-rc.1`；旧版 `0.1.0-rc.7` 不支持所需接口。先确认或升级 Harness，再安装插件。

如果全局安装了旧版，先运行 `npm install -g @deepseek-ai/dsh@0.1.2-rc.1`。下载预构建包后，在包所在目录运行：

```sh
npx @deepseek-ai/dsh@0.1.2-rc.1 plugin --profile web add ./dsh-plugin-ssh-v0.1.0-beta.10.tgz --ignore-scripts
npx @deepseek-ai/dsh@0.1.2-rc.1 web
```

已有 `dsh` 命令时可直接使用 `dsh plugin --profile web add ... --ignore-scripts`。安装进自己的 profile 时，将 `web` 换成该名称，该配置必须包含 Harness Web UI。安装后刷新浏览器。

`--ignore-scripts` 跳过 ssh2 的可选原生加速构建，使用其 JavaScript 实现；不需要 Electron、独立客户端或编译器。首次运行 Harness 本身所需的环境按官方快速开始准备。

卸载：

```sh
dsh plugin --profile web remove dsh-plugin-ssh
```

## 使用

- **连接中心**：添加主机，密码／私钥登录；先核对服务器 SHA256 指纹，再连接。保存主机信息和指纹；可选择在宿主侧加密记住密码，不保存私钥或私钥口令。
- **终端**：多会话标签、交互式 PTY、终端尺寸同步。关闭标签会关闭对应 SSH 连接。
- **文件**：浏览远程目录、多文件上传、下载、编辑 UTF-8 文本。上传遇到同名文件失败，避免直接覆盖。
- **传输**：上传进度、取消、结果；下载状态。文本保存采用版本校验和同目录临时文件替换。
- **错误提示**：提交命令后，本地检测常见错误／用法提示，在终端显示「询问 AI」。点击后预填本次输出和问题，按「发送」进行模型分析；不会自动上传终端内容。检测是启发式，不代表已获取命令退出码。
- **AI**：读取 Harness 已配置的模型，支持流式回答和停止。选区快捷键 `⌘/Ctrl + J`；发送前可检查、编辑上下文。普通问题默认不附带终端输出，AI 不自动执行命令。完整的单行 Shell 代码块支持“填入终端”及确认目标主机后“执行”；执行前应确保终端停在空命令提示符。多行代码及含占位符的示例仅供阅读。
- **模型服务**：返回 Harness 的「设置 → 模型」配置供应商、地址和密钥。插件不另存模型密钥。
- **快捷命令**：插入当前终端，由用户按 Enter 执行。

## 当前边界

这是预发布测试插件。SSH 路由仅接受本机 `http://127.0.0.1:<端口>`，远程访问 Harness 或 `localhost` 地址暂不支持。会话保存在当前页面内，刷新会断开连接。

单文件下载上限 32 MB，文本编辑上限 64 KB，最多 12 个并发 SSH 会话。暂不支持跳板机、目录递归传输、断点续传、自动重连、终端分屏、主机分组、语法高亮。文本替换要求服务器支持 OpenSSH 原子 rename；版本检查不等同于远端文件锁。不提供 CPU／延迟监测或可靠的命令退出码识别。

## 开发和构建

在外层仓库运行：

```sh
corepack yarn install --immutable
corepack yarn ssh:check
corepack yarn ssh:pack
```

产物在根目录 `dist/`，包含 Host 模块、Harness Client 模块、静态工作区和 bundle patch。不会包含 Electron 或 Desktop 包。

实现：Host 使用 `ssh2` + `ws`，通过 `ctx.webServer` 注册路由，`ctx.effect` 清理资源；AI 使用 `ctx.llm`。Client 通过 `dsh.client` 被发现，向 `sidebar.footer.action` 和 `shell.overlay` 添加独立条目。

官方依据：[打包与安装](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish)、[Client 模块](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/client-modules)、[Slots](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/slots)。

安装冒烟测试（使用单独安装的官方 CLI，避免命中旧版全局命令）：

```sh
npm install --prefix /tmp/dsh-official --ignore-scripts @deepseek-ai/dsh@0.1.2-rc.1
node dsh-plugin-ssh/scripts/smoke-install.mjs /tmp/dsh-official/node_modules/@deepseek-ai/dsh/lib/bin.js dist/dsh-plugin-ssh-v0.1.0-beta.10.tgz
```

GitHub Actions 的 `SSH plugin test package` 工作流提供 macOS／Windows 构建、安装验证和测试包产物。工作流未触发时不能视为 Windows 实机验收通过。

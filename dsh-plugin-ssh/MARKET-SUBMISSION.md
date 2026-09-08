# DSH SSH 市场提交材料

状态：说明与条目草稿已准备；尚未提交、公开发布或通过市场审核。核对日期：2026-09-08。

## 卡片文案

名称：DSH SSH

包名：`dsh-plugin-ssh`

中文简介：在 DeepSeek Harness 内使用 SSH 多会话终端、SFTP 文件传输与编辑，并通过宿主模型获取命令建议。

英文简介：SSH terminals, SFTP file transfer and text editing inside DeepSeek Harness, with command suggestions powered by the host's configured models.

分类：`remote`

关键词：`dsh-plugin`、`deepseek-harness`、`ssh`、`sftp`、`terminal`。

版本：`0.1.0-beta.10`，预发布测试版。MIT 许可。

## 提交位置与格式

截图中的 dsh-market 从 awesome-dsh-plugin 获取目录。正式申请向该目录提交 PR，新增 `data/plugins/<owner>__<repo>.yml`，不要手动修改其生成的 README。支持子目录插件；具体路径采用其贡献指南的 monorepo 格式。

依据：[dsh-market 提交入口](https://github.com/dsh-market/dsh-market#submit-your-plugin)、[目录贡献指南](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)。

下面是待替换地址的草稿，不是可安装的正式条目。若将插件单独公开为一个 GitHub 仓库，使用：

```yaml
url: https://github.com/OWNER/REPO
name: OWNER/REPO
category: remote
description:
  en: 'SSH terminals, SFTP file transfer and text editing inside DeepSeek Harness, with command suggestions powered by the host models.'
  zh: '在 DeepSeek Harness 内使用 SSH 终端、SFTP 文件传输与文本编辑，并通过宿主模型获取命令建议。'
```

## PR 标题与正文草稿

标题：Add DSH SSH — SSH, SFTP and host-model assistance

正文：

> Adds DSH SSH to the remote category. It provides interactive SSH sessions, SFTP upload/download, UTF-8 text editing, saved host editing, optional locally encrypted passwords, and AI advice through Harness model services. Users can insert suggested single-line shell commands or execute them after confirmation.
>
> The package declares `dsh.bundle` and includes prebuilt Host, Client and workbench assets. Compatibility was checked with Harness 0.1.2-rc.1. This is a beta release; macOS SSH was exercised, while Windows runtime verification remains pending. Downloads are limited to 32 MB and text editing to 64 KB.
>
> Source: TO_BE_FILLED
> Public package / release URL: TO_BE_FILLED
> Installation command: TO_BE_FILLED
> README: TO_BE_FILLED

## 发布前还缺什么

1. **公开源码地址**：目前仅确认本地 remote 为 Gitee 的 `techflag/dsh-ssh-desktop`，未确认 GitHub 发布仓库。若镜像整个仓库，应让目录指向 `dsh-plugin-ssh/`，不要让用户误装 Desktop 根包。
2. **公开可安装包**：当前 tgz 位于本地 `dist/`，其他用户无法访问。需发布 npm 包或 GitHub Release 预构建 tgz，并从干净环境按公开地址完成安装测试。不要把 `file:/Users/...` 写入申请。
3. **元数据地址**：确定正式仓库后同步 package.json 的 repository/homepage。npm 包名的可用性和发布权限尚未核实，不应先写 npm 安装命令。
4. **截图**：建议展示连接中心、文件与终端分栏、AI 命令按钮。使用演示主机及无敏感信息的命令；现有截图含真实服务器地址、用户名、本地路径或业务日志，未纳入公开包。
5. **提交要求**：公开仓库应满足目录当前要求（包括存在真实实现、bundle 声明、仓库创建满一天和 dsh-plugin topic），以提交时贡献指南为准。

## 验证记录与边界

- 本地插件检查：15 项测试通过，构建和类型检查通过。
- 通过官方 CLI 完成隔离安装、bundle 加载、页面资源和卸载检查。
- 已在 macOS 宿主验证实际 SSH 登录、终端与 SFTP 目录浏览；不将其扩写为所有功能端到端验收。
- AI 命令执行和 Windows 实机验收尚未完成，当前只提供测试版。
- 密码为本地文件加密方案，非系统钥匙串；读取同一用户的密钥和密文即可解密。详见 README 数据说明。

安装卡片仍显示本地路径时，代表安装来源是本地 tgz。补全包说明不会自动变成市场收录，也不保证“已安装”卡片展示完整 README；正式发现页依赖收录目录和公开分发信息。

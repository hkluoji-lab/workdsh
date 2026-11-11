# workdsh-prompt-optimize

提示词优化（Prompt Optimize）— DeepSeek Harness 插件。

在会话输入框右侧（`conversation.input.right` 槽位）挂一个星标按钮：

1. 点击星标 → 当前输入框草稿被发送到宿主接口 `POST /prompt-optimize/optimize`；
2. 宿主复用 DSH 已配置的 DeepSeek 路由（`ctx.llm`）把草稿改写成更高质量的提示词；
3. 浏览器拿回结果后整体替换输入框草稿，按钮变为「撤销」，再点一次还原原文。

灵感来自 Trae AI 输入框右上角的「优化您的输入」星标按钮。

## 配置

`cordis.patch.yml` 的 `config`（可在 profile 层用同 id 行覆盖，改完无需重装）：

| 字段 | 默认 | 说明 |
|---|---|---|
| `provider` | `deepseek-official` | LLM 路由 provider |
| `model` | `deepseek-flash` | LLM 路由 model（改写用快模型） |
| `maxInputBytes` | `4096` | 输入上限（字节） |
| `maxOutputTokens` | `2048` | 改写输出上限 |
| `timeoutMs` | `60000` | 单次改写超时 |

## 安装 / 卸载

```bash
dsh plugin --profile web add workdsh-prompt-optimize-0.1.0.tgz --offline
# 重启 dsh web 生效
dsh plugin --profile web remove workdsh-prompt-optimize
```

## 排障

- 浏览器控制台搜 `[prompt-optimize]`：有 slot props 的诊断输出。
- 接口测试（容器内）：`curl -sS -X POST http://127.0.0.1:3080/prompt-optimize/optimize -H 'content-type: application/json' -d '{"text":"帮我写个周报"}'`。

# WorkDSH 后期 ToDo

## 企业版服务端与管理 Web

状态：待排期，不进入当前 Skill 0.1 实现。

- 建设独立 WorkDSH 企业服务端：组织、成员、授权、审计、组织 Skill、不可变修订和制品存储。
- 建设独立管理 Web：组织 Skill 列表、分类、版本、启停、可见范围、下发策略和成员个人上传策略。
- 建设执行节点同步：本机 Harness Host 或隔离 Worker 按主体同步精确授权修订，校验后原子投影到官方 Skill provider。
- 验证两组织两主体、撤权、黑白名单、跨设备、冷启动、离线 last-good、摘要/签名失败和历史修订。
- 暂不建设公共 Skill 市场；平台公共目录若后续立项，作为独立来源接入。

架构决策见 [ADR 0015](adr/0015-skill-control-plane-and-runtime-projection.md)，产品参考见 [WorkBuddy 企业 Skill 管理](https://www.workbuddy.cn/docs/enterprise/adminguide/Skill%E7%AE%A1%E7%90%86)。

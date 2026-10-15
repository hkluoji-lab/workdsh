// 岗位角色与权限目录（P0）——门户侧的单一真源。
//
// 三个后台（门户 3083、产品页后台 3084、增值业务后台 3085）与 DSH 侧面板都从这里取口径，
// 不允许各自再写一份。历史上「会话密钥」就因为在三个进程里各写一遍而互相否定，别再重演。
//
// 两层角色，刻意分开：
//   1) 平台角色 role：admin / user —— 决定「能否进管理后台、能否调用户管理接口」。
//      这一层已经在门户里强制（requireAdmin），不要和岗位角色混为一谈。
//   2) 岗位角色 jobRole：按部门划分的职能身份，决定「在站点里能做什么」。
//      这一层目前是**声明式**的：门户侧能强制的已经强制，DSH 工作台侧要等身份打通（P1）
//      与各域 authorize 覆盖（P2）之后才真正生效。每个能力都带 enforced 标记，界面必须如实呈现。

/** 岗位角色：公司现有部门口径。 */
export const JOB_ROLES = ['management', 'operations', 'sales', 'production', 'service', 'promotion', 'finance', 'legal'];

/** 未分配岗位：新账号的诚实默认值——不给任何岗位权限，等管理员指派。 */
export const JOB_ROLE_UNASSIGNED = 'unassigned';

export const JOB_ROLE_IDS = [JOB_ROLE_UNASSIGNED, ...JOB_ROLES];

/**
 * 能力目录。id 用 `<域>.<动作>`，与 WorkDSH 访问层已存在的动作词汇保持同构
 * （实测在用的有 experts.* / read / edit / use / manage / tool.execute）。
 *
 * enforced 的含义（必须如实标注，不能当成"已经生效"）：
 *   true  = 门户进程今天就按它拦截（改这里立刻有实际效果）
 *   false = 声明式：界面与授权记录已就位，但 DSH 侧尚未强制，属于 P1/P2 的交付目标
 */
export const CAPABILITIES = [
  // —— 工作台：日常业务面 ——
  { id: 'task.create', label: '新建任务 / 会话', area: '工作台', enforced: false },
  { id: 'assistant.use', label: '使用助理', area: '工作台', enforced: false },
  { id: 'expert.use', label: '使用已发布专家', area: '工作台', enforced: false },
  { id: 'project.manage', label: '项目与任务编排', area: '工作台', enforced: false },
  { id: 'schedule.manage', label: '定时任务', area: '工作台', enforced: false },
  { id: 'office.edit', label: '在线 Office 文档编辑', area: '工作台', enforced: false },
  // —— 内容与资产 ——
  { id: 'library.read', label: '查看资料库', area: '内容资产', enforced: false },
  { id: 'library.write', label: '维护资料库（增删改）', area: '内容资产', enforced: false },
  { id: 'expert.author', label: '编写专家 / 技能草稿', area: '内容资产', enforced: false },
  { id: 'expert.publish', label: '发布专家（对外可用）', area: '内容资产', enforced: false },
  { id: 'connector.use', label: '使用连接器（MCP）', area: '内容资产', enforced: false },
  { id: 'connector.manage', label: '配置连接器与授权', area: '内容资产', enforced: false },
  // —— 站点管理面 ——
  { id: 'users.read', label: '查看账号与岗位', area: '站点管理', enforced: true },
  { id: 'users.manage', label: '账号增删改 / 指派岗位', area: '站点管理', enforced: true },
  { id: 'roles.manage', label: '角色与权限配置', area: '站点管理', enforced: false },
  { id: 'security.manage', label: '注册与安全策略', area: '站点管理', enforced: true },
  { id: 'audit.read', label: '审计与登录台账', area: '站点管理', enforced: true },
  { id: 'usage.read', label: '用量账本', area: '站点管理', enforced: false },
  { id: 'billing.manage', label: '计费与充值核对', area: '站点管理', enforced: false },
  { id: 'plugin.manage', label: '插件管理', area: '平台', enforced: false },
  { id: 'model.manage', label: '模型与凭据', area: '平台', enforced: false },
  { id: 'backup.manage', label: '备份与还原', area: '平台', enforced: false },
  { id: 'portal.admin', label: '产品页后台', area: '平台', enforced: true },
  { id: 'vas.admin', label: '增值业务后台', area: '平台', enforced: true },
];

const ALL = CAPABILITIES.map((entry) => entry.id);

/**
 * 岗位 → 能力。刻意写成显式清单而不是通配符，便于逐条审阅与调整。
 * 调整这里即调整全站口径；门户侧 enforced=true 的项立即生效。
 */
export const JOB_ROLE_DEFINITIONS = {
  unassigned: {
    label: '未分配',
    summary: '新注册账号的默认状态：可登录、可查看自己的账号，等待管理员指派岗位。',
    capabilities: [],
  },
  management: {
    label: '管理',
    summary: '站长 / 总经理：全站全部能力，含平台配置与用户权限。',
    capabilities: ALL,
  },
  operations: {
    label: '运营',
    summary: '运营负责人：内容资产的编写与发布、项目编排、账号与用量查看；不碰平台配置。',
    capabilities: [
      'task.create', 'assistant.use', 'expert.use', 'project.manage', 'schedule.manage', 'office.edit',
      'library.read', 'library.write', 'expert.author', 'expert.publish', 'connector.use',
      'users.read', 'audit.read', 'usage.read',
    ],
  },
  sales: {
    label: '销售',
    summary: '销售：使用专家与资料库服务客户，维护自己的项目与文档；不能发布对外专家。',
    capabilities: [
      'task.create', 'assistant.use', 'expert.use', 'project.manage', 'office.edit',
      'library.read', 'library.write', 'connector.use',
    ],
  },
  production: {
    label: '生产',
    summary: '生产 / 交付：承接项目交付、维护资料库与文档、跑定时任务。',
    capabilities: [
      'task.create', 'assistant.use', 'expert.use', 'project.manage', 'schedule.manage', 'office.edit',
      'library.read', 'library.write', 'connector.use',
    ],
  },
  service: {
    label: '服务',
    summary: '客户服务：查阅知识库与客户资料、使用专家答疑；以只读为主。',
    capabilities: [
      'task.create', 'assistant.use', 'expert.use', 'office.edit', 'library.read',
    ],
  },
  promotion: {
    label: '推广',
    summary: '市场推广：维护对外素材与产品页，查看资料库；可进产品页后台。',
    capabilities: [
      'task.create', 'assistant.use', 'expert.use', 'office.edit',
      'library.read', 'library.write', 'connector.use', 'portal.admin', 'usage.read',
    ],
  },
  finance: {
    label: '财务',
    summary: '财务：用量、成本与充值核对，审计只读；不参与内容生产。',
    capabilities: [
      'task.create', 'assistant.use', 'usage.read', 'billing.manage', 'audit.read',
    ],
  },
  legal: {
    label: '法务',
    summary: '法务：合同与合规资料查阅、审计只读；不参与内容生产。',
    capabilities: [
      'task.create', 'assistant.use', 'office.edit', 'library.read', 'audit.read',
    ],
  },
};

/** 岗位角色的对外目录（界面渲染用）。 */
export function jobRoleCatalog() {
  return JOB_ROLE_IDS.map((id) => {
    const definition = JOB_ROLE_DEFINITIONS[id];
    return {
      id,
      label: definition.label,
      summary: definition.summary,
      capabilities: [...definition.capabilities],
    };
  });
}

/** 能力目录的对外视图（含 area 与 enforced，界面据此如实标注生效状态）。 */
export function capabilityCatalog() {
  return CAPABILITIES.map((entry) => ({ ...entry }));
}

export function isJobRole(value) {
  return typeof value === 'string' && JOB_ROLE_IDS.includes(value);
}

/** 归一化岗位角色：非法值一律落到"未分配"，绝不静默提权。 */
export function normalizeJobRole(value) {
  return isJobRole(value) ? value : JOB_ROLE_UNASSIGNED;
}

/**
 * 账号的有效能力集合。
 * 平台角色 admin 是超集（门户侧 requireAdmin 的实际口径），不被岗位角色削弱——
 * 否则会出现"是管理员却进不了后台"的自相矛盾状态。
 */
export function effectiveCapabilities({ role, jobRole }) {
  if (role === 'admin') return [...ALL];
  const definition = JOB_ROLE_DEFINITIONS[normalizeJobRole(jobRole)];
  return [...definition.capabilities];
}

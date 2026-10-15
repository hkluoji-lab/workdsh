/**
 * workdsh-plugin-schedule —— 宿主半侧。
 *
 * 职责：给浏览器半侧一张同源 JSON 路由，用来「读 / 增 / 删」官方 Schedule 提醒。
 *
 * 设计约束（2026-09-26 在容器内逐一实测得出，勿凭印象改）：
 *
 * 1) 不重造 Schedule 语义。官方 @deepseek-ai/dsh-schedule 已经把「持久化 →
 *    严格重放 → 定时 → 交付」做完，本插件只做「入口 + 传输」：
 *      - 增 / 删 走官方已注册的工具定义，经 `ctx.tools.execute({ name, arguments, agent })`。
 *        这是官方注册表的公开执行面，仍会经过 tools/pre-execute 守卫、参数校验与
 *        agent 作用域可见性；不直接调 `tool.execute` 以绕过管线。
 *      - 读 走官方注册的 `schedule` 会话投影。活会话用 `ctx.sessionProjections.snapshot()`；
 *        冷会话用 `ctx.sessionQuery.observeSession()`（官方「不激活 Agent 的会话观察」）。
 *        两者都是官方给客户端的同一个只读视图，不做第二套重放。
 *
 * 2) `ctx.tools.execute` 需要 ToolCallId 与 AbortSignal。ToolCallId 在运行期就是
 *    普通字符串（@deepseek-ai/dsh-brand 的 Branded<> 是纯类型构造），已在本容器
 *    `node -e` 确认 brand 无运行期包装，因此传字符串安全。
 *
 * 3) 工具注册时机：官方 schedule 只对「本插件加载之后新建的 root agent」装工具
 *    （见其 README 的 scope and composition）。对旧会话 schedule_create 会解析为
 *    UNKNOWN_TOOL —— 这不是本插件的缺陷，必须如实回报给界面而不是假装成功。
 *
 * 4) 跨会话总览：不激活任何 Agent。逐个会话读官方投影；单次扫描有上限，
 *    并把 scanned/truncated 如实回报，避免把「没扫到」伪装成「没有提醒」。
 */

export const name = 'workdsh-plugin-schedule'

/** 官方 schedule 工具名。 */
const TOOL_CREATE = 'schedule_create'
const TOOL_DELETE = 'schedule_delete'

/** 本插件自有的同源路由（与 workdsh-plugin-projects 的 /api/workdsh-projects 同款约定）。 */
export const scheduleManagementPath = '/api/workdsh-schedule'

/** 跨会话总览单次最多扫描的会话数，避免路由被拖成长任务。 */
const OVERVIEW_SESSION_LIMIT = 200
/** 跨会话读取的并发度：足够快，又不会一次打出几百个持久化读。 */
const OVERVIEW_CONCURRENCY = 4
/** 单次持久化读的超时。 */
const READ_TIMEOUT_MS = 15_000
/** 单次工具调用的超时。 */
const TOOL_TIMEOUT_MS = 20_000
/** 单次创建可接受的最小周期（与官方 MIN_EVERY_INTERVAL_SECONDS 一致）。 */
const MIN_EVERY_SECONDS = 300

const ok = (value) => ({ ok: true, value })
const fail = (code, message) => ({ ok: false, error: { code, message, details: {} } })

/** 未知值是否为非数组对象。 */
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/** 生成一个工具调用 id；运行期就是字符串。 */
let callSeq = 0
const nextCallId = () => `workdsh-schedule-ui-${Date.now().toString(36)}-${(callSeq++).toString(36)}`

/**
 * 带稳定 code 的受控错误。
 * @param code - 稳定错误码。
 * @param message - 面向用户的文案。
 * @param localized - true 表示 message 已是最终中文文案，describeError 原样透出；
 *   false（默认）表示 message 可能是官方英文诊断，允许 describeError 用 code→文案表覆盖。
 */
function codedError(code, message, localized = false) {
  const error = new Error(message)
  error.code = code
  error.localized = localized
  return error
}

/**
 * 在指定会话的 agent 上执行一个官方 Schedule 工具。
 * @returns 工具的规范化结果值。
 * @throws 带稳定 code 的受控错误。
 */
async function runScheduleTool(ctx, sessionId, toolName, args) {
  const resolved = await ctx.sessionController.resolveAgent(sessionId)
  if (!isRecord(resolved) || resolved.error !== undefined) {
    throw codedError('session-unavailable', '目标会话当前不可用，无法执行定时任务操作。', true)
  }
  const agent = resolved.agent
  if (agent === undefined || agent === null) {
    throw codedError('session-unavailable', '目标会话当前不可用，无法执行定时任务操作。')
  }

  if (ctx.tools.get(toolName, agent) === undefined) {
    throw codedError(
      'tool-unavailable',
      '该会话没有加载官方定时任务工具（官方只为插件加载之后新建的会话安装），请在该会话中用对话方式创建提醒。',
      true,
    )
  }

  const result = await ctx.tools.execute({
    callId: nextCallId(),
    name: toolName,
    arguments: args,
    agent,
    signal: AbortSignal.timeout(TOOL_TIMEOUT_MS),
  })

  if (result.isError === true) {
    const raw = result.error
    const code = isRecord(raw) && typeof raw.code === 'string' ? raw.code : 'tool-failed'
    const message = isRecord(raw) && typeof raw.message === 'string' ? raw.message : undefined
    throw codedError(code, message ?? describeError({ code }).message)
  }
  return result.value
}

/**
 * 读一个会话当前的活动提醒，不激活 Agent。
 *
 * 路径 A（活会话）：官方投影注册表的同步快照。
 * 路径 B（冷会话）：官方 sessionQuery.observeSession 的持久化投影。
 *
 * 这两项服务通过 apply 里的**可选注入**取得（见 optionalServices）：Cordis 的
 * `ctx.<service>` 只对本插件 inject 里声明过的服务可见，因此不能直接读
 * `ctx.sessionQuery` —— 那样拿到的是 undefined（沙盒实测踩过，表现为读路径
 * 全被跳过、退化成笼统的 internal 错误）。
 *
 * 两条路径都不可用时抛受控错误，**不静默返回空数组** —— 把「读不到」伪装成
 * 「没有提醒」会让用户以为提醒被删了。
 *
 * @param ctx - 插件上下文。
 * @param services - apply 时捕获的可选服务引用。
 * @param sessionId - 目标会话。
 * @returns 活动提醒数组。
 */
async function readSessionSchedules(ctx, services, sessionId) {
  const { sessionProjections, sessionQuery } = services

  const attached = ctx.sessions.get(sessionId)
  if (attached !== undefined && typeof sessionProjections?.snapshot === 'function') {
    const values = sessionProjections.snapshot(attached, ['schedule'])?.values?.schedule
    if (Array.isArray(values)) return values
  }

  if (typeof sessionQuery?.observeSession === 'function') {
    let observed
    try {
      observed = await sessionQuery.observeSession(sessionId, {
        signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      })
    } catch {
      // 会话不存在 / 持久化不可读：给稳定 code 与可读文案，而不是笼统的 internal。
      throw codedError('schedule/read-failed', '无法读取该会话的定时任务（会话不存在或持久化不可用）。', true)
    }
    try {
      const values = observed?.projections?.values?.schedule
      if (Array.isArray(values)) return values
    } finally {
      // observeSession 返回的是 caller-owned 租约；释放失败不影响已读到的值。
      try {
        observed?.[Symbol.dispose]?.()
      } catch {
        /* 忽略释放失败 */
      }
    }
  }

  throw codedError('schedule/read-failed', '无法读取该会话的定时任务（投影服务不可用）。', true)
}

/** 按固定并发度映射，保持结果顺序。 */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

/**
 * 跨会话总览：列出可见会话中当前仍有活动提醒的那些。不激活任何 Agent。
 * 读取失败的会话单独计数回报，不计入「无提醒」。
 */
async function buildOverview(ctx, services) {
  let listed
  try {
    listed = await ctx.sessionController.list({}, AbortSignal.timeout(30_000))
  } catch (cause) {
    // 会话列表本身失败时给受控错误，不要把内部的英文诊断与文件路径透给界面。
    throw codedError('schedule/list-failed', '无法读取会话列表，跨会话总览暂不可用。', true)
  }
  const items = Array.isArray(listed?.items) ? listed.items : []
  const targets = items
    .filter((row) => isRecord(row) && typeof row.sessionId === 'string')
    .slice(0, OVERVIEW_SESSION_LIMIT)

  let unreadable = 0
  const rows = await mapWithConcurrency(targets, OVERVIEW_CONCURRENCY, async (summary) => {
    const sessionId = summary.sessionId
    let reminders
    try {
      reminders = await readSessionSchedules(ctx, services, sessionId)
    } catch {
      unreadable += 1
      return undefined
    }
    if (reminders.length === 0) return undefined
    return {
      sessionId,
      agentAvailable: summary.agentAvailable === true,
      updatedAt: typeof summary.updatedAt === 'number' ? summary.updatedAt : undefined,
      reminders,
    }
  })

  return {
    sessions: rows.filter((row) => row !== undefined),
    scanned: targets.length,
    unreadable,
    truncated: items.length > OVERVIEW_SESSION_LIMIT,
  }
}

/** 校验并归一化创建参数；返回官方工具参数，或抛受控错误。 */
function buildCreateArgs(payload) {
  const prompt = typeof payload.prompt === 'string' ? payload.prompt : ''
  if (prompt.trim().length === 0) throw codedError('invalid_prompt', '请填写提醒内容。', true)

  // 2026-10-04 修复：官方 schedule_create 把 title 定为必填（缺失/空白/超 120 字符
  // 一律 invalid_prompt），且**绝不从指令派生标题**。本函数此前只传 prompt，
  // 于是「定时任务」页的创建表单 100% 失败并只回报笼统的 tool-failed。
  const title = typeof payload.title === 'string' ? payload.title.trim() : ''
  if (title.length === 0) throw codedError('invalid_title', '请填写任务名称。', true)
  if (title.length > 120) throw codedError('invalid_title', '任务名称不能超过 120 个字符。', true)

  const selectorCount = [
    payload.afterSeconds !== undefined,
    payload.at !== undefined,
    payload.everySeconds !== undefined,
  ].filter(Boolean).length
  if (selectorCount !== 1) throw codedError('invalid_selector', '请且仅请选择一种触发方式。', true)

  if (payload.afterSeconds !== undefined) {
    const after = payload.afterSeconds
    if (!Number.isSafeInteger(after) || after <= 0) throw codedError('invalid_rule', '延迟秒数必须是正整数。', true)
    return { title, prompt: prompt.trim(), after_seconds: after }
  }

  if (payload.everySeconds !== undefined) {
    const every = payload.everySeconds
    if (!Number.isSafeInteger(every)) throw codedError('invalid_rule', '间隔秒数必须是整数。', true)
    if (every < MIN_EVERY_SECONDS) throw codedError('frequency_too_high', `周期提醒的最小间隔是 ${MIN_EVERY_SECONDS} 秒。`, true)
    return { title, prompt: prompt.trim(), every_seconds: every }
  }

  const at = payload.at
  if (typeof at === 'string') {
    if (at.trim().length === 0) throw codedError('invalid_rule', '绝对时间不能为空。', true)
    return { title, prompt: prompt.trim(), at: at.trim() }
  }
  if (isRecord(at)) {
    const { date, time, timeZone } = at
    if (typeof date !== 'string' || typeof time !== 'string' || typeof timeZone !== 'string') {
      throw codedError('invalid_rule', '绝对时间需要 date、time 与 timeZone。', true)
    }
    return { title, prompt: prompt.trim(), at: { date, time, time_zone: timeZone } }
  }
  throw codedError('invalid_rule', '绝对时间的格式不正确。', true)
}

/** 官方工具/持久化错误 code → 中文文案。 */
const ERROR_MESSAGES = {
  'session-unavailable': '目标会话当前不可用，无法执行定时任务操作。',
  'tool-unavailable':
    '该会话没有加载官方定时任务工具（官方只为插件加载之后新建的会话安装），请在该会话中用对话方式创建提醒。',
  'schedule/read-failed': '无法读取该会话的定时任务。',
  'schedule/invalid-request': '定时任务请求无效。',
  invalid_prompt: '请填写提醒内容。',
  invalid_title: '请填写任务名称（不超过 120 个字符）。',
  invalid_selector: '请且仅请选择一种触发方式。',
  invalid_rule: '触发规则不正确。',
  invalid_time_zone: '时区不正确。',
  not_future: '目标时间必须在将来。',
  time_out_of_range: '目标时间超出可表示范围。',
  frequency_too_high: `周期提醒的最小间隔是 ${MIN_EVERY_SECONDS} 秒。`,
  schedule_not_found: '该提醒不存在或已结束。',
  corrupt_schedule_log: '该会话的定时任务记录已损坏，无法安全读取。',
  persistence_uncertain: '持久化结果不确定，请重新读取列表后再决定。',
  'tool-failed': '定时任务操作失败。',
  'schedule/internal': '定时任务操作失败。',
}

/** 把任意异常映射为稳定 code + 中文文案。 */
function describeError(cause) {
  const code = isRecord(cause) && typeof cause.code === 'string' ? cause.code : 'schedule/internal'
  // 本插件自己抛的受控错误已经带具体中文文案，必须原样透出，
  // 否则会被 code→文案表覆盖成笼统说法、丢掉真正的原因。
  if (isRecord(cause) && cause.localized === true && cause instanceof Error && cause.message.length > 0) {
    return { code, message: cause.message }
  }
  const known = ERROR_MESSAGES[code]
  // 官方返回的 message 是英文稳定诊断；有本地文案时优先用本地文案，
  // 未知 code 才回落到官方原文，避免把英文诊断丢给用户。
  if (known !== undefined) return { code, message: known }
  const raw = cause instanceof Error ? cause.message : undefined
  return { code, message: raw !== undefined && raw.length > 0 ? raw : '定时任务操作失败。' }
}

/**
 * 插件入口：注册同源路由。
 *
 * 硬依赖只放「没有它本插件就无意义」的服务：路由与身份。`sessionProjections`
 * 与 `sessionQuery` 按官方惯例是可选注册表（官方 schedule 也用 ctx.inject 软挂），
 * 因此这里用 `ctx.inject([...])` 做**可选注入**并捕获引用 —— 不写进顶层 inject，
 * 否则任一服务缺席会让整棵插件树加载失败，代价远大于失去一条读路径。
 *
 * 注意：Cordis 的 `ctx.<service>` 只对顶层 inject 声明过的服务可见；可选注入的
 * 服务必须用回调里给的子 ctx 读取，这是沙盒实测踩过的坑。
 */
export const inject = ['connection', 'sessionController', 'sessions', 'tools']

/**
 * @param ctx - 插件上下文。
 */
export function apply(ctx) {
  /** 可选服务引用：先置空，注入成功后再填。 */
  const services = { sessionProjections: undefined, sessionQuery: undefined }

  ctx.inject(['sessionProjections'], (projectionCtx) => {
    services.sessionProjections = projectionCtx.sessionProjections
  })
  ctx.inject(['sessionQuery'], (queryCtx) => {
    services.sessionQuery = queryCtx.sessionQuery
  })

  const unregister = ctx.connection.fetch.register({
    path: scheduleManagementPath,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      try {
        return await handle(ctx, services, request)
      } catch (cause) {
        const { code, message } = describeError(cause)
        ctx.logger.warn(`workdsh-schedule: ${code}: ${message}`)
        return Response.json(fail(code, message), { status: 500 })
      }
    },
  })

  ctx.effect(() => unregister, 'workdsh.schedule.fetch')
}

/** 解析请求体并分发到各 endpoint。请求体只读一次。 */
async function handle(ctx, services, request) {
  const raw = await request.json().catch(() => undefined)
  const body = isRecord(raw) ? raw : {}
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : ''
  const payload = isRecord(body.payload) ? body.payload : {}

  if (endpoint === 'overview') {
    return Response.json(ok(await buildOverview(ctx, services)))
  }

  if (endpoint === 'session') {
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : ''
    if (sessionId.length === 0) {
      return Response.json(fail('schedule/invalid-request', '缺少会话标识。'), { status: 400 })
    }
    try {
      const reminders = await readSessionSchedules(ctx, services, sessionId)
      return Response.json(ok({ sessionId, reminders }))
    } catch (cause) {
      const { code, message } = describeError(cause)
      return Response.json(fail(code, message), { status: 400 })
    }
  }

  if (endpoint === 'create') {
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : ''
    if (sessionId.length === 0) {
      return Response.json(fail('schedule/invalid-request', '缺少会话标识。'), { status: 400 })
    }
    let args
    try {
      args = buildCreateArgs(payload)
    } catch (cause) {
      const { code, message } = describeError(cause)
      return Response.json(fail(code, message), { status: 400 })
    }
    try {
      return Response.json(ok(await runScheduleTool(ctx, sessionId, TOOL_CREATE, args)))
    } catch (cause) {
      const { code, message } = describeError(cause)
      return Response.json(fail(code, message), { status: 400 })
    }
  }

  if (endpoint === 'delete') {
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : ''
    const id = typeof payload.id === 'string' ? payload.id : ''
    if (sessionId.length === 0 || id.length === 0) {
      return Response.json(fail('schedule/invalid-request', '缺少会话标识或提醒标识。'), { status: 400 })
    }
    try {
      return Response.json(ok(await runScheduleTool(ctx, sessionId, TOOL_DELETE, { id })))
    } catch (cause) {
      const { code, message } = describeError(cause)
      return Response.json(fail(code, message), { status: 400 })
    }
  }

  return Response.json(fail('schedule/invalid-request', '定时任务请求无效。'), { status: 400 })
}

window.__ModuleLoader__.load({
  id: 'workdsh-plugin-schedule',
  factory: function (require) {
    const module = { exports: {} }
    const React = require('react')
    const h = React.createElement

    /**
     * workdsh-plugin-schedule —— 浏览器半侧。
     *
     * 目标：把左侧导航「定时任务」从 workdsh-bundle 的「（待开放）」占位入口，
     * 换成一个真正可用的提醒管理面板，并且**不改 workdsh-bundle 一个字节**。
     *
     * 遮蔽机制（从 dsh-web-frontend 的 SlotCore.register 源码读出，勿凭印象改）：
     *   - list 槽按 (priority, order) 排序后**按 id 去重，先到者胜**；
     *   - keyed 槽同样按 priority 排序后**按 key 去重**；
     *   - 只有**同 priority** 的重复 id/key 才抛错。
     * workdsh-bundle 的占位行用默认 priority 0，本插件用 priority -10，
     * 因此排到前面、赢得去重：占位行与占位面板都不再出现。既不抛错，也不必改
     * node_modules 里由 tgz 装出来的那个包。回滚 = 摘掉 profile 里一条 insert。
     *
     * 读路径：走宿主半侧 /api/workdsh-schedule；宿主用官方 schedule 会话投影回答。
     * 写路径：同样走宿主路由，由宿主调用官方 schedule_create / schedule_delete。
     */

    /** 本插件遮蔽的导航行 id，与 workdsh-bundle 占位行同名。 */
    const PANEL_ID = 'workdsh-automation'
    /** 本插件自有路由。 */
    const API = '/api/workdsh-schedule'
    /** 与宿主半侧一致的周期下限（官方 MIN_EVERY_INTERVAL_SECONDS）。 */
    const MIN_EVERY_SECONDS = 300
    /** priority -10：排到 workdsh-bundle 占位行（priority 0）之前，赢得去重。 */
    const SHADOW_PRIORITY = -10

    /** 调用宿主路由；非 2xx 或 ok:false 一律抛错，绝不静默吞掉。 */
    async function callApi(endpoint, payload, signal) {
      const response = await fetch(API, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: endpoint, payload: payload }),
        signal: signal,
      })
      const body = await response.json().catch(function () {
        return undefined
      })
      if (!body || body.ok !== true) {
        const message =
          (body && body.error && body.error.message) || '定时任务服务请求失败（' + response.status + '）'
        const error = new Error(message)
        error.code = body && body.error && body.error.code
        throw error
      }
      return body.value
    }

    /**
     * 官方 Remote `schedule` 面。
     *
     * 2026-10-04 修复：原读路径走「会话 schedule 投影」（宿主半侧
     * sessionProjections / sessionQuery），而官方 @deepseek-ai/dsh-schedule
     * **并不注册任何会话投影** —— 实测每个会话都落到「投影服务不可用」，
     * 跨会话总览更是 106 个会话 106 个 unreadable。官方真正共享的读面是
     * TypertRemoteService `schedule`（catalog / list / history / update / delete），
     * 官方「自动化任务」页读的就是它。改为先读这里，读不到才回落宿主路由。
     */
    function readRemote(remote, method, request) {
      const face = remote && remote.schedule
      if (!face || typeof face[method] !== 'function') {
        return Promise.reject(new Error('官方定时任务接口不可用。'))
      }
      // 官方 Remote 会按声明的方法元数据校验实参个数（catalog 是零参数），
      // 因此无请求体时必须以零实参调用，不能显式传 undefined。
      const pending = request === undefined ? face[method]() : face[method](request)
      return Promise.resolve(pending).then(function (result) {
        if (!result || result.ok !== true) {
          const message = (result && result.error && result.error.message) || '官方定时任务接口读取失败。'
          const error = new Error(message)
          error.code = result && result.error && result.error.code
          throw error
        }
        return result.value
      })
    }

    /** 官方目录快照（catalog）→ 本面板「跨会话总览」的形状。 */
    function summarizeCatalog(entries) {
      const active = (Array.isArray(entries) ? entries : []).filter(function (row) {
        return row && row.status === 'active' && typeof row.sessionId === 'string' && row.sessionId.length > 0
      })
      const order = []
      const bySession = new Map()
      active.forEach(function (row) {
        if (!bySession.has(row.sessionId)) {
          bySession.set(row.sessionId, [])
          order.push(row.sessionId)
        }
        bySession.get(row.sessionId).push(row)
      })
      order.forEach(function (sessionId) {
        bySession.get(sessionId).sort(function (a, b) {
          return String(a.scheduledAt).localeCompare(String(b.scheduledAt))
        })
      })
      return {
        source: 'catalog',
        sessions: order.map(function (sessionId) {
          return { sessionId: sessionId, reminders: bySession.get(sessionId) }
        }),
        scanned: order.length,
        unreadable: 0,
        truncated: false,
      }
    }

    /** 秒数 → 人话。 */
    function humanInterval(seconds) {
      if (seconds % 86400 === 0) return seconds / 86400 + ' 天'
      if (seconds % 3600 === 0) return seconds / 3600 + ' 小时'
      if (seconds % 60 === 0) return seconds / 60 + ' 分钟'
      return seconds + ' 秒'
    }

    /** 本地时间。 */
    function formatLocal(iso) {
      const at = new Date(iso)
      if (Number.isNaN(at.getTime())) return String(iso)
      return at.toLocaleString()
    }

    /** 相对时间。 */
    function formatRelative(iso, now) {
      const at = new Date(iso).getTime()
      if (Number.isNaN(at)) return ''
      const delta = at - now
      const abs = Math.abs(delta)
      let unit = '秒'
      let size = 1000
      if (abs >= 86400000) {
        unit = '天'
        size = 86400000
      } else if (abs >= 3600000) {
        unit = '小时'
        size = 3600000
      } else if (abs >= 60000) {
        unit = '分钟'
        size = 60000
      }
      const value = Math.max(1, Math.round(abs / size))
      return delta >= 0 ? value + ' ' + unit + '后' : '已逾期 ' + value + ' ' + unit
    }

    /** 状态与触发描述。 */
    function describe(reminder, now) {
      const overdue = new Date(reminder.scheduledAt).getTime() <= now
      let frequency
      if (reminder.kind === 'every') frequency = '每 ' + humanInterval(reminder.everySeconds)
      else if (reminder.kind === 'after') frequency = '一次性（延迟）'
      else if (reminder.kind === 'at') frequency = '一次性（绝对时间）'
      else if (reminder.kind === 'daily') frequency = '每天 ' + (reminder.time || '')
      else if (reminder.kind === 'weekly')
        frequency = '每周 ' + ((reminder.weekdays || []).join('/') || '') + ' ' + (reminder.time || '')
      else if (reminder.kind === 'cron') frequency = 'cron ' + (reminder.expression || '')
      else frequency = reminder.kind ? String(reminder.kind) : '未知规则'
      const zone = reminder.timeZone ? '（' + reminder.timeZone + '）' : ''
      return { overdue: overdue, frequency: frequency + zone }
    }

    const STYLE = [
      '.wd-sch{display:flex;flex-direction:column;gap:18px;padding:24px 28px 32px;height:100%;overflow:auto;box-sizing:border-box}',
      '.wd-sch h1{margin:0;font-size:20px;font-weight:600}',
      '.wd-sch-eyebrow{margin:0;font-size:11px;letter-spacing:.14em;color:var(--dsw-alias-label-tertiary,#8b93a1)}',
      '.wd-sch-boundary{margin:0;padding:12px 14px;border:0.5px solid var(--dsw-alias-border-l1,#e3e6ec);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#f7f8fa);font-size:12px;line-height:1.75;color:var(--dsw-alias-label-secondary,#5b6472)}',
      '.wd-sch-boundary strong{color:var(--dsw-alias-label-primary,#1f2733)}',
      '.wd-sch-boundary ul{margin:6px 0 0;padding-left:18px}',
      '.wd-sch-boundary li{margin:2px 0}',
      '.wd-sch-card{border:0.5px solid var(--dsw-alias-border-l1,#e3e6ec);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fff);overflow:hidden}',
      '.wd-sch-card>header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:0.5px solid var(--dsw-alias-border-l1,#e3e6ec)}',
      '.wd-sch-card>header h2{margin:0;font-size:14px;font-weight:600}',
      '.wd-sch-body{padding:14px 16px}',
      '.wd-sch-row{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:12px 0;border-bottom:0.5px solid var(--dsw-alias-border-l1,#eef0f4)}',
      '.wd-sch-row:last-child{border-bottom:0}',
      '.wd-sch-title{margin:0 0 4px;font-size:13px;font-weight:600;line-height:1.5;word-break:break-word}',
      '.wd-sch-prompt{margin:0 0 6px;font-size:13px;line-height:1.6;word-break:break-word}',
      '.wd-sch-meta{display:flex;flex-wrap:wrap;gap:6px 10px;font-size:11px;color:var(--dsw-alias-label-tertiary,#8b93a1)}',
      '.wd-sch-tag{display:inline-flex;align-items:center;gap:5px;padding:1px 7px;border-radius:999px;border:0.5px solid currentColor;font-size:11px}',
      '.wd-sch-tag.ok{color:#1a7f5a}',
      '.wd-sch-tag.warn{color:#b45309}',
      '.wd-sch-btn{border:0.5px solid var(--dsw-alias-border-l1,#d7dbe2);background:transparent;color:inherit;border-radius:6px;padding:5px 11px;font-size:12px;cursor:pointer}',
      '.wd-sch-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2,#f0f2f5)}',
      '.wd-sch-btn:disabled{opacity:.5;cursor:not-allowed}',
      '.wd-sch-btn.primary{background:#2563eb;border-color:#2563eb;color:#fff}',
      '.wd-sch-btn.primary:hover:not(:disabled){background:#1d4ed8}',
      '.wd-sch-form{display:grid;gap:10px}',
      '.wd-sch-field{display:grid;gap:5px}',
      '.wd-sch-field label{font-size:12px;color:var(--dsw-alias-label-secondary,#5b6472)}',
      '.wd-sch-field input,.wd-sch-field select,.wd-sch-field textarea{width:100%;box-sizing:border-box;padding:7px 9px;border:0.5px solid var(--dsw-alias-border-l1,#d7dbe2);border-radius:6px;background:var(--dsw-alias-bg-base,#fff);color:inherit;font:inherit;font-size:13px}',
      '.wd-sch-field textarea{min-height:64px;resize:vertical}',
      '.wd-sch-inline{display:grid;grid-template-columns:170px 1fr;gap:10px;align-items:end}',
      '.wd-sch-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}',
      '.wd-sch-note{font-size:12px;line-height:1.6;margin:0}',
      '.wd-sch-note.error{color:#b42318}',
      '.wd-sch-note.info{color:var(--dsw-alias-label-tertiary,#8b93a1)}',
      '.wd-sch-empty{margin:0;font-size:12px;color:var(--dsw-alias-label-tertiary,#8b93a1)}',
      '.wd-sch-table{width:100%;border-collapse:collapse;font-size:12px}',
      '.wd-sch-table th,.wd-sch-table td{text-align:left;padding:8px 10px;border-bottom:0.5px solid var(--dsw-alias-border-l1,#eef0f4)}',
      '.wd-sch-table th{font-weight:500;color:var(--dsw-alias-label-tertiary,#8b93a1)}',
      '.wd-sch-table td.num{font-variant-numeric:tabular-nums}',
      '.wd-sch-link{border:0;background:none;padding:0;color:#2563eb;font-size:12px;cursor:pointer;text-decoration:underline}',
      '.wd-sch-sid{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}',
    ].join('')

    /** 侧栏图标：闹钟轮廓。 */
    function ScheduleIcon(props) {
      const s = (props && props.size) || 18
      return h(
        'svg',
        {
          width: s,
          height: s,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: false,
        },
        h('circle', { cx: 12, cy: 13, r: 7.2 }),
        h('path', { d: 'M12 9.6V13l2.4 1.6' }),
        h('path', { d: 'M5.2 4.4 7.6 2.6' }),
        h('path', { d: 'M18.8 4.4 16.4 2.6' }),
      )
    }

    /** 交付边界：逐条对齐官方语义，不夸大。 */
    function Boundary() {
      const items = [
        '提醒是会话本地的：只在该会话有存活 Agent 时到点触发；会话关闭则保持逾期，直到会话被重新唤醒。',
        '没有邮件、短信、推送或浏览器通知；也没有投递回执 —— 已投递只表示跟进消息已入队。',
        '周期提醒是固定间隔（最小 5 分钟）、按首次创建时刻对齐；错过的间隔只保留最近一次。',
        '存在活动提醒的会话，归档会被拒绝，直到这些提醒被取消。',
        '官方只为「本插件加载之后新建的会话」安装定时任务工具；更早的会话只能查看，不能在此创建。',
      ]
      return h(
        'div',
        { className: 'wd-sch-boundary' },
        h('strong', null, '交付边界（官方 @deepseek-ai/dsh-schedule 的既定语义）'),
        h('ul', null, items.map((text, index) => h('li', { key: index }, text))),
      )
    }

    /** 单条提醒。 */
    function ReminderRow(props) {
      const reminder = props.reminder
      const state = describe(reminder, props.now)
      return h(
        'div',
        { className: 'wd-sch-row' },
        h(
          'div',
          { style: { minWidth: 0, flex: 1 } },
          reminder.title ? h('p', { className: 'wd-sch-title' }, reminder.title) : null,
          h('p', { className: 'wd-sch-prompt' }, reminder.prompt),
          h(
            'div',
            { className: 'wd-sch-meta' },
            h('span', { className: 'wd-sch-tag ' + (state.overdue ? 'warn' : 'ok') }, state.overdue ? '已逾期' : '已排定'),
            h('span', null, state.frequency),
            h('span', null, formatLocal(reminder.scheduledAt)),
            h('span', null, formatRelative(reminder.scheduledAt, props.now)),
          ),
        ),
        h(
          'button',
          { type: 'button', className: 'wd-sch-btn', disabled: props.busy, onClick: () => props.onDelete(reminder) },
          props.busy ? '处理中…' : '取消',
        ),
      )
    }

    /** 创建表单。 */
    function CreateForm(props) {
      const [title, setTitle] = React.useState('')
      const [prompt, setPrompt] = React.useState('')
      const [mode, setMode] = React.useState('after')
      const [minutes, setMinutes] = React.useState('30')
      const [everyMinutes, setEveryMinutes] = React.useState('60')
      const [at, setAt] = React.useState('')

      const zone = React.useMemo(() => {
        try {
          return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
        } catch (cause) {
          return 'UTC'
        }
      }, [])

      function submit(event) {
        event.preventDefault()
        // 官方 schedule_create 必填 title（且不从指令派生），表单必须一并提交。
        const payload = { sessionId: props.sessionId, title: title.trim(), prompt: prompt }
        if (mode === 'after') payload.afterSeconds = Math.round(Number(minutes) * 60)
        else if (mode === 'every') payload.everySeconds = Math.round(Number(everyMinutes) * 60)
        else {
          // datetime-local 的值形如 "YYYY-MM-DDTHH:mm"；官方本地时间要求 HH:mm:ss。
          const date = at.slice(0, 10)
          const time = at.length >= 16 ? at.slice(11, 16) + ':00' : '00:00:00'
          payload.at = { date: date, time: time, timeZone: zone }
        }
        props.onSubmit(payload)
      }

      return h(
        'form',
        { className: 'wd-sch-form', onSubmit: submit },
        h(
          'div',
          { className: 'wd-sch-field' },
          h('label', { htmlFor: 'wd-sch-title' }, '任务名称（必填，最长 120 字符）'),
          h('input', {
            id: 'wd-sch-title',
            type: 'text',
            maxLength: 120,
            required: true,
            value: title,
            placeholder: '例如：每日订单核对',
            onChange: (event) => setTitle(event.target.value),
          }),
        ),
        h(
          'div',
          { className: 'wd-sch-field' },
          h('label', { htmlFor: 'wd-sch-prompt' }, '提醒内容'),
          h('textarea', {
            id: 'wd-sch-prompt',
            value: prompt,
            placeholder: '例如：检查今天的构建结果并汇报',
            onChange: (event) => setPrompt(event.target.value),
          }),
        ),
        h(
          'div',
          { className: 'wd-sch-inline' },
          h(
            'div',
            { className: 'wd-sch-field' },
            h('label', { htmlFor: 'wd-sch-mode' }, '触发方式'),
            h(
              'select',
              { id: 'wd-sch-mode', value: mode, onChange: (event) => setMode(event.target.value) },
              h('option', { value: 'after' }, '延迟一次'),
              h('option', { value: 'every' }, '固定间隔重复'),
              h('option', { value: 'at' }, '指定绝对时间'),
            ),
          ),
          mode === 'after'
            ? h(
                'div',
                { className: 'wd-sch-field' },
                h('label', { htmlFor: 'wd-sch-after' }, '延迟（分钟）'),
                h('input', { id: 'wd-sch-after', type: 'number', min: 1, value: minutes, onChange: (e) => setMinutes(e.target.value) }),
              )
            : mode === 'every'
              ? h(
                  'div',
                  { className: 'wd-sch-field' },
                  h('label', { htmlFor: 'wd-sch-every' }, '间隔（分钟，最小 ' + MIN_EVERY_SECONDS / 60 + '）'),
                  h('input', { id: 'wd-sch-every', type: 'number', min: MIN_EVERY_SECONDS / 60, value: everyMinutes, onChange: (e) => setEveryMinutes(e.target.value) }),
                )
              : h(
                  'div',
                  { className: 'wd-sch-field' },
                  h('label', { htmlFor: 'wd-sch-at' }, '绝对时间（本机时区 ' + zone + '）'),
                  h('input', { id: 'wd-sch-at', type: 'datetime-local', value: at, onChange: (e) => setAt(e.target.value) }),
                ),
        ),
        h(
          'div',
          { className: 'wd-sch-actions' },
          h('button', { type: 'submit', className: 'wd-sch-btn primary', disabled: props.disabled || props.busy }, props.busy ? '正在创建…' : '创建提醒'),
          h('span', { className: 'wd-sch-note info' }, props.disabled ? '当前没有打开中的会话，无法创建会话本地提醒。' : '提醒只会送达它所属的会话。'),
        ),
      )
    }

    /**
     * 从官方会话列表快照里读一个会话的 schedule 投影值。
     *
     * 这是官方已经送到浏览器的数据（SessionSummary.projectionValues.schedule），
     * 与官方 ui-schedule 会话头部目录用的是同一个只读投影。官方文档明确它是
     * 「缓存提示」：冷会话可能短暂缺失或过期，因此只作为回退，权威值以宿主路由为准。
     */
    function projectionReminders(sessions, sessionId) {
      try {
        const row = sessions.list.getSnapshot().byId[sessionId]
        const values = row && row.projectionValues && row.projectionValues.schedule
        return Array.isArray(values) ? values : undefined
      } catch (cause) {
        return undefined
      }
    }

    /** 主面板。 */
    function SchedulePanel(props) {
      const sessions = props.sessions
      const uiWorkspace = props.uiWorkspace
      const remote = props.remote

      const list = sessions.list.getSnapshot()

      const activeId = React.useMemo(
        function () {
          const rows = Object.values(list.byId)
          const row = rows.find((candidate) => (candidate.retainedBy && candidate.retainedBy.mainView) > 0)
          return row && row.id
        },
        [list],
      )

      const [now, setNow] = React.useState(() => Date.now())
      const [current, setCurrent] = React.useState([])
      const [overview, setOverview] = React.useState(undefined)
      const [error, setError] = React.useState('')
      const [notice, setNotice] = React.useState('')
      const [busyId, setBusyId] = React.useState('')
      const [creating, setCreating] = React.useState(false)

      React.useEffect(function () {
        const timer = window.setInterval(() => setNow(Date.now()), 30000)
        return () => window.clearInterval(timer)
      }, [])

      const reload = React.useCallback(
        async function (signal) {
          try {
            if (typeof activeId === 'string' && activeId.length > 0) {
              let reminders
              try {
                // 官方 Remote 是权威源：会话冷热、有没有存活 Agent 都不影响读取。
                reminders = await readRemote(remote, 'list', { sessionId: activeId })
              } catch (remoteCause) {
                if (remoteCause && remoteCause.name === 'AbortError') return
                try {
                  const value = await callApi('session', { sessionId: activeId }, signal)
                  reminders = Array.isArray(value.reminders) ? value.reminders : []
                } catch (cause) {
                  if (cause && cause.name === 'AbortError') return
                  // 两条权威路径都失败时，才回退到浏览器侧投影缓存（可能短暂过期）。
                  const cached = projectionReminders(sessions, activeId)
                  if (cached === undefined) throw cause
                  reminders = cached
                }
              }
              setCurrent(Array.isArray(reminders) ? reminders : [])
            } else {
              setCurrent([])
            }
            let summary
            try {
              summary = summarizeCatalog(await readRemote(remote, 'catalog'))
            } catch (remoteCause) {
              if (remoteCause && remoteCause.name === 'AbortError') return
              summary = await callApi('overview', {}, signal)
            }
            setOverview(summary)
            setError('')
          } catch (cause) {
            if (cause && cause.name === 'AbortError') return
            setError(cause instanceof Error ? cause.message : '读取定时任务失败。')
          }
        },
        [activeId, sessions, remote],
      )

      React.useEffect(
        function () {
          const controller = new AbortController()
          void reload(controller.signal)
          return () => controller.abort()
        },
        [reload],
      )

      async function remove(reminder) {
        if (typeof activeId !== 'string' || activeId.length === 0) return
        setBusyId(reminder.id)
        setNotice('')
        try {
          let outcome
          try {
            outcome = await readRemote(remote, 'delete', { sessionId: activeId, id: reminder.id })
          } catch (remoteCause) {
            await callApi('delete', { sessionId: activeId, id: reminder.id })
          }
          setNotice(
            outcome && outcome.deleted === false ? '该提醒已不存在，列表已刷新。' : '已取消提醒：' + reminder.prompt,
          )
          await reload()
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : '取消提醒失败。')
        } finally {
          setBusyId('')
        }
      }

      async function create(payload) {
        setCreating(true)
        setNotice('')
        setError('')
        try {
          const created = await callApi('create', payload)
          setNotice('已创建提醒：' + ((created && created.prompt) || payload.prompt) + '（' + ((created && created.scheduledAt) || '') + '）')
          await reload()
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : '创建提醒失败。')
        } finally {
          setCreating(false)
        }
      }

      function openSession(sessionId) {
        try {
          if (uiWorkspace && typeof uiWorkspace.openSession === 'function') {
            uiWorkspace.openSession(sessionId)
            return
          }
        } catch (cause) {
          /* 落到对话视图 */
        }
        try {
          props.selectPanel(null)
        } catch (cause) {
          /* 面板切换失败时保持当前视图 */
        }
      }

      const hasSession = typeof activeId === 'string' && activeId.length > 0
      const overviewRows = (overview && overview.sessions) || []
      const overviewNote =
        overview === undefined
          ? '读取中…'
          : overview.source === 'catalog'
            ? '官方目录：' + overview.sessions.length + ' 个会话有活动提醒'
            : '已扫描 ' +
              overview.scanned +
              ' 个会话' +
              (overview.unreadable > 0 ? '，其中 ' + overview.unreadable + ' 个读取失败' : '') +
              (overview.truncated ? '（已达扫描上限，仅显示前 200 个）' : '')

      return h(
        'section',
        { className: 'wd-sch' },
        h('style', null, STYLE),
        h('p', { className: 'wd-sch-eyebrow' }, 'WORKDSH'),
        h('h1', null, '定时任务'),
        h(Boundary, null),
        error.length > 0 ? h('p', { className: 'wd-sch-note error', role: 'alert' }, error) : null,
        notice.length > 0 ? h('p', { className: 'wd-sch-note info', role: 'status' }, notice) : null,

        h(
          'div',
          { className: 'wd-sch-card' },
          h(
            'header',
            null,
            h('h2', null, '当前会话的提醒'),
            h(
              'div',
              { className: 'wd-sch-actions' },
              h('span', { className: 'wd-sch-note info' }, hasSession ? current.length + ' 条活动提醒' : '没有打开中的会话'),
              h('button', { type: 'button', className: 'wd-sch-btn', onClick: () => void reload() }, '刷新'),
            ),
          ),
          h(
            'div',
            { className: 'wd-sch-body' },
            current.length === 0
              ? h('p', { className: 'wd-sch-empty' }, hasSession ? '当前会话没有活动提醒。' : '打开一个会话后即可查看并创建提醒。')
              : current.map((reminder) =>
                  h(ReminderRow, {
                    key: reminder.id,
                    reminder: reminder,
                    now: now,
                    busy: busyId === reminder.id,
                    onDelete: remove,
                  }),
                ),
          ),
        ),

        h(
          'div',
          { className: 'wd-sch-card' },
          h('header', null, h('h2', null, '创建提醒')),
          h('div', { className: 'wd-sch-body' }, h(CreateForm, { sessionId: activeId, disabled: !hasSession, busy: creating, onSubmit: create })),
        ),

        h(
          'div',
          { className: 'wd-sch-card' },
          h('header', null, h('h2', null, '跨会话总览'), h('span', { className: 'wd-sch-note info' }, overviewNote)),
          h(
            'div',
            { className: 'wd-sch-body' },
            overviewRows.length === 0
              ? h('p', { className: 'wd-sch-empty' }, overview === undefined ? '正在读取…' : '没有其他会话存在活动提醒。')
              : h(
                  'table',
                  { className: 'wd-sch-table' },
                  h('thead', null, h('tr', null, h('th', null, '会话'), h('th', null, '提醒数'), h('th', null, '最近一条'), h('th', null, '操作'))),
                  h(
                    'tbody',
                    null,
                    overviewRows.map((row) =>
                      h(
                        'tr',
                        { key: row.sessionId },
                        h('td', { className: 'wd-sch-sid' }, row.sessionId),
                        h('td', { className: 'num' }, String(row.reminders.length)),
                        h('td', null, (row.reminders[0] && row.reminders[0].prompt) || ''),
                        h('td', null, h('button', { type: 'button', className: 'wd-sch-link', onClick: () => openSession(row.sessionId) }, '去会话查看')),
                      ),
                    ),
                  ),
                ),
          ),
        ),
      )
    }

    /** 官方「自动化任务」主面板 id。workdsh-bundle 的视图表里没有它。 */
    const OFFICIAL_PANEL = 'schedules'
    /** workdsh-bundle 用的视图查询参数。 */
    const VIEW_PARAM = 'workdsh-view'

    /**
     * 把官方「自动化任务」页写进 `?workdsh-view=`，并支持深链/刷新回到该页。
     *
     * 背景（2026-10-04）：workdsh-bundle 的 NavigationLocation 只认自己的视图表
     * （experts/skills/assistant/projects/library/automation/more），遇到官方面板
     * `schedules` 会直接 `return` —— 既不写 URL 也不拦。于是地址栏一直停在
     * `?workdsh-view=conversation`，在「自动化任务」页按 F5 就会掉回对话。
     * 这里只补这一格：`schedules` 不在它的表里，两边不会互相改写。
     */
    function ScheduleLocation(props) {
      const layout = props.layout
      const deepLink = props.deepLink

      React.useEffect(
        function () {
          const store = layout.panelInfo
          const sync = function () {
            if (store.getSnapshot().activePanelId !== OFFICIAL_PANEL) return
            const url = new URL(window.location.href)
            if (url.searchParams.get(VIEW_PARAM) === OFFICIAL_PANEL) return
            url.searchParams.set(VIEW_PARAM, OFFICIAL_PANEL)
            window.history.replaceState(window.history.state, '', url)
          }
          sync()
          return store.subscribe(sync)
        },
        [layout],
      )

      React.useEffect(
        function () {
          const store = layout.panelInfo
          const apply = function () {
            try {
              layout.selectPanel(OFFICIAL_PANEL)
            } catch (cause) {
              /* 官方面板未注册（未启用 ui-schedule）时不抢视图 */
            }
          }
          const requested = function () {
            return new URL(window.location.href).searchParams.get(VIEW_PARAM) === OFFICIAL_PANEL
          }
          const onPop = function () {
            if (requested()) apply()
          }
          window.addEventListener('popstate', onPop)

          // 官方 boot 会在特性槽组合完成后恢复上次会话并清空主面板，深链必须
          // 在那一击之后重放；选中并稳定几拍后立刻停手，绝不长期抢视图。
          let pending = deepLink === true
          let stable = 0
          if (pending) apply()
          const timer = window.setInterval(function () {
            if (!pending) {
              window.clearInterval(timer)
              return
            }
            if (store.getSnapshot().activePanelId === OFFICIAL_PANEL) {
              stable += 1
              if (stable >= 3) {
                pending = false
                window.clearInterval(timer)
              }
              return
            }
            stable = 0
            apply()
          }, 100)

          return function () {
            window.removeEventListener('popstate', onPop)
            window.clearInterval(timer)
          }
        },
        [layout, deepLink],
      )

      return null
    }

    module.exports.name = 'workdsh-schedule-client'
    /**
     * 需要的客户端服务。sessions 由 @deepseek-ai/dsh-api-session-controller 提供；
     * remote 由 @deepseek-ai/dsh-api-remotes 提供（workdsh-bundle 同样注入它），
     * 其 schedule 命名空间就是官方「自动化任务」页的权威读面。
     */
    module.exports.inject = ['slots', 'layout', 'sessions', 'uiWorkspace', 'remote', 'remote.schedule']

    /**
     * @param ctx - 客户端根上下文。
     */
    module.exports.apply = function apply(ctx) {
      ctx.slots.inject('main', () =>
        ctx.slots.register(
          {
            name: 'main',
            key: PANEL_ID,
            priority: SHADOW_PRIORITY,
            inject: () => ({
              sessions: ctx.sessions,
              uiWorkspace: ctx.get('uiWorkspace'),
              remote: ctx.remote,
              selectPanel: (id) => ctx.layout.selectPanel(id),
            }),
          },
          SchedulePanel,
        ),
      )

      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          { name: 'sidebar.panellist', id: PANEL_ID, label: '定时任务', order: 40, priority: SHADOW_PRIORITY },
          ScheduleIcon,
        ),
      )

      // 深链必须在**任何 effect 改写 URL 之前**采样：workdsh 的 boot 恢复会把
      // 无法识别的 `workdsh-view` 值改写成 conversation，之后才轮到这里。
      const deepLink = new URL(window.location.href).searchParams.get(VIEW_PARAM) === OFFICIAL_PANEL
      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register(
          {
            name: 'shell.overlay',
            id: 'workdsh-schedule-location',
            inject: () => ({ layout: ctx.layout, deepLink: deepLink }),
          },
          ScheduleLocation,
        ),
      )
    }

    return module.exports
  },
})

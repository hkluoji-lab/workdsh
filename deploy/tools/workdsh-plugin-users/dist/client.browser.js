window.__ModuleLoader__.load({
  id: 'workdsh-plugin-users',
  factory: function (require) {
    const module = { exports: {} }
    const React = require('react')
    const h = React.createElement

    /**
     * workdsh-plugin-users —— 「用户与权限」设置面板（浏览器半侧）。
     *
     * 位置：设置 → 「用户与权限」一节（`settings.section` 列表槽，order 16，紧跟「插件」之后）。
     * 这是用户明确选定的位置：不做左侧导航行，也不占页脚。
     *
     * 两种视图，同一份数据源：
     *   · 自助视图：任何已登录账号都能看到自己的账号、平台角色、岗位角色与**自己**的能力清单。
     *   · 管理视图：平台角色 admin 额外看到账号管理、角色权限矩阵、注册与安全策略。
     * 判定完全依赖门户 `/api/portal/me` 返回的 role——不在前端"猜"管理员，
     * 且所有管理端点服务端都是 requireAdmin，前端隐藏只是体验，不是安全边界。
     *
     * 数据全部来自门户同源接口 `/api/portal/*`（Cookie 会话 + 服务端角色校验）。
     */

    const USERS_API = '/api/portal'

    const USERS_STYLE = [
      '.wd-usr{display:flex;flex-direction:column;gap:14px;min-width:0;color:var(--dsw-alias-label-primary)}',
      '.wd-usr-head{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:10px}',
      '.wd-usr-title{margin:0;font-size:16px;font-weight:600;line-height:24px}',
      '.wd-usr-sub{margin:3px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
      '.wd-usr-tabs{display:flex;flex-wrap:wrap;gap:6px;border-bottom:0.5px solid var(--dsw-alias-border-l1);padding-bottom:8px}',
      '.wd-usr-tab{border:0.5px solid transparent;background:0 0;color:var(--dsw-alias-label-secondary);border-radius:8px;padding:5px 11px;font:inherit;font-size:13px;cursor:pointer}',
      '.wd-usr-tab:hover{background:var(--dsw-alias-interactive-bg-hover-solid,rgba(0,0,0,.04))}',
      '.wd-usr-tab[data-on="1"]{background:var(--dsw-alias-interactive-bg-active,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary);font-weight:500}',
      '.wd-usr-tabCount{margin-left:6px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
      '.wd-usr-msg{margin:0;padding:9px 12px;border-radius:8px;font-size:12.5px;line-height:1.7}',
      '.wd-usr-msg.err{border:1px solid #ff6b6b55;background:#ff6b6b14;color:#e06b6b}',
      '.wd-usr-msg.ok{border:1px solid #4ade8055;background:#4ade8014;color:#2f9e5c}',
      '.wd-usr-msg.info{border:0.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.02));color:var(--dsw-alias-label-secondary)}',
      '.wd-usr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}',
      '.wd-usr-card{border:0.5px solid var(--dsw-alias-border-l1);border-radius:12px;padding:12px 14px;min-width:0;background:var(--dsw-alias-bg-base,transparent)}',
      '.wd-usr-cardLabel{margin:0;font-size:12px;color:var(--dsw-alias-label-tertiary)}',
      '.wd-usr-cardValue{margin:5px 0 0;font-size:15px;font-weight:600;line-height:22px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.wd-usr-cardNote{margin:3px 0 0;font-size:11.5px;color:var(--dsw-alias-label-tertiary)}',
      '.wd-usr-sec{margin:2px 0 0;font-size:13px;font-weight:600}',
      '.wd-usr-caps{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}',
      '.wd-usr-cap{display:inline-flex;align-items:center;gap:6px;border:0.5px solid var(--dsw-alias-border-l1);border-radius:999px;padding:3px 9px;font-size:12px}',
      '.wd-usr-cap[data-on="0"]{opacity:.45}',
      '.wd-usr-cap i{width:6px;height:6px;border-radius:50%;background:currentColor;flex:none}',
      '.wd-usr-cap[data-enf="0"] i{background:var(--dsw-alias-label-tertiary)}',
      '.wd-usr-tableWrap{overflow:auto;border:0.5px solid var(--dsw-alias-border-l1);border-radius:12px}',
      '.wd-usr-table{width:100%;border-collapse:collapse;font-size:12.5px}',
      '.wd-usr-table th,.wd-usr-table td{text-align:left;padding:9px 10px;border-bottom:0.5px solid var(--dsw-alias-border-l1);vertical-align:middle;white-space:nowrap}',
      '.wd-usr-table th{font-weight:500;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.02))}',
      '.wd-usr-table tr:last-child td{border-bottom:0}',
      '.wd-usr-num{font-variant-numeric:tabular-nums}',
      '.wd-usr-tag{display:inline-flex;align-items:center;padding:1px 7px;border-radius:999px;border:0.5px solid currentColor;font-size:11px}',
      '.wd-usr-tag.admin{color:#2563eb}', '.wd-usr-tag.user{color:#6b7280}',
      '.wd-usr-tag.active{color:#16a34a}', '.wd-usr-tag.disabled{color:#dc2626}', '.wd-usr-tag.pending{color:#d97706}',
      '.wd-usr-acts{display:flex;gap:6px;flex-wrap:wrap}',
      '.wd-usr-btn{border:0.5px solid var(--dsw-alias-border-l1,#d7dbe2);background:transparent;color:inherit;border-radius:6px;padding:4px 9px;font-size:12px;cursor:pointer;white-space:nowrap}',
      '.wd-usr-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid,rgba(0,0,0,.04))}',
      '.wd-usr-btn:disabled{opacity:.4;cursor:not-allowed}',
      '.wd-usr-btn.primary{background:#2563eb;border-color:#2563eb;color:#fff}',
      '.wd-usr-btn.danger{color:#dc2626;border-color:#dc262655}',
      '.wd-usr-select,.wd-usr-input{height:28px;box-sizing:border-box;padding:0 7px;border:0.5px solid var(--dsw-alias-border-l1,#d7dbe2);border-radius:6px;background:var(--dsw-alias-bg-base,#fff);color:inherit;font:inherit;font-size:12px}',
      '.wd-usr-new{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;border:0.5px solid var(--dsw-alias-border-l1);border-radius:12px;padding:12px 14px}',
      '.wd-usr-field{display:flex;flex-direction:column;gap:5px;font-size:12px}',
      '.wd-usr-field label{color:var(--dsw-alias-label-tertiary)}',
      '.wd-usr-empty{padding:22px 0;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:13px}',
      '.wd-usr-note{font-size:11.5px;line-height:1.7;color:var(--dsw-alias-label-tertiary)}',
      '.wd-usr-links{display:flex;gap:8px;flex-wrap:wrap}',
      '.wd-usr-matrix{width:100%;border-collapse:collapse;font-size:12px}',
      '.wd-usr-matrix th,.wd-usr-matrix td{border:0.5px solid var(--dsw-alias-border-l1);padding:5px 7px;text-align:center}',
      '.wd-usr-matrix th{color:var(--dsw-alias-label-tertiary);font-weight:500;background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.02))}',
      '.wd-usr-matrix td.wd-usr-area{text-align:left;color:var(--dsw-alias-label-tertiary)}',
      '.wd-usr-matrix td.wd-usr-yes{color:#16a34a}',
      '.wd-usr-matrix td.wd-usr-no{color:var(--dsw-alias-label-tertiary);opacity:.35}',
      '.wd-usr-scroll{overflow:auto;max-width:100%}',
    ]

    /** 统一请求：非 2xx 或 ok!==true 一律抛错，绝不静默吞掉。 */
    async function usersRequest(path, options) {
      const opts = options || {}
      const response = await fetch(USERS_API + path, {
        method: opts.method || 'GET',
        credentials: 'same-origin',
        headers: Object.assign(
          { accept: 'application/json' },
          opts.body ? { 'content-type': 'application/json' } : {},
        ),
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      })
      let payload = null
      try { payload = await response.json() } catch (error) { payload = null }
      if (!response.ok || !payload || payload.ok !== true) {
        const code = (payload && payload.error) || ('http-' + response.status)
        const failure = new Error(code)
        failure.status = response.status
        failure.code = code
        throw failure
      }
      return payload
    }

    const ROLE_LABEL = { admin: '管理员', user: '普通用户' }
    const STATE_LABEL = { active: '正常', disabled: '已停用', pending: '待审核' }

    const ERROR_LABEL = {
      forbidden: '当前账号不是管理员，无法使用账号管理。',
      unauthenticated: '登录状态已失效，请重新登录后再试。',
      'last-admin': '不能移除最后一个管理员，否则将无人可管理本站。',
      'env-account-readonly': '内置主账号由容器配置管理，门户不能修改。',
      'register-exists': '该用户名已被占用。',
      'register-weak': '口令至少需要 12 位。',
      'register-invalid': '用户名或口令不符合要求（用户名限字母数字 . _ -，3–64 位）。',
      'not-found': '该账号已不存在，列表可能已过期，请刷新。',
      'persist-failed': '写入失败，改动已回滚，请检查磁盘状态。',
      'auth/inactive-membership': '该账号的岗位状态不可用。',
    }

    function errorText(error) {
      if (!error) return '未知错误'
      return ERROR_LABEL[error.code] || ('操作失败：' + (error.code || error.message || '未知错误'))
    }

    function formatTime(value) {
      if (!value) return '—'
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return '—'
      const pad = (n) => String(n).padStart(2, '0')
      return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
        + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
    }

    function UsersIcon(props) {
      const s = (props && props.size) || 18
      return h(
        'svg',
        { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
        h('path', { d: 'M15.5 19v-1.4a3.4 3.4 0 0 0-3.4-3.4H6.9A3.4 3.4 0 0 0 3.5 17.6V19' }),
        h('circle', { cx: 9.5, cy: 8.2, r: 3.1 }),
        h('path', { d: 'M17.6 14.4a2.9 2.9 0 0 1 1.9 2.7V19' }),
        h('path', { d: 'M15.3 5.4a3 3 0 0 1 0 5.3' }),
      )
    }

    function Card(props) {
      return h(
        'div',
        { className: 'wd-usr-card' },
        h('p', { className: 'wd-usr-cardLabel' }, props.label),
        h('p', { className: 'wd-usr-cardValue', title: String(props.value) }, props.value),
        props.note ? h('p', { className: 'wd-usr-cardNote' }, props.note) : null,
      )
    }

    /** 能力徽标：data-enf=0 表示「声明式、尚未强制」，必须与已强制的可区分。 */
    function CapabilityBadge(props) {
      const entry = props.entry
      const on = props.on
      return h(
        'span',
        {
          className: 'wd-usr-cap',
          'data-on': on ? '1' : '0',
          'data-enf': entry.enforced ? '1' : '0',
          title: (on ? '已授予' : '未授予') + ' · ' + (entry.enforced ? '门户侧已强制' : '声明式：DSH 侧尚未强制'),
        },
        h('i', null),
        entry.label,
      )
    }

    /**
     * 设置面板根组件。
     * ownerProps 由设置外壳给出：{ close }。
     */
    function UsersSection() {
      const [me, setMe] = React.useState(null)
      const [catalog, setCatalog] = React.useState(null)
      const [users, setUsers] = React.useState(null)
      const [tab, setTab] = React.useState('self')
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)
      const [notice, setNotice] = React.useState(null)
      const [draft, setDraft] = React.useState({ username: '', password: '', role: 'user', jobRole: 'unassigned' })
      const [grants, setGrants] = React.useState(null)
      const [grantDraft, setGrantDraft] = React.useState({ subjectPrincipalId: '', domain: 'workdsh-experts', id: '', actions: ['read', 'use'] })

      const isAdmin = me?.role === 'admin'

      const loadCore = React.useCallback(async () => {
        setError(null)
        try {
          const [mePayload, rolePayload] = await Promise.all([
            usersRequest('/me'),
            usersRequest('/roles'),
          ])
          setMe(mePayload)
          setCatalog(rolePayload)
        } catch (failure) {
          setError(failure)
          setMe(null)
        }
      }, [])

      const loadUsers = React.useCallback(async () => {
        try {
          const payload = await usersRequest('/users')
          setUsers(payload.users || [])
        } catch (failure) {
          // 非管理员拿到 403 属预期：这不是错误，只是没有管理视图。
          setUsers(failure.status === 403 ? [] : null)
          if (failure.status !== 403) setError(failure)
        }
      }, [])

      React.useEffect(() => { loadCore() }, [loadCore])
      React.useEffect(() => { if (isAdmin) loadUsers() }, [isAdmin, loadUsers])

      // 资源授权（缺口 1）：走门户转发到 DSH，真正的授权判定在 DSH 访问层。
      const loadGrants = React.useCallback(async () => {
        try {
          const payload = await usersRequest('/grants')
          setGrants(payload)
        } catch (failure) {
          // 403 = 当前账号没有授权管理岗位：不是错误，只是看不到这一页的数据。
          if (failure.status === 403) { setGrants({ forbidden: true }); return }
          // 404/502 = DSH 侧的 workdsh-grant-admin 还没启用。如实说明，而不是甩一个 http-404。
          if (failure.status === 404 || failure.status === 502) { setGrants({ unavailable: true }); return }
          setGrants(null)
          setError(failure)
        }
      }, [])

      React.useEffect(() => { if (isAdmin) loadGrants() }, [isAdmin, loadGrants])

      const run = React.useCallback(async (label, task) => {
        setBusy(true)
        setError(null)
        setNotice(null)
        try {
          await task()
          setNotice(label + '成功。')
          await Promise.all([loadCore(), isAdmin ? loadUsers() : Promise.resolve(), isAdmin ? loadGrants() : Promise.resolve()])
        } catch (failure) {
          setError(failure)
        } finally {
          setBusy(false)
        }
      }, [loadCore, loadUsers, isAdmin])

      const jobRoleLabel = React.useCallback((id) => {
        const found = (catalog?.roles || []).find((entry) => entry.id === id)
        return found ? found.label : id
      }, [catalog])

      if (me === null) {
        return h(
          React.Fragment,
          null,
          h('style', null, USERS_STYLE),
          h(
            'div',
            { className: 'wd-usr' },
            h('div', { className: 'wd-usr-head' }, h('h1', { className: 'wd-usr-title' }, '用户与权限')),
            error ? h('div', { className: 'wd-usr-msg err' }, errorText(error)) : h('div', { className: 'wd-usr-empty' }, '正在读取账号信息…'),
          ),
        )
      }

      const myCaps = new Set(me.capabilities || [])
      const allCaps = catalog?.capabilities || []
      const capById = Object.fromEntries(allCaps.map((entry) => [entry.id, entry]))
      const roles = catalog?.roles || []
      const myRole = roles.find((entry) => entry.id === me.jobRole)
      const enforcedCount = allCaps.filter((entry) => entry.enforced).length

      const tabs = [
        { id: 'self', label: '我的账号' },
        ...(isAdmin ? [{ id: 'accounts', label: '账号管理', count: (users || []).length }] : []),
        ...(isAdmin ? [{ id: 'grants', label: '资源授权', count: (grants?.grants || []).length }] : []),
        { id: 'roles', label: isAdmin ? '角色与权限' : '岗位与权限' },
        ...(isAdmin ? [{ id: 'security', label: '注册与策略' }] : []),
      ]

      const tabBar = h(
        'div',
        { className: 'wd-usr-tabs', role: 'tablist' },
        tabs.map((entry) => h(
          'button',
          {
            key: entry.id,
            type: 'button',
            role: 'tab',
            className: 'wd-usr-tab',
            'data-on': tab === entry.id ? '1' : '0',
            'aria-selected': tab === entry.id,
            onClick: () => setTab(entry.id),
          },
          entry.label,
          entry.count === undefined ? null : h('span', { className: 'wd-usr-tabCount' }, entry.count),
        )),
      )

      // —— 我的账号（所有登录用户可见）——
      const selfView = h(
        React.Fragment,
        null,
        h(
          'div',
          { className: 'wd-usr-grid' },
          h(Card, { label: '账号', value: me.user, note: me.state === 'active' ? '状态正常' : STATE_LABEL[me.state] || me.state }),
          h(Card, { label: '平台角色', value: ROLE_LABEL[me.role] || me.role, note: isAdmin ? '拥有全部能力' : '按岗位角色授权' }),
          h(Card, { label: '岗位角色', value: jobRoleLabel(me.jobRole), note: myRole ? myRole.summary : '' }),
          h(Card, { label: '我的能力', value: (me.capabilities || []).length + ' 项', note: '共 ' + allCaps.length + ' 项能力，其中 ' + enforcedCount + ' 项已强制' }),
        ),
        h('p', { className: 'wd-usr-sec' }, '我拥有的能力'),
        h(
          'div',
          { className: 'wd-usr-caps' },
          allCaps.map((entry) => h(CapabilityBadge, { key: entry.id, entry, on: myCaps.has(entry.id) })),
        ),
        h(
          'p',
          { className: 'wd-usr-note' },
          '带实心圆点的能力已在门户侧强制生效；灰点表示该能力目前是「声明式」——授权记录与界面已就位，',
          '但 DSH 工作台内部的强制校验要等身份打通（P1）与各域鉴权覆盖（P2）之后才真正生效。',
        ),
      )

      // —— 账号管理（仅管理员）——
      const accountsView = h(
        React.Fragment,
        null,
        h(
          'div',
          { className: 'wd-usr-tableWrap' },
          h(
            'table',
            { className: 'wd-usr-table' },
            h(
              'thead',
              null,
              h(
                'tr',
                null,
                h('th', null, '账号'),
                h('th', null, '平台角色'),
                h('th', null, '岗位角色'),
                h('th', null, '状态'),
                h('th', null, '最后登录'),
                h('th', null, '登录次数'),
                h('th', null, '失败次数'),
                h('th', null, '来源 IP'),
                h('th', null, '操作'),
              ),
            ),
            h(
              'tbody',
              null,
              (users || []).map((entry) => {
                const login = entry.login || {}
                const editable = entry.editable !== false
                const nextRole = entry.role === 'admin' ? 'user' : 'admin'
                return h(
                  'tr',
                  { key: entry.username },
                  h(
                    'td',
                    null,
                    h('div', null, entry.username),
                    entry.isSelf ? h('div', { className: 'wd-usr-sub' }, '当前登录账号') : null,
                    !editable ? h('div', { className: 'wd-usr-sub' }, '内置主账号，只读') : null,
                  ),
                  h('td', null, h('span', { className: 'wd-usr-tag ' + entry.role }, ROLE_LABEL[entry.role] || entry.role)),
                  h(
                    'td',
                    null,
                    h(
                      'select',
                      {
                        className: 'wd-usr-select',
                        value: entry.jobRole || 'unassigned',
                        disabled: busy || !editable,
                        onChange: (event) => run('指派岗位', () => usersRequest('/users/update', {
                          method: 'POST', body: { username: entry.username, jobRole: event.target.value },
                        })),
                      },
                      roles.map((role) => h('option', { key: role.id, value: role.id }, role.label)),
                    ),
                  ),
                  h('td', null, h('span', { className: 'wd-usr-tag ' + entry.state }, STATE_LABEL[entry.state] || entry.state)),
                  h('td', null, formatTime(login.lastLoginAt)),
                  h('td', null, h('span', { className: 'wd-usr-num' }, String(login.loginCount || 0))),
                  h('td', null, h('span', { className: 'wd-usr-num' }, String(login.failureCount || 0))),
                  h('td', null, login.lastLoginIp || '—'),
                  h(
                    'td',
                    null,
                    h(
                      'div',
                      { className: 'wd-usr-acts' },
                      h('button', {
                        type: 'button',
                        className: 'wd-usr-btn',
                        disabled: busy || !editable,
                        onClick: () => run('修改平台角色', () => usersRequest('/users/update', { method: 'POST', body: { username: entry.username, role: nextRole } })),
                      }, entry.role === 'admin' ? '降为普通用户' : '设为管理员'),
                      h('button', {
                        type: 'button',
                        className: 'wd-usr-btn',
                        disabled: busy || !editable,
                        onClick: () => run(entry.state === 'active' ? '停用账号' : '启用账号', () => usersRequest('/users/update', {
                          method: 'POST',
                          body: { username: entry.username, state: entry.state === 'active' ? 'disabled' : 'active' },
                        })),
                      }, entry.state === 'active' ? '停用' : '启用'),
                      h('button', {
                        type: 'button',
                        className: 'wd-usr-btn',
                        disabled: busy || !editable,
                        onClick: () => {
                          const next = window.prompt('为 ' + entry.username + ' 设置新口令（至少 12 位）')
                          if (next === null || next === '') return
                          run('重置口令', () => usersRequest('/users/update', { method: 'POST', body: { username: entry.username, password: next } }))
                        },
                      }, '重置口令'),
                      h('button', {
                        type: 'button',
                        className: 'wd-usr-btn danger',
                        disabled: busy || !editable || entry.isSelf,
                        onClick: () => {
                          if (!window.confirm('删除账号 ' + entry.username + '？该账号将立即无法登录。')) return
                          run('删除账号', () => usersRequest('/users/delete', { method: 'POST', body: { username: entry.username } }))
                        },
                      }, '删除'),
                    ),
                  ),
                )
              }),
            ),
          ),
        ),
        (users || []).length === 0 ? h('div', { className: 'wd-usr-empty' }, '暂无账号。') : null,
        h(
          'div',
          { className: 'wd-usr-new' },
          h('div', { className: 'wd-usr-field' }, h('label', null, '新账号用户名'), h('input', {
            className: 'wd-usr-input', type: 'text', value: draft.username, placeholder: '字母/数字/._-',
            onChange: (event) => setDraft(Object.assign({}, draft, { username: event.target.value })),
          })),
          h('div', { className: 'wd-usr-field' }, h('label', null, '初始口令（≥12 位）'), h('input', {
            className: 'wd-usr-input', type: 'password', value: draft.password,
            onChange: (event) => setDraft(Object.assign({}, draft, { password: event.target.value })),
          })),
          h('div', { className: 'wd-usr-field' }, h('label', null, '平台角色'), h('select', {
            className: 'wd-usr-select', value: draft.role,
            onChange: (event) => setDraft(Object.assign({}, draft, { role: event.target.value })),
          }, h('option', { value: 'user' }, '普通用户'), h('option', { value: 'admin' }, '管理员'))),
          h('div', { className: 'wd-usr-field' }, h('label', null, '岗位角色'), h('select', {
            className: 'wd-usr-select', value: draft.jobRole,
            onChange: (event) => setDraft(Object.assign({}, draft, { jobRole: event.target.value })),
          }, roles.map((role) => h('option', { key: role.id, value: role.id }, role.label)))),
          h('button', {
            type: 'button',
            className: 'wd-usr-btn primary',
            disabled: busy || draft.username === '' || draft.password === '',
            onClick: () => run('创建账号', async () => {
              await usersRequest('/users', { method: 'POST', body: draft })
              setDraft({ username: '', password: '', role: 'user', jobRole: 'unassigned' })
            }),
          }, '创建账号'),
        ),
      )

      // —— 资源授权（缺口 1）：逐资源给主体授予/撤销 read|use|edit|manage ——
      const grantResourceKey = grantDraft.domain + '|' + grantDraft.id
      const grantsView = h(
        React.Fragment,
        null,
        grants === null
          ? h('div', { className: 'wd-usr-empty' }, '正在读取授权…')
          : grants.unavailable
            ? h('div', { className: 'wd-usr-msg info' },
                '资源授权后端尚未在此实例启用（需要 DSH 侧的 workdsh-grant-admin 插件）。',
                '启用后本页可逐资源授予 read / use / edit / manage；在此之前授权由岗位策略负责。')
            : grants.forbidden
            ? h('div', { className: 'wd-usr-msg info' },
                '当前账号的岗位角色不在授权管理范围内（需要「管理」或「运营」岗位）。')
            : h(
                React.Fragment,
                null,
                h(
                  'div',
                  { className: 'wd-usr-new' },
                  h('div', { className: 'wd-usr-field' }, h('label', null, '主体（账号）'),
                    h('select', {
                      className: 'wd-usr-select',
                      value: grantDraft.subjectPrincipalId,
                      onChange: (event) => setGrantDraft(Object.assign({}, grantDraft, { subjectPrincipalId: event.target.value })),
                    },
                    h('option', { value: '' }, '请选择账号'),
                    (grants.subjects || []).map((entry) => h('option', {
                      key: entry.principalId, value: entry.principalId,
                    }, (entry.username || entry.principalId) + (entry.jobRole ? '（' + ((roles.find((role) => role.id === entry.jobRole) || {}).label || entry.jobRole) + '）' : ''))))),
                  h('div', { className: 'wd-usr-field' }, h('label', null, '资源'),
                    h('select', {
                      className: 'wd-usr-select',
                      value: grantResourceKey,
                      onChange: (event) => {
                        const [domain, id] = String(event.target.value).split('|')
                        setGrantDraft(Object.assign({}, grantDraft, { domain, id }))
                      },
                    },
                    h('option', { value: '|' }, '请选择资源'),
                    (grants.resources || []).map((entry) => h('option', {
                      key: entry.domain + '|' + entry.id, value: entry.domain + '|' + entry.id,
                    }, entry.label + ' · ' + entry.domain.replace('workdsh-', ''))))),
                  h('div', { className: 'wd-usr-field' }, h('label', null, '动作'),
                    h('div', { className: 'wd-usr-caps' }, (grants.allowedActions || []).map((action) => h('label', {
                      key: action, className: 'wd-usr-cap', 'data-on': grantDraft.actions.includes(action) ? '1' : '0',
                    },
                    h('input', {
                      type: 'checkbox',
                      checked: grantDraft.actions.includes(action),
                      onChange: (event) => {
                        const next = event.target.checked
                          ? [...grantDraft.actions, action]
                          : grantDraft.actions.filter((value) => value !== action)
                        setGrantDraft(Object.assign({}, grantDraft, { actions: next }))
                      },
                    }), action)))),
                  h('button', {
                    type: 'button',
                    className: 'wd-usr-btn primary',
                    disabled: busy || grantDraft.subjectPrincipalId === '' || grantDraft.id === '' || grantDraft.actions.length === 0,
                    onClick: () => run('授权', () => usersRequest('/grants/apply', {
                      method: 'POST',
                      body: {
                        subjectPrincipalId: grantDraft.subjectPrincipalId,
                        domain: grantDraft.domain,
                        id: grantDraft.id,
                        actions: grantDraft.actions,
                      },
                    })),
                  }, '授权'),
                ),
                (grants.grants || []).length === 0
                  ? h('div', { className: 'wd-usr-empty' }, '当前没有任何资源授权记录。')
                  : h(
                      'div',
                      { className: 'wd-usr-tableWrap' },
                      h(
                        'table',
                        { className: 'wd-usr-table' },
                        h('thead', null, h('tr', null,
                          h('th', null, '主体'), h('th', null, '资源'), h('th', null, '动作'), h('th', null, '操作'))),
                        h('tbody', null, (grants.grants || []).map((grant) => h(
                          'tr',
                          { key: grant.id },
                          h('td', null, grant.subjectPrincipalId),
                          h('td', null, grant.resource?.domain + ' / ' + grant.resource?.id),
                          h('td', null, (grant.actions || []).join(', ')),
                          h('td', null, h('button', {
                            type: 'button',
                            className: 'wd-usr-btn danger',
                            disabled: busy,
                            onClick: () => run('撤销授权', () => usersRequest('/grants/revoke', {
                              method: 'POST', body: { grantId: grant.id },
                            })),
                          }, '撤销')),
                        ))),
                      ),
                    ),
              ),
        h('p', { className: 'wd-usr-note' },
          '授权的判定发生在 DSH 访问层：只有资源所有者、或已持有该资源 manage 的主体才能授权给他人；',
          '本页不做第二套权限判断。岗位策略（管理/运营自动获得站点资源的管理权）由收敛循环自动维护。'),
      )

      // —— 角色与权限矩阵 ——
      const rolesView = h(
        React.Fragment,
        null,
        h('div', { className: 'wd-usr-grid' }, roles.map((role) => h(
          'div',
          { className: 'wd-usr-card', key: role.id },
          h('p', { className: 'wd-usr-cardLabel' }, role.id === me.jobRole ? '我的岗位' : '岗位角色'),
          h('p', { className: 'wd-usr-cardValue' }, role.label),
          h('p', { className: 'wd-usr-cardNote' }, role.summary),
          h('p', { className: 'wd-usr-cardNote' }, role.capabilities.length + ' 项能力'),
        ))),
        h('p', { className: 'wd-usr-sec' }, '能力矩阵（行=能力，列=岗位）'),
        h(
          'div',
          { className: 'wd-usr-scroll' },
          h(
            'table',
            { className: 'wd-usr-matrix' },
            h('thead', null, h('tr', null,
              h('th', { style: { textAlign: 'left' } }, '能力'),
              h('th', null, '域'),
              roles.map((role) => h('th', { key: role.id }, role.label)),
            )),
            h('tbody', null, allCaps.map((entry) => h(
              'tr',
              { key: entry.id },
              h('td', { style: { textAlign: 'left' } }, entry.label, entry.enforced ? ' ✓' : ''),
              h('td', { className: 'wd-usr-area' }, entry.area),
              roles.map((role) => {
                const on = role.capabilities.includes(entry.id)
                return h('td', { key: role.id, className: on ? 'wd-usr-yes' : 'wd-usr-no' }, on ? '●' : '·')
              }),
            ))),
          ),
        ),
        h('p', { className: 'wd-usr-note' }, '能力后带 ✓ 表示门户侧已强制；其余为声明式，待 P1 身份打通与 P2 鉴权覆盖后生效。'),
      )

      // —— 注册与策略（仅管理员）——
      const securityView = h(
        React.Fragment,
        null,
        h(
          'div',
          { className: 'wd-usr-grid' },
          h(Card, { label: '注册开关', value: me.registration || 'invite', note: 'closed=关闭 / invite=邀请码 / open=开放' }),
          h(Card, { label: '口令下限', value: '12 位', note: '与容器主账号同一口径' }),
          h(Card, { label: '管理员保护', value: '最后一个管理员不可降级/停用', note: '门户侧强制（last-admin）' }),
          h(Card, { label: '内置主账号', value: '只读', note: '角色与口令由容器配置管理' }),
        ),
        h('div', { className: 'wd-usr-msg info' }, '放开注册前请先确认资源隔离：P1 身份打通与 P2 鉴权覆盖完成前，',
          '任一登录用户在 DSH 内部仍等同于站点主体，建议保持 invite。'),
        h('p', { className: 'wd-usr-sec' }, '相关后台'),
        h(
          'div',
          { className: 'wd-usr-links' },
          h('a', { className: 'wd-usr-btn', href: '/portal/admin', target: '_blank', rel: 'noreferrer' }, '产品页后台'),
          h('a', { className: 'wd-usr-btn', href: '/portal/zengzhi/admin', target: '_blank', rel: 'noreferrer' }, '增值业务后台'),
          h('a', { className: 'wd-usr-btn', href: '/portal', target: '_blank', rel: 'noreferrer' }, '门户首页'),
        ),
      )

      const body = tab === 'self' ? selfView
        : tab === 'accounts' ? accountsView
          : tab === 'grants' ? grantsView
            : tab === 'roles' ? rolesView
              : securityView

      return h(
        React.Fragment,
        null,
        h('style', null, USERS_STYLE),
        h(
          'div',
          { className: 'wd-usr' },
          h(
            'div',
            { className: 'wd-usr-head' },
            h(
              'div',
              null,
              h('h1', { className: 'wd-usr-title' }, '用户与权限'),
              h('p', { className: 'wd-usr-sub' },
                isAdmin
                  ? '管理员视图：可管理账号、指派岗位角色、查看能力矩阵。'
                  : '自助视图：可查看自己的账号、岗位角色与已授予的能力。'),
            ),
            h('div', { className: 'wd-usr-acts' },
              h('button', {
                type: 'button', className: 'wd-usr-btn', disabled: busy,
                onClick: () => run('刷新', () => Promise.resolve()),
              }, busy ? '刷新中…' : '刷新'),
              isAdmin ? h('a', { className: 'wd-usr-btn', href: '/portal/admin', target: '_blank', rel: 'noreferrer' }, '门户后台') : null,
            ),
          ),
          error ? h('div', { className: 'wd-usr-msg err' }, errorText(error)) : null,
          notice ? h('div', { className: 'wd-usr-msg ok' }, notice) : null,
          tabBar,
          body,
        ),
      )
    }

    /** 设置节标题的图标（设置导航里显示）。 */
    function UsersSectionIcon() {
      return h('span', { style: { display: 'inline-flex' } }, h(UsersIcon, { size: 16 }))
    }

    module.exports.name = 'workdsh-users-client'
    /** 只需要 slot 注册能力；数据一律走门户同源接口。 */
    module.exports.inject = ['slots']

    module.exports.apply = function apply(ctx) {
      // settings.section 是 list 槽：用新 id 即新增一节，不会顶掉官方或市场的分节。
      ctx.slots.inject('settings.section', () => ctx.slots.register(
        { name: 'settings.section', id: 'users', label: '用户与权限', order: 16 },
        UsersSection,
      ))
    }

    module.exports.UsersSection = UsersSection
    module.exports.UsersSectionIcon = UsersSectionIcon

    return module.exports
  },
})

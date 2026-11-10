// dsh-prompt-optimize — 浏览器半身（web）。
//
// 在 conversation.input.right 槽位挂一个星标按钮：点击后把当前输入框草稿
// POST 给宿主半身 /prompt-optimize/optimize，拿回改写结果后整体替换草稿，
// 再次点击可撤销还原。
//
// 客户端运行前提（DSH 前端模块加载器）：
//   - 本文件必须写成 window.__ModuleLoader__.load({ id, factory }) 的形式，
//     id 必须与 package.json 的 name 完全一致；
//   - factory 里只能用加载器冻结表里的 require('react')，不能 import 别的包；
//   - 样式一律内联，不注入 <style> 标签（避免污染宿主样式表）。

window.__ModuleLoader__.load({
  id: 'dsh-prompt-optimize',
  // 加载器契约：factory 只注入 require；exports/module 需自行创建并 return module.exports
  factory: require => {
    'use strict';

    var module = { exports: {} };
    var exports = module.exports;
    var React = require('react');
    var h = React.createElement;
    var useState = React.useState;
    var useRef = React.useRef;

    var SLOT = 'conversation.input.right';
    var API = '/prompt-optimize/optimize';
    var MAX_INPUT_BYTES = 4096; // 与 cordis.patch.yml 的 maxInputBytes 保持一致
    var CLIENT_TIMEOUT_MS = 70000;

    // ---------- 草稿读写 ----------
    //
    // 官方契约：`conversation.input.right`（kind=list，scope=session）由 ui-conversation
    // 注入标准 props `useInput: SnapshotSelectorHook<InputState>` 与 `inputActions: InputActions`。
    // 草稿状态只存在于 InputState（draft / phase），必须经 useInput(selector) 订阅；
    // slot props 上没有 inputState / getDraft 这类字段。

    function readDraft(props) {
      try {
        if (props && typeof props.useInput === 'function') {
          var d = props.useInput(function (s) {
            return (s && typeof s.draft === 'string') ? s.draft : '';
          });
          if (typeof d === 'string') return d;
        }
      } catch (e) { /* 探测失败按空草稿处理 */ }
      return '';
    }

    function readPhase(props) {
      try {
        if (props && typeof props.useInput === 'function') {
          var p = props.useInput(function (s) {
            return (s && typeof s.phase === 'string') ? s.phase : 'plain';
          });
          if (typeof p === 'string') return p;
        }
      } catch (e) { /* 忽略 */ }
      return 'plain';
    }

    function byteLen(s) {
      try { return new Blob([s]).size; } catch (e) { return s.length * 2; }
    }

    // ---------- 图标 ----------

    function StarIcon(props) {
      return h('svg', {
        width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true,
      }, h('path', {
        d: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z',
      }), h('path', { d: 'M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z' }));
    }

    function SpinnerIcon() {
      return h('svg', {
        width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round',
        'aria-hidden': true,
      }, h('g', null,
        h('circle', { cx: 12, cy: 12, r: 9, opacity: 0.25 }),
        h('path', { d: 'M21 12a9 9 0 0 0-9-9' },
          h('animateTransform', {
            attributeName: 'transform', type: 'rotate',
            from: '0 12 12', to: '360 12 12', dur: '0.8s', repeatCount: 'indefinite',
          }))));
    }

    function UndoIcon() {
      return h('svg', {
        width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true,
      }, h('path', { d: 'M9 14 4 9l5-5' }), h('path', { d: 'M4 9h10a6 6 0 0 1 0 12h-3' }));
    }

    // ---------- 按钮组件 ----------

    var loggedPropsOnce = false;

    function StarButton(props) {
      if (!loggedPropsOnce) {
        loggedPropsOnce = true;
        try { console.debug('[prompt-optimize] slot props:', Object.keys(props || {}).join(',')); } catch (e) { }
      }

      var _s = useState('init'); var state = _s[0]; var setState = _s[1];
      var _e = useState(''); var errMsg = _e[0]; var setErrMsg = _e[1];
      var originalRef = useRef('');

      var inputActions = props && props.inputActions;
      var canWrite = !!(inputActions && typeof inputActions.setDraft === 'function');
      var draft = readDraft(props);
      var phase = readPhase(props);
      var tooLong = byteLen(draft) > MAX_INPUT_BYTES;

      var disabledReason = '';
      if (!canWrite) disabledReason = '当前会话不支持写入输入框';
      else if (phase !== 'plain') disabledReason = '发送中，暂不可用';
      else if (state === 'loading') disabledReason = '';
      else if (!draft.trim()) disabledReason = '请先输入文字';
      else if (tooLong) disabledReason = '输入过长，最大长度为 ' + MAX_INPUT_BYTES + ' 字节';

      var title = state === 'loading' ? '正在优化您的输入…'
        : state === 'done' ? '撤销优化'
        : state === 'error' ? ('优化失败：' + (errMsg || '未知错误') + '，点击重试')
        : (disabledReason || '优化您的输入');

      function onClick() {
        if (!canWrite || phase !== 'plain') return;

        if (state === 'done') {
          try { inputActions.setDraft(originalRef.current); } catch (e) { }
          setState('init');
          return;
        }

        var text = draft.trim();
        if (!text || tooLong || state === 'loading') return;

        setState('loading');
        setErrMsg('');
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, CLIENT_TIMEOUT_MS);

        fetch(API, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: text }),
          signal: controller.signal,
        }).then(function (res) {
          return res.json().catch(function () { return null; }).then(function (j) {
            return { status: res.status, json: j };
          });
        }).then(function (out) {
          clearTimeout(timer);
          var j = out.json;
          if (j && j.ok && typeof j.optimized === 'string' && j.optimized.trim()) {
            originalRef.current = text;
            try {
              inputActions.setDraft(j.optimized.trim());
              setState('done');
            } catch (e) {
              setState('error');
              setErrMsg('写入输入框失败');
            }
          } else {
            setState('error');
            setErrMsg((j && j.error) || ('HTTP ' + out.status));
          }
        }).catch(function (e) {
          clearTimeout(timer);
          setState('error');
          setErrMsg(e && e.name === 'AbortError' ? '请求超时' : '网络错误');
        });
      }

      var disabled = !!disabledReason && state !== 'loading';

      return h('button', {
        type: 'button',
        onClick: onClick,
        disabled: disabled,
        title: title,
        'aria-label': title,
        style: {
          width: 28, height: 28, flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', borderRadius: 6, padding: 0, background: 'transparent',
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: state === 'done' ? '#3b82f6' : state === 'error' ? '#ef4444' : '#6b7280',
          opacity: disabled ? 0.45 : 1,
          transition: 'color 120ms, background 120ms',
        },
        onMouseEnter: function (e) { if (!disabled) e.currentTarget.style.background = 'rgba(0,0,0,0.06)'; },
        onMouseLeave: function (e) { e.currentTarget.style.background = 'transparent'; },
      },
        state === 'loading' ? h(SpinnerIcon)
          : state === 'done' ? h(UndoIcon)
          : h(StarIcon));
    }

    // ---------- 模块入口 ----------

    function apply(ctx) {
      ctx.slots.inject(SLOT, function () {
        return ctx.slots.register(
          { name: SLOT, id: 'prompt-optimize-star', order: 90, label: '优化您的输入' },
          function (props) { return h(StarButton, props); },
        );
      });
    }

    exports.name = 'prompt-optimize';
    exports.inject = ['slots'];
    exports.apply = apply;
    return module.exports;
  },
});

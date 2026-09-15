import * as React from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-session/client';
import type {} from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type { ActivityIdentity, ActivityPresentation } from 'workdsh-contracts/activity';
import { createPresentationRegistry } from './registry.js';
import { activityMessage, projectActivity } from './projection.js';
import { css } from './styles.js';

declare module '@deepseek-ai/cordis' { interface Context { activityPresentation: ActivityPresentation; } }
export const name = 'workdsh-activity-client';
export const inject = ['slots', 'sessions'];
const motionKey = 'workdsh.activity.motion.v1';
function readMotion() { try { return localStorage.getItem(motionKey) !== 'off'; } catch { return true; } }
function Face({ identity, phase }: { identity?: ActivityIdentity; phase: string }) {
  const avatar = identity?.avatar;
  const safe = avatar?.startsWith('data:image/png;base64,') || avatar?.startsWith('data:image/jpeg;base64,') || avatar?.startsWith('data:image/webp;base64,');
  return <span className="wd-activity-face" data-active={phase === 'working'} aria-hidden="true">{safe ? <img src={avatar} alt="" /> : identity?.kind === 'expert' || identity?.kind === 'team' ? identity.name.slice(0,1) : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><g className="wd-activity-eyes"><circle cx="9" cy="10" r=".8"/><circle cx="15" cy="10" r=".8"/></g>{phase === 'completed' || phase === 'idle' ? <path d="M7.5 13.5q4.5 5 9 0"/> : <path d="M8.5 14.5h7"/>}</svg>}</span>;
}

export function apply(ctx: Context): void {
  const registry = createPresentationRegistry();
  ctx.provide('activityPresentation', registry);
  const sessions = ctx.sessions as unknown as ISessions;
  ctx.effect(() => { const style = document.createElement('style'); style.textContent = css; style.dataset.workdshActivity = 'true'; document.head.append(style); return () => style.remove(); });

  function Bar(props: PropsRuntime<'conversation.session.header.utilities'>) {
    const session = props.useSession(value => value);
    const list = props.useSessions(value => value);
    const binding = sessions.binding(props.sessionId);
    const source = binding?.eventSource;
    const feed = React.useMemo(() => ({ subscribe: (listener: () => void) => source?.subscribe(listener) ?? (() => {}), getSnapshot: () => source?.getSnapshot() }), [source]);
    const window = React.useSyncExternalStore(feed.subscribe, feed.getSnapshot);
    const revision = React.useSyncExternalStore(registry.subscribe, registry.getRevision);
    const state = React.useMemo(() => projectActivity(window?.entries ?? [], session.running), [window, session.running]);
    const [expanded, setExpanded] = React.useState(false);
    const [motion, setMotion] = React.useState(readMotion);
    const [clock, setClock] = React.useState(Date.now);
    const [identities, setIdentities] = React.useState<ReadonlyMap<string, ActivityIdentity>>(new Map());
    const [labels, setLabels] = React.useState<ReadonlyMap<string,string>>(new Map());
    const catalog = list.subagentsByParent[props.sessionId];
    const children = catalog?.entries.filter(row => row.kind === 'child').slice(-20) ?? [];
    const ids = children.map(row => row.id).join('|');
    React.useEffect(() => {
      const cancel = new AbortController();
      for (const id of [props.sessionId, ...ids.split('|').filter(Boolean)]) {
        void registry.resolveIdentity(id, cancel.signal).then(identity => { if (!cancel.signal.aborted) setIdentities(previous => { const next = new Map(previous); if (identity) next.set(id, identity); else next.delete(id); return next; }); }).catch(() => { /* optional identity or cancelled session */ });
      }
      void registry.resolveSkillLabels().then(value => { if (!cancel.signal.aborted) setLabels(value); });
      return () => cancel.abort();
    }, [props.sessionId, ids, revision]);
    React.useEffect(() => { setIdentities(new Map()); setExpanded(false); }, [props.sessionId]);
    // The catalog is a sampled driver state, not a continuously running child feed.
    React.useEffect(() => {
      let disposed = false;
      const refresh = () => { if (!disposed) void sessions.refreshSubagents(props.sessionId).catch(() => { /* native catalog carries its error; retry while running */ }); };
      refresh();
      const timer = session.running ? windowGlobal.setInterval(refresh, 3000) : undefined;
      return () => { disposed = true; if (timer !== undefined) windowGlobal.clearInterval(timer); };
    }, [props.sessionId, session.running]);

    React.useEffect(() => { if (!session.running) return; setClock(Date.now()); const timer = windowGlobal.setInterval(() => setClock(Date.now()), 1000); return () => windowGlobal.clearInterval(timer); }, [session.running, props.sessionId]);
    React.useEffect(() => { const update = () => setMotion(readMotion()); windowGlobal.addEventListener('storage', update); return () => windowGlobal.removeEventListener('storage', update); }, []);
    React.useEffect(() => { if (!expanded) return; const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false); }; windowGlobal.addEventListener('keydown', escape); return () => windowGlobal.removeEventListener('keydown', escape); }, [expanded]);
    if (session.blank) return null;
    const identity = identities.get(props.sessionId);
    // The official Team panel owns roster, task board and member navigation.
    // Keep this strip for individual activity; do not show a second team status.
    if (identity?.kind === 'team' || children.length > 0) return null;
    const elapsed = state.startedAt ? Math.max(0, Math.floor((clock - state.startedAt)/1000)) : 0;
    const stale = session.running && state.lastProgressAt && clock - state.lastProgressAt > 120000;
    const text = stale ? '暂未收到新进展' : activityMessage(state);
    const changeMotion = (value: boolean) => { setMotion(value); try { localStorage.setItem(motionKey, value ? 'on' : 'off'); } catch { /* session-only fallback */ } };
    return <section className="wd-activity" aria-label="活动与协作进度" data-phase={state.phase} data-motion={motion} data-long={elapsed >= 480}>
      <div className="wd-activity-bar">
        <span className="wd-activity-people"><Face identity={identity} phase={state.phase}/></span>
        <div className="wd-activity-copy">
          <span className="wd-activity-title">工作动态</span>
          <span className="wd-activity-action" title={text}>
            {`${text}${state.skill ? ` · ${labels.get(state.skill) ?? state.skill}` : ''}`}
          </span>
        </div>
        {session.running && elapsed >= 60 && <span className="wd-activity-time">{Math.floor(elapsed/60)}分{elapsed%60}秒</span>}
        <button className="wd-activity-motion" title={motion ? '动画已开启，点击关闭' : '动画已关闭，点击开启'} aria-label={motion ? '关闭动态效果' : '开启动效'} aria-pressed={motion} onClick={() => changeMotion(!motion)}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4">{motion ? <><path d="M7 5v10M13 5v10"/></> : <path d="m7 4 8 6-8 6Z"/>}</svg></button>
        <button className="wd-activity-toggle" aria-label="展开协作详情" aria-expanded={expanded} aria-controls={`activity-${props.sessionId}`} onClick={() => setExpanded(!expanded)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d={expanded ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'}/></svg></button>
      </div>
      {expanded && <div className="wd-activity-details" id={`activity-${props.sessionId}`}><header><strong>{identity?.name ?? '助理'} · {activityMessage(state)}</strong><button aria-label="关闭协作详情" onClick={() => setExpanded(false)}>×</button></header>
        <p>状态来自原生任务记录。</p>

        {state.skill && <p>已加载技能：{labels.get(state.skill) ?? state.skill}</p>}
        {state.tool && <p>当前工具：{state.tool}</p>}
        <label><input type="checkbox" checked={motion} onChange={event => changeMotion(event.target.checked)}/>启用轻量动画</label><small>关闭后状态照常更新。遵循系统“减少动态效果”设置。</small>
      </div>}
    </section>;
  }
  // Public additive header utility slot. Local CSS reserves one strip beneath
  // the native tabs; native header, child slots and body keep their owners.
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities', id: 'workdsh-activity', order: 100,
  }, Bar));
}
const windowGlobal = globalThis.window;

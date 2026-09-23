import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { Icon, Modal } from 'workdsh-ui';
import type { AssistantCatalogEntry, AssistantDetail, AssistantReference, AssistantRevisionInput, AssistantSummary } from '../shared.js';
import type { AssistantManagementClient } from './management.js';
import { assistantCss } from './styles.js';

type Injected = { toggleNavigation: () => void; management: AssistantManagementClient };
type Props = PropsRuntime<'main'> & InjectFace<Injected>;
type Draft = {
  id?: string; expectedRevisionId?: string;
  name: string; description: string; goal: string; style: string; boundary: string; workspacePath: string;
  manual: boolean; schedule: string; inbound: string;
  references: readonly AssistantReference[];
};

const blank = (): Draft => ({ name: '', description: '', goal: '', style: '', boundary: '', workspacePath: '', manual: true, schedule: '', inbound: '', references: [] });
const kindLabels: Record<AssistantReference['kind'], string> = { skill: '技能', expert: '专家', connector: '连接器' };
const kindIcons: Record<AssistantReference['kind'], 'skills' | 'experts' | 'connectors'> = { skill: 'skills', expert: 'experts', connector: 'connectors' };
const input = (draft: Draft): AssistantRevisionInput => ({
  name: draft.name, description: draft.description,
  brief: { goal: draft.goal, style: draft.style, boundary: draft.boundary },
  references: draft.references,
  triggers: { manual: draft.manual, ...(draft.schedule.trim() ? { schedule: draft.schedule } : {}), ...(draft.inbound.trim() ? { inbound: draft.inbound } : {}) },
  ...(draft.workspacePath.trim() ? { workspacePath: draft.workspacePath } : {}),
});
const draftOf = (detail: AssistantDetail): Draft => ({
  id: detail.assistant.id, expectedRevisionId: detail.revision.id,
  name: detail.assistant.name, description: detail.assistant.description,
  goal: detail.revision.brief.goal, style: detail.revision.brief.style, boundary: detail.revision.brief.boundary,
  workspacePath: detail.revision.workspacePath ?? '',
  manual: detail.revision.triggers.manual, schedule: detail.revision.triggers.schedule ?? '', inbound: detail.revision.triggers.inbound ?? '',
  references: detail.revision.references,
});

export function AssistantPanel({ toggleNavigation, management }: Props) {
  const [rows, setRows] = useState<readonly AssistantSummary[]>([]); const [archived, setArchived] = useState<readonly AssistantSummary[]>([]);
  const [query, setQuery] = useState(''); const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [busy, setBusy] = useState(true); const [error, setError] = useState('');
  const [detail, setDetail] = useState<AssistantDetail>(); const [draft, setDraft] = useState<Draft>(); const [catalog, setCatalog] = useState<readonly AssistantCatalogEntry[]>([]);
  // Only identity and status matter here, so the detail view can hand over the full record too.
  const [archiveTarget, setArchiveTarget] = useState<Pick<AssistantSummary, 'id' | 'name' | 'status'>>();
  const refresh = useCallback(async () => {
    setBusy(true); setError('');
    try { const [active, trashed] = await Promise.all([management.list(), management.listArchived()]); setRows(active); setArchived(trashed); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '读取助理失败。'); }
    finally { setBusy(false); }
  }, [management]);
  useEffect(() => { void refresh(); }, [refresh]);
  const open = async (id: string) => { setError(''); try { setDetail(await management.get(id)); } catch (cause) { setError(cause instanceof Error ? cause.message : '无法读取助理详情。'); } };
  const edit = async (id: string) => {
    setError('');
    try { const [current, entries] = await Promise.all([management.get(id), management.catalog()]); setCatalog(entries); setDetail(undefined); setDraft(draftOf(current)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '无法读取助理内容。'); }
  };
  const create = async () => { setError(''); try { setCatalog(await management.catalog()); setDraft(blank()); } catch (cause) { setError(cause instanceof Error ? cause.message : '无法读取可引用能力。'); } };
  const save = async () => {
    if (!draft) return; setBusy(true); setError('');
    try {
      if (draft.id && draft.expectedRevisionId) await management.update(draft.id, draft.expectedRevisionId, input(draft));
      else await management.create(input(draft));
      setDraft(undefined); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存助理失败。'); setBusy(false); }
  };
  const setStatus = async () => {
    if (!archiveTarget) return; setBusy(true); setError('');
    try { await (archiveTarget.status === 'archived' ? management.restore(archiveTarget.id) : management.archive(archiveTarget.id)); setArchiveTarget(undefined); setDetail(undefined); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '变更助理状态失败。'); setBusy(false); }
  };
  const addReference = (entry: AssistantCatalogEntry) => {
    setDraft(current => current && !current.references.some(row => row.kind === entry.kind && row.id === entry.id)
      ? { ...current, references: [...current.references, { kind: entry.kind, id: entry.id, label: entry.label, ...(entry.revision ? { revision: entry.revision } : {}) }] }
      : current);
  };
  const removeReference = (kind: AssistantReference['kind'], id: string) => setDraft(current => current ? { ...current, references: current.references.filter(row => !(row.kind === kind && row.id === id)) } : current);
  const shown = (tab === 'active' ? rows : archived);
  const needle = query.trim().toLowerCase();
  const filtered = shown.filter(row => `${row.name} ${row.description}`.toLowerCase().includes(needle));
  const grouped = (['skill', 'expert', 'connector'] as const).map(kind => [kind, catalog.filter(entry => entry.kind === kind)] as const).filter(([, entries]) => entries.length);
  const pendingEntry = (kind: AssistantReference['kind'], id: string) => catalog.find(entry => entry.kind === kind && entry.id === id);
  return <section className="wd-assistant" data-testid="workdsh-assistant"><style>{assistantCss}</style>
    <header className="cap-header"><button className="nav-toggle" onClick={toggleNavigation} aria-label="切换导航">导航</button>
      <input className="search" aria-label="搜索助理" placeholder="搜索助理" value={query} onChange={event => setQuery(event.currentTarget.value)} /></header>
    <div className="assistant-head"><span className="title-icon"><Icon name="assistant" /></span><div><h1>助理</h1><p>把面向具体工作的职责、可用的能力与触发方式记成一个可复用的入口</p></div>
      <div className="head-actions"><button className="secondary" onClick={() => void refresh()} disabled={busy}>刷新</button><button className="primary" onClick={() => void create()} disabled={busy}>＋ 新建助理</button></div></div>
    <div className="tabs"><button className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>使用中 {rows.length}</button><button className={tab === 'archived' ? 'active' : ''} onClick={() => setTab('archived')}>已归档 {archived.length}</button></div>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <div className="list-meta"><strong>{tab === 'active' ? '我的助理' : '已归档助理'} <span className="count">{filtered.length}</span></strong><span className="muted">助理不保存会话与凭据，也不会自行发起任务</span></div>
    {!busy && !filtered.length ? <div className="empty">{needle ? '没有匹配的助理。' : tab === 'active' ? '尚未创建助理，点击“新建助理”把一项固定工作记成入口。' : '没有已归档的助理。'}</div> : null}
    {filtered.length ? <div className="assistant-grid">{filtered.map(row => <button key={row.id} className={`assistant-card ${row.status === 'archived' ? 'archived' : ''}`} onClick={() => void open(row.id)}>
      <span className="card-title"><strong title={row.name}>{row.name}</strong>{row.unavailableCount ? <span className="badge warn">{row.unavailableCount} 项引用不可用</span> : null}</span>
      <span className="card-body">{row.description || '未填写说明'}</span>
      <span className="card-foot"><span>修订 {row.revisionNumber} · 引用 {row.referenceCount}</span><span>{new Date(row.updatedAt).toLocaleDateString()}</span></span>
    </button>)}</div> : null}
    <Modal open={Boolean(detail)} label="助理详情" className="assistant-dialog wide" onClose={() => setDetail(undefined)}>
      {detail ? <><div className="hero"><span className="mark" aria-hidden>{detail.assistant.name.charAt(0).toUpperCase()}</span><div><h1>{detail.assistant.name}</h1><p>修订 {detail.revision.number} · {detail.assistant.status === 'archived' ? '已归档' : '使用中'}</p></div></div>
        <p>{detail.assistant.description || '未填写说明'}</p>
        <div className="section"><h2>职责描述</h2>
          <p className="field"><small>工作目标</small>{detail.revision.brief.goal}</p>
          <p className="field"><small>风格</small>{detail.revision.brief.style || '未填写'}</p>
          <p className="field"><small>边界</small>{detail.revision.brief.boundary || '未填写'}</p>
          {detail.revision.workspacePath ? <p className="field"><small>工作目录（仅记录）</small><code>{detail.revision.workspacePath}</code></p> : null}</div>
        <div className="section"><h2>引用能力</h2>{detail.resolutions.length ? <ul className="ref-list">{detail.resolutions.map(row => <li key={`${row.reference.kind}:${row.reference.id}`}>
          <span className="ref-kind">{kindLabels[row.reference.kind]}</span><Icon name={kindIcons[row.reference.kind]} /><span className="ref-name" title={row.reference.label}>{row.reference.label}</span>
          <span className={`ref-note ${row.available ? '' : 'bad'}`}>{row.available ? '可用' : row.reason ?? '不可用'}</span></li>)}</ul> : <p className="muted">尚未引用技能、专家或连接器。</p>}</div>
        <div className="section"><h2>触发方式</h2><p className="field">
          {[detail.revision.triggers.manual ? '手动发起' : '', detail.revision.triggers.schedule ? `周期：${detail.revision.triggers.schedule}` : '', detail.revision.triggers.inbound ? `入站：${detail.revision.triggers.inbound}` : ''].filter(Boolean).join(' · ') || '未设置'}
          <small>周期与入站首期只记录为意图；实际执行由「定时任务」模块负责，助理本身不启动任务。</small></p></div>
        <div className="form-actions"><button className="secondary" onClick={() => setArchiveTarget(detail.assistant)}>{detail.assistant.status === 'archived' ? '恢复' : '归档'}</button><button className="primary" onClick={() => void edit(detail.assistant.id)}>编辑</button></div></> : null}
    </Modal>
    <Modal open={Boolean(draft)} label={draft?.id ? '编辑助理' : '新建助理'} className="assistant-dialog wide" onClose={() => setDraft(undefined)}>
      <h1>{draft?.id ? '编辑助理' : '新建助理'}</h1><p>{draft?.id ? '保存会追加一个新修订，历史修订不会被改写。' : '助理只记录职责、引用与触发意图；保存后不会启动任何任务。'}</p>
      {draft ? <div className="form">
        <label>名称<input value={draft.name} onChange={event => setDraft({ ...draft, name: event.currentTarget.value })} /></label>
        <label>工作目录（可选，仅记录）<input value={draft.workspacePath} placeholder="/Users/…/project" onChange={event => setDraft({ ...draft, workspacePath: event.currentTarget.value })} /></label>
        <label className="wide">说明<input value={draft.description} onChange={event => setDraft({ ...draft, description: event.currentTarget.value })} /></label>
        <label className="wide">工作目标<textarea value={draft.goal} placeholder="这个助理要完成什么工作，交付什么成果。" onChange={event => setDraft({ ...draft, goal: event.currentTarget.value })} /></label>
        <label>风格<textarea value={draft.style} onChange={event => setDraft({ ...draft, style: event.currentTarget.value })} /></label>
        <label>边界<textarea value={draft.boundary} placeholder="这个助理不做的事。" onChange={event => setDraft({ ...draft, boundary: event.currentTarget.value })} /></label>
        <div className="section wide"><h2>引用能力</h2>
          {draft.references.length ? <ul className="ref-list">{draft.references.map(row => <li key={`${row.kind}:${row.id}`}><span className="ref-kind">{kindLabels[row.kind]}</span><span className="ref-name" title={row.label}>{row.label}</span>
            {pendingEntry(row.kind, row.id) ? null : <span className="ref-note bad">不在当前可选范围</span>}
            <button className="ref-remove" aria-label={`移除 ${row.label}`} onClick={() => removeReference(row.kind, row.id)}>移除</button></li>)}</ul> : <p className="muted">尚未引用能力。只能引用已存在的技能、专家修订与连接器实例。</p>}
          <div className="picker wide"><select aria-label="选择要引用的能力" defaultValue=""
            onChange={event => { const entry = catalog.find(row => `${row.kind}:${row.id}` === event.currentTarget.value); if (entry) addReference(entry); event.currentTarget.value = ''; }}>
            <option value="">从已存在的能力中选择…</option>
            {grouped.map(([kind, entries]) => <optgroup key={kind} label={kindLabels[kind]}>{entries.map(entry => <option key={`${entry.kind}:${entry.id}`} value={`${entry.kind}:${entry.id}`}>{entry.label} · {entry.detail}</option>)}</optgroup>)}
          </select></div>
          {!grouped.length ? <p className="muted">当前没有可引用的能力：请先在「专家 · 技能 · 连接器」创建技能或专家。</p> : null}</div>
        <div className="section wide"><h2>触发方式</h2><div className="checks">
          <label><input type="checkbox" checked={draft.manual} onChange={event => setDraft({ ...draft, manual: event.currentTarget.checked })} />手动发起</label>
          <label>周期<input value={draft.schedule} placeholder="例如 每个工作日 09:00" onChange={event => setDraft({ ...draft, schedule: event.currentTarget.value })} /></label>
          <label>入站来源<input value={draft.inbound} placeholder="例如 内部群消息" onChange={event => setDraft({ ...draft, inbound: event.currentTarget.value })} /></label></div></div>
        <div className="form-note">周期与入站首期只保存为修订字段，不会注册调度器，也不会建立外部消息入口；保存时不会打开工作目录，也不会写入任何凭据。</div>
        <div className="form-actions wide"><button className="secondary" onClick={() => setDraft(undefined)}>取消</button><button className="primary" disabled={busy || !draft.name.trim() || !draft.goal.trim() || (!draft.manual && !draft.schedule.trim() && !draft.inbound.trim())} onClick={() => void save()}>{draft.id ? '保存新修订' : '创建助理'}</button></div></div> : null}
    </Modal>
    <Modal open={Boolean(archiveTarget)} label="变更助理状态" className="assistant-dialog" onClose={() => setArchiveTarget(undefined)}>
      <h1>{archiveTarget?.status === 'archived' ? `恢复“${archiveTarget.name}”?` : `归档“${archiveTarget?.name}”?`}</h1>
      <p>{archiveTarget?.status === 'archived' ? '恢复后重新出现在使用中的助理列表。' : '归档后不再是使用中的入口，历史修订与引用保留，可随时恢复；运行中的任务不受影响。'}</p>
      <div className="form-actions"><button className="secondary" onClick={() => setArchiveTarget(undefined)}>取消</button><button className="primary" onClick={() => void setStatus()}>{archiveTarget?.status === 'archived' ? '恢复' : '归档'}</button></div>
    </Modal>
  </section>;
}

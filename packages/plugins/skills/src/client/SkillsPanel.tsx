import { Icon, Modal, type IconName } from 'workdsh-ui';
import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { ManagedSkillDetail, ManagedSkillResource, ManagedSkillSummary, SkillDependencyImpact, TrashedSkillSummary } from '../shared.js';
import type { SkillTaskKind } from './drafts.js';
import type { SkillManagementClient } from './management.js';
import { ImportSkillModal } from './ImportSkillModal.js';
import { skillsActionsCss, skillsCss } from './styles.js';

type SkillsPanelInjected = {
  toggleNavigation: () => void;
  management: SkillManagementClient;
  startSkillTask: (kind: SkillTaskKind, name?: string) => Promise<void>;
  startSkillTrial: (name: string) => Promise<void>;
  /** Switch the shared capability center to another registered panel (e.g. experts). */
  openCapability: (key: string) => void;
  hasCapability: (key: string) => boolean;
};
type SkillsPanelProps = PropsRuntime<'main'> & InjectFace<SkillsPanelInjected>;

function icon(kind: string) { return <Icon name={kind as IconName} />; }
function messageOf(cause: unknown): string { return cause instanceof Error ? cause.message : '技能操作失败，请重试。'; }

export function SkillsPanel({ toggleNavigation, management, startSkillTask, startSkillTrial, openCapability, hasCapability }: SkillsPanelProps) {
  const [skills, setSkills] = useState<readonly ManagedSkillSummary[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<ManagedSkillDetail>();
  const [editing, setEditing] = useState(false);
  const [skillDocument, setSkillDocument] = useState('');
  const [resource, setResource] = useState<(ManagedSkillResource & { isNew?: boolean })>();
  const [resourceDocument, setResourceDocument] = useState('');
  const [newResourcePath, setNewResourcePath] = useState('');
  const [trash, setTrash] = useState<readonly TrashedSkillSummary[]>([]);
  const [trashOpen, setTrashOpen] = useState(false);
  const [confirmUninstall, setConfirmUninstall] = useState<{ skill: ManagedSkillSummary; impact: SkillDependencyImpact }>();
  const [creating, setCreating] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [actionMenu, setActionMenu] = useState<string>();
  const [batchMode, setBatchMode] = useState(false);
  const [selectedNames, setSelectedNames] = useState<readonly string[]>([]);
  const [confirmBatchUninstall, setConfirmBatchUninstall] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const addMenu = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    setBusy(true); setError('');
    try { setSkills(await management.list()); }
    catch (cause) { console.error('[workdsh:skills:list]', cause); setError(messageOf(cause)); }
    finally { setBusy(false); }
  }, [management]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const revalidate = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', revalidate); document.addEventListener('visibilitychange', revalidate);
    return () => { window.removeEventListener('focus', revalidate); document.removeEventListener('visibilitychange', revalidate); };
  }, [refresh]);
  useEffect(() => {
    if (!addMenuOpen) return;
    const outside = (event: PointerEvent) => { if (!addMenu.current?.contains(event.target as Node)) setAddMenuOpen(false); };
    document.addEventListener('pointerdown', outside); return () => document.removeEventListener('pointerdown', outside);
  }, [addMenuOpen]);
  useEffect(() => {
    if (!actionMenu) return;
    const outside = (event: PointerEvent) => { if (!(event.target instanceof Element) || !event.target.closest('.card-actions')) setActionMenu(undefined); };
    document.addEventListener('pointerdown', outside); return () => document.removeEventListener('pointerdown', outside);
  }, [actionMenu]);

  const openDetail = async (name: string) => {
    setActionMenu(undefined); setError('');
    try { const detail = await management.detail(name); setSelected(detail); setSkillDocument(detail.document ?? ''); setEditing(false); setResource(undefined); }
    catch (cause) { setError(messageOf(cause)); }
  };
  const beginSkillTask = async (kind: SkillTaskKind) => {
    setCreating(true); setAddMenuOpen(false); setError('');
    try { await startSkillTask(kind); }
    catch (cause) { setError(messageOf(cause)); setCreating(false); }
  };
  const trial = async (name: string) => { setCreating(true); try { await startSkillTrial(name); } catch (cause) { setError(messageOf(cause)); setCreating(false); } };
  const setEnabled = async (skill: ManagedSkillSummary, enabled: boolean) => {
    setActionMenu(undefined); setError('');
    try { await management.setEnabled(skill.name, enabled); await refresh(); if (selected?.name === skill.name) await openDetail(skill.name); }
    catch (cause) { setError(messageOf(cause)); }
  };
  const openDirectory = async (skill: ManagedSkillSummary) => {
    setActionMenu(undefined); setError('');
    try { const detail = selected?.name === skill.name ? selected : await management.detail(skill.name); if (!detail.directoryPath) throw new Error('该技能来源不提供可打开的本地目录。'); await management.openDirectory(detail.directoryPath); }
    catch (cause) { setError(messageOf(cause)); }
  };
  const save = async () => {
    if (!selected?.revision) return;
    setBusy(true); setError('');
    try { const next = await management.update({ name: selected.name, document: skillDocument, expectedRevision: selected.revision }); setSelected(next); setSkillDocument(next.document ?? ''); setEditing(false); await refresh(); }
    catch (cause) { setError(messageOf(cause)); setBusy(false); }
  };
  const uninstall = async () => {
    if (!confirmUninstall) return;
    setBusy(true); setError('');
    try { await management.uninstall(confirmUninstall.skill.name, confirmUninstall.impact.revision); if (selected?.name === confirmUninstall.skill.name) setSelected(undefined); setConfirmUninstall(undefined); await refresh(); }
    catch (cause) { setError(messageOf(cause)); setBusy(false); setConfirmUninstall(undefined); }
  };
  const prepareUninstall = async (skill: ManagedSkillSummary) => {
    setActionMenu(undefined); setError('');
    try { setConfirmUninstall({ skill, impact: await management.dependencyImpact(skill.name) }); }
    catch (cause) { setError(messageOf(cause)); }
  };
  const openTrash = async () => {
    setError('');
    try { setTrash(await management.listTrash()); setTrashOpen(true); }
    catch (cause) { setError(messageOf(cause)); }
  };
  const restore = async (entry: TrashedSkillSummary) => {
    setBusy(true); setError('');
    try { await management.restore(entry.id); setTrash(await management.listTrash()); await refresh(); }
    catch (cause) { setError(messageOf(cause)); setBusy(false); }
  };
  const openResource = async (path: string) => {
    if (!selected) return;
    setError('');
    try { const next = await management.resource(selected.name, path); setResource(next); setResourceDocument(next.document); }
    catch (cause) { setError(messageOf(cause)); }
  };
  const beginResource = () => {
    const path = newResourcePath.trim();
    if (!path) return;
    setResource({ path, document: '', revision: '', isNew: true }); setResourceDocument(''); setNewResourcePath('');
  };
  const saveResource = async () => {
    if (!selected || !resource) return;
    setBusy(true); setError('');
    try {
      const next = await management.writeResource({ name: selected.name, path: resource.path, document: resourceDocument, expectedRevision: resource.isNew ? undefined : resource.revision });
      const detail = await management.detail(selected.name); setSelected(detail); setResource(next); setResourceDocument(next.document); await refresh();
    } catch (cause) { setError(messageOf(cause)); setBusy(false); }
  };
  const toggleBatchSelection = (name: string) => setSelectedNames(current => current.includes(name) ? current.filter(item => item !== name) : [...current, name]);
  const runBatch = async (action: 'enable' | 'disable' | 'uninstall') => {
    if (!selectedNames.length) return;
    setBusy(true); setError('');
    try {
      const result = await management.batch(selectedNames, action);
      const failed = result.results.filter(item => !item.ok);
      await refresh();
      setSelectedNames(failed.map(item => item.name));
      if (failed.length) setError(`${result.results.length - failed.length} 项成功，${failed.length} 项失败：${failed.map(item => `${item.name}（${item.error}）`).join('；')}`);
      else { setBatchMode(false); setSelectedNames([]); }
      setConfirmBatchUninstall(false);
    } catch (cause) { setError(messageOf(cause)); setBusy(false); setConfirmBatchUninstall(false); }
  };

  const normalized = query.trim().toLowerCase();
  const filtered = skills.filter(skill => `${skill.name} ${skill.description} ${skill.whenToUse ?? ''}`.toLowerCase().includes(normalized));
  const capabilityTabs = [['experts', '专家'], ['skills', '技能'], ['connectors', '连接器'], ['apps', '行业应用']] as const;
  const capabilityKey: Record<string, string> = { experts: 'workdsh-experts', skills: 'workdsh-skills' };
  const plannedCategories = ['办公协同', '开发工具', '数据分析', '内容创作', '知识学习'] as const;
  return <section className="wd-skills" data-testid="workdsh-skills">
    <style>{skillsCss + skillsActionsCss}</style>
    <header className="cap-header">
      <button className="nav-toggle" onClick={toggleNavigation} aria-label="切换导航">导航</button>
      {capabilityTabs.map(([key, label]) => {
        const active = key === 'skills';
        const target = capabilityKey[key];
        const enabled = active || (target !== undefined && hasCapability(target));
        return <button key={key} className={`cap-tab ${active ? 'active' : ''}`} disabled={!enabled}
          aria-current={active ? 'page' : undefined}
          onClick={() => { if (!active && target) openCapability(target); }}>{icon(key)}{label}</button>;
      })}
      <input ref={search} className="search" aria-label="搜索技能" placeholder="搜索技能" value={query} onChange={event => setQuery(event.currentTarget.value)} />
      <span className="installed-count" role="status" aria-label={`已安装 ${skills.length} 个技能`}>我安装的 {skills.length}</span>
      <button className={batchMode ? 'batch-toggle active' : 'batch-toggle'} onClick={() => { setBatchMode(value => !value); setSelectedNames([]); }}>{batchMode ? '退出批量' : '批量管理'}</button>
      <button className="trash-button" onClick={() => void openTrash()}>最近卸载</button>
      <div className="add-menu-wrap" ref={addMenu}><button className="add-skill" disabled={creating} aria-haspopup="menu" aria-expanded={addMenuOpen} onClick={() => setAddMenuOpen(open => !open)}>＋ 添加技能</button>{addMenuOpen && <div className="add-menu" role="menu"><button role="menuitem" onClick={() => { setAddMenuOpen(false); search.current?.focus(); }}>查找技能</button><button role="menuitem" onClick={() => { setAddMenuOpen(false); setImportOpen(true); }}>上传技能</button><button role="menuitem" onClick={() => void beginSkillTask('create')}>创建技能</button></div>}</div>
    </header>
    <div className="section-head"><h1>技能库</h1><button className="refresh" onClick={() => void refresh()} disabled={busy}>刷新</button></div>
    <nav className="category-tabs" aria-label="技能分类"><button className="active" aria-current="page">全部</button>{plannedCategories.map(label => <button key={label} disabled title="公共技能目录上线后开放">{label}</button>)}</nav>
    {batchMode && <div className="batch-bar" role="toolbar" aria-label="批量管理技能"><span>已选择 {selectedNames.length} 项</span><button disabled={!selectedNames.length || busy} onClick={() => void runBatch('enable')}>启用</button><button disabled={!selectedNames.length || busy} onClick={() => void runBatch('disable')}>停用</button><button className="danger" disabled={!selectedNames.length || busy} onClick={() => setConfirmBatchUninstall(true)}>卸载</button></div>}
    <div role="status" aria-live="polite" className={error ? 'error counts' : 'muted counts'}>{busy ? '正在读取…' : error || `共 ${skills.length} 个技能 · 当前显示 ${filtered.length} 个`}</div>
    {!busy && !filtered.length ? <div className="empty"><strong>{skills.length ? '没有匹配的技能' : '尚未发现已安装技能'}</strong></div> : <div className="grid">{filtered.map(skill => <article className={`card ${skill.state === 'disabled' ? 'disabled' : skill.state === 'invalid' ? 'invalid' : ''} ${actionMenu === skill.name ? 'menu-open' : ''}`} key={skill.name}>
      <div className="card-top">{batchMode && skill.manageable ? <button className="batch-check" role="checkbox" aria-checked={selectedNames.includes(skill.name)} aria-label={`选择技能 ${skill.name}`} onClick={() => toggleBatchSelection(skill.name)}>{selectedNames.includes(skill.name) ? '✓' : ''}</button> : null}<button className="card-open" aria-label={`查看技能 ${skill.name}`} onClick={() => batchMode && skill.manageable ? toggleBatchSelection(skill.name) : void openDetail(skill.name)}><span className="skill-mark" aria-hidden>{skill.name[0]}</span><strong title={skill.name}>{skill.name}</strong></button>
        {!batchMode && skill.manageable && <div className="card-actions"><button className="more-button" aria-label={`管理技能 ${skill.name}`} aria-haspopup="menu" aria-expanded={actionMenu === skill.name} onClick={() => setActionMenu(current => current === skill.name ? undefined : skill.name)}>•••</button>{actionMenu === skill.name && <div className="card-menu" role="menu"><button role="menuitem" disabled={skill.state !== 'enabled'} onClick={() => void trial(skill.name)}>去试试</button><button role="menuitem" onClick={() => void openDetail(skill.name)}>编辑</button><button role="menuitem" onClick={() => void openDirectory(skill)}>打开文件夹</button><button className="danger" role="menuitem" onClick={() => void prepareUninstall(skill)}>卸载</button></div>}</div>}
        {!batchMode && <button className="switch" role="switch" disabled={!skill.manageable || skill.state === 'invalid'} aria-checked={skill.state === 'enabled'} aria-label={`${skill.state === 'enabled' ? '停用' : '启用'}技能 ${skill.name}`} onClick={() => void setEnabled(skill, skill.state !== 'enabled')} />}
      </div><p className="muted">{skill.description}</p>{skill.state === 'invalid' && <small className="diagnostic">需要修复 · {skill.diagnostics?.[0]?.message}</small>}
    </article>)}</div>}

    <Modal open={Boolean(selected)} label={selected ? `${selected.name} 技能详情` : '技能详情'} className="skill-detail-dialog" onClose={() => { setSelected(undefined); setEditing(false); setResource(undefined); }}>
      {selected && <article data-testid="skill-detail"><div className="detail-hero"><span className="skill-mark" aria-hidden>{selected.name[0]}</span><div className="detail-title"><h1>{selected.name}</h1><div className="detail-actions"><button className="try" disabled={selected.state !== 'enabled'} onClick={() => void trial(selected.name)}>去试试</button>{selected.manageable && <><button onClick={() => setEditing(true)}>编辑</button><button onClick={() => void openDirectory(selected)}>打开文件夹</button><button className="danger" onClick={() => void prepareUninstall(selected)}>卸载</button></>}</div></div><button className="switch" role="switch" disabled={!selected.manageable || selected.state === 'invalid'} aria-checked={selected.state === 'enabled'} onClick={() => void setEnabled(selected, selected.state !== 'enabled')} /></div>
        <p className="detail-summary">{selected.description}</p><h2 className="detail-section-title">{icon('file')}概述</h2>
        <div className="detail-body">{resource ? <><div className="resource-editor-head"><button onClick={() => setResource(undefined)}>返回概述</button><strong>{resource.path}</strong></div><label className="editor-label" htmlFor="resource-document">资源文件</label><textarea id="resource-document" className="skill-editor" value={resourceDocument} onChange={event => setResourceDocument(event.currentTarget.value)} spellCheck={false} /><div className="editor-actions"><button onClick={() => { setResourceDocument(resource.document); setResource(undefined); }}>取消</button><button className="save" disabled={busy || (!resource.isNew && resourceDocument === resource.document)} onClick={() => void saveResource()}>保存资源</button></div></> : editing ? <><label className="editor-label" htmlFor="skill-document">SKILL.md</label><textarea id="skill-document" className="skill-editor" value={skillDocument} onChange={event => setSkillDocument(event.currentTarget.value)} spellCheck={false} /><div className="editor-actions"><button onClick={() => { setSkillDocument(selected.document ?? ''); setEditing(false); }}>取消</button><button className="save" disabled={busy || skillDocument === selected.document} onClick={() => void save()}>保存并重新发现</button></div></> : <><dl><dt>名称</dt><dd>{selected.name}</dd><dt>状态</dt><dd>{selected.state === 'enabled' ? '已启用' : selected.state === 'disabled' ? '已停用' : selected.state === 'invalid' ? '需要修复' : '只读'}</dd><dt>调用方式</dt><dd><code className="command">/{selected.name}</code></dd></dl>{selected.diagnostics?.length ? <section className="validation-errors"><h3>校验问题</h3><ul>{selected.diagnostics.map(item => <li key={`${item.code}-${item.path ?? ''}`}>{item.message}</li>)}</ul><button onClick={() => setEditing(true)}>修复 SKILL.md</button></section> : null}{selected.manageable && <section className="resource-section"><h3>资源文件</h3>{selected.resources.length ? <div className="resource-list">{selected.resources.map(path => <button key={path} onClick={() => void openResource(path)}>{path}</button>)}</div> : <p className="muted">暂无附加资源</p>}<div className="new-resource"><input aria-label="新资源路径" placeholder="例如 references/guide.md" value={newResourcePath} onChange={event => setNewResourcePath(event.currentTarget.value)} /><button disabled={!newResourcePath.trim()} onClick={beginResource}>新建资源</button></div></section>}<pre className="skill-document">{selected.document ?? selected.whenToUse ?? selected.description}</pre></>}{error && <p className="error" role="alert">{error}</p>}</div>
      </article>}
    </Modal>
    <Modal open={Boolean(confirmUninstall)} label="确认卸载技能" className="confirm-dialog" onClose={() => setConfirmUninstall(undefined)}>{confirmUninstall && <div><h2>卸载 {confirmUninstall.skill.name}？</h2><p>技能将移入 WorkDSH 回收目录，并从所有任务的可调用技能中移除。</p>{confirmUninstall.impact.dependents.length ? <div className="dependency-impact"><strong>依赖影响</strong><ul>{confirmUninstall.impact.dependents.map(item => <li key={`${item.kind}-${item.id}`}>{item.label}{item.blocking ? '（需先解除）' : ''}</li>)}</ul></div> : <p className="dependency-clear">未发现 WorkDSH 对象依赖此技能。</p>}<div className="confirm-actions"><button onClick={() => setConfirmUninstall(undefined)}>取消</button><button className="danger solid" disabled={confirmUninstall.impact.dependents.some(item => item.blocking)} onClick={() => void uninstall()}>确认卸载</button></div></div>}</Modal>
    <Modal open={confirmBatchUninstall} label="确认批量卸载技能" className="confirm-dialog" onClose={() => setConfirmBatchUninstall(false)}><div><h2>卸载所选 {selectedNames.length} 个技能？</h2><p>每个成功卸载的技能会分别进入可恢复目录；失败项会保留选择并显示原因。</p><div className="confirm-actions"><button onClick={() => setConfirmBatchUninstall(false)}>取消</button><button className="danger solid" onClick={() => void runBatch('uninstall')}>确认卸载</button></div></div></Modal>
    <Modal open={trashOpen} label="最近卸载的技能" className="trash-dialog" onClose={() => setTrashOpen(false)}><h2>最近卸载</h2>{trash.length ? <div className="trash-list">{trash.map(entry => <div key={entry.id}><div><strong>{entry.name}</strong><small>{new Date(entry.removedAt).toLocaleString()} · {entry.previousState === 'enabled' ? '原为启用' : '原为停用'}</small></div><button disabled={busy} onClick={() => void restore(entry)}>恢复</button></div>)}</div> : <p className="muted">没有可恢复的技能。</p>}{error && <p className="error" role="alert">{error}</p>}</Modal>
    <ImportSkillModal open={importOpen} management={management} onClose={() => setImportOpen(false)} onInstalled={async name => { await refresh(); await openDetail(name); }} />
  </section>;
}

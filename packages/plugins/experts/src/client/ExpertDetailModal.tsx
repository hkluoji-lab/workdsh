import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExpertAvailability, ExpertDefinition, ExpertDetail, ExpertSkillOption } from '../shared.js';
import { skillStateLabel } from './SkillPicker.js';
import type { ExpertManagementClient } from './management.js';
import { ExpertWorkSummary } from './ExpertWorkSummary.js';

export type ExpertDetailModalProps = {
  readonly expertId: string;
  readonly management: ExpertManagementClient;
  readonly acting: boolean;
  readonly onClose: () => void;
  /** Seed a fresh bound native Session with an optional example prompt; never auto-sends. */
  readonly onSummon: (expertId: string, revisionId: string | undefined, draftText: string | undefined) => void;
  readonly onEditDraft: (expertId: string) => void;
  readonly onCopy: (expertId: string, revisionId: string | undefined) => Promise<void>;
  readonly onAvailability: (expertId: string, availability: ExpertAvailability) => Promise<void>;
  readonly onExport: (expertId: string) => Promise<void>;
  readonly onChanged: () => void;
};

const ORIGIN_LABEL: Record<string, string> = { default: '默认模板', personal: '我的专家', organization: '组织' };
const AVAILABILITY_LABEL: Record<ExpertAvailability, string> = { enabled: '已启用', disabled: '已停用', archived: '已归档' };
const READINESS: Record<string, { label: string; cls: string; hint: string }> = {
  ready: { label: '可用', cls: 'ready', hint: '该专家已发布且依赖完整，可直接召唤。' },
  'missing-dependency': { label: '依赖缺失', cls: 'bad', hint: '存在缺失或漂移的 Skill 依赖，请到「技能」能力中心修复后再召唤。' },
  'unsupported-capability': { label: '能力未满足', cls: 'warn', hint: '存在尚未满足的必需能力，暂不可召唤。' },
  broken: { label: 'preset 异常', cls: 'bad', hint: '专家 preset 不可用，请重新发布后再召唤。' },
  unknown: { label: '未发布', cls: '', hint: '该专家尚未发布，无法召唤。' },
};

function messageOf(cause: unknown): string { return cause instanceof Error ? cause.message : '读取专家详情失败，请重试。'; }

function Prose({ title, body }: { title: string; body: string }) {
  if (!body.trim()) return null;
  return <div className="prose-block"><h4>{title}</h4>{body}</div>;
}

export function ExpertDetailModal({ expertId, management, acting, onClose, onSummon, onEditDraft, onCopy, onAvailability, onExport, onChanged }: ExpertDetailModalProps) {
  const [skills, setSkills] = useState<readonly ExpertSkillOption[]>();
  const [skillsError, setSkillsError] = useState('');
  const [detail, setDetail] = useState<ExpertDetail>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setBusy(true); setError('');
    try { setDetail(await management.get(expertId)); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }, [expertId, management]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!detail) return;
    const controller = new AbortController(); setSkills(undefined); setSkillsError('');
    void management.listSkills(expertId, 'equipped', controller.signal).then(value => { if (!controller.signal.aborted) setSkills(value); }).catch(cause => { if (!controller.signal.aborted) setSkillsError(messageOf(cause)); });
    return () => controller.abort();
  }, [detail, expertId, management]);
  useEffect(() => {
    if (!menuOpen) return;
    const outside = (event: PointerEvent) => { if (!(event.target instanceof Element) || !menu.current?.contains(event.target)) setMenuOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [menuOpen]);

  if (busy) return <div className="dialog-scroll"><p className="muted">正在读取专家详情…</p></div>;
  if (error || !detail) return <div className="dialog-scroll">
    <p className="error-text" role="alert">{error || '无法读取专家详情。'}</p>
    <div className="detail-head-actions" style={{ marginTop: 16 }}><button onClick={() => void load()}>重试</button><button onClick={onClose}>关闭</button></div>
  </div>;

  const { expert, revision } = detail;
  const definition: ExpertDefinition = revision?.definition ?? detail.draft.definition;
  const isDraft = expert.publishedRevisionRef === undefined;
  const hasUnpublishedChanges = detail.canEdit && revision !== undefined && JSON.stringify(detail.draft.definition) !== JSON.stringify(revision.definition);
  const readiness = READINESS[detail.readiness] ?? READINESS.unknown;
  const revisionId = expert.publishedRevisionRef?.revisionId;
  const canSummon = detail.canUse && !isDraft && expert.availability === 'enabled' && detail.readiness === 'ready';
  const versionLabel = revision ? `版本 ${revision.revisionId.slice(0, 10)}` : '草稿';

  return <div className="dialog-scroll">
    <header className="detail-header">
      <span className="detail-avatar" aria-hidden>{definition.name.trim().charAt(0) || '专'}</span>
      <div className="detail-title">
        <h1>{definition.name || '（未命名专家）'}</h1>
        <p className="detail-subtitle">{ORIGIN_LABEL[expert.origin] ?? expert.origin} · {versionLabel} · {isDraft ? '草稿' : AVAILABILITY_LABEL[expert.availability]}</p>
      <div className="detail-head-actions">
        {!isDraft && <button className="summon" disabled={!canSummon || acting} title={canSummon ? '召唤专家' : readiness.hint}
          onClick={() => { setMenuOpen(false); onSummon(expertId, revisionId, undefined); }}>召唤专家</button>}
        {isDraft && detail.canEdit && <button className="summon" onClick={() => { onClose(); onEditDraft(expertId); }}>继续编辑</button>}
        {(detail.canManage || detail.canEdit) && <div ref={menu} style={{ position: 'relative' }}>
          <button aria-label="管理专家" aria-haspopup="menu" aria-expanded={menuOpen} disabled={acting}
            onClick={() => setMenuOpen(open => !open)}>•••</button>
          {menuOpen && <div className="card-menu" role="menu" style={{ right: 0, left: 'auto' }}>
            {detail.canEdit && <button role="menuitem" onClick={() => { setMenuOpen(false); onClose(); onEditDraft(expertId); }}>编辑草稿</button>}
            <button role="menuitem" disabled={acting} onClick={() => { setMenuOpen(false); void onCopy(expertId, revisionId); }}>复制到我的专家</button>
            <button role="menuitem" disabled={acting} onClick={() => { setMenuOpen(false); void onExport(expertId); }}>导出</button>
            {detail.canManage && !isDraft && expert.availability === 'enabled' && <button role="menuitem" disabled={acting} onClick={() => { setMenuOpen(false); void onAvailability(expertId, 'disabled'); }}>停用</button>}
            {detail.canManage && expert.availability === 'disabled' && <button role="menuitem" disabled={acting} onClick={() => { setMenuOpen(false); void onAvailability(expertId, 'enabled'); }}>启用</button>}
            {detail.canManage && expert.availability !== 'archived' && <button className="danger" role="menuitem" disabled={acting} onClick={() => { setMenuOpen(false); void onAvailability(expertId, 'archived'); }}>归档</button>}
          </div>}
        </div>}
      </div>
      </div>
    </header>

    {hasUnpublishedChanges && <div className="notice" role="status">
      <div className="notice-body"><strong>草稿有修改，尚未发布</strong><span>当前详情与召唤使用已发布版本。已发布配备 {definition.skillRequirements.length} 个技能，草稿配备 {detail.draft.definition.skillRequirements.length} 个；保存草稿不会更新已发布版本。</span></div>
      <button disabled={acting} onClick={() => { onClose(); onEditDraft(expertId); }}>查看编辑草稿</button>
    </div>}

    {definition.description && <p className="detail-desc" style={{ marginTop: 20 }}>{definition.description}</p>}
    <ExpertWorkSummary definition={definition} />
    {definition.tags.length > 0 && <h2 className="detail-section-title">擅长领域</h2>}
    {definition.tags.length > 0 && <div className="tag-row">{definition.tags.map(tag => <span className="tag" key={tag}>{tag}</span>)}</div>}

    {!isDraft && <div className={`notice ${readiness.cls === 'bad' ? 'error' : readiness.cls === 'warn' ? 'warn' : 'info'}`} role="status" style={{ marginTop: 20 }}>
      <div className="notice-body"><strong>{readiness.label}</strong><span>{readiness.hint}</span></div>
    </div>}

    {definition.examples.length > 0 && <>
      <h2 className="detail-section-title">试试这样问我</h2>
      <div className="example-list">
        {definition.examples.map(example => <button className="example" key={example.id} disabled={!canSummon || acting}
          title={canSummon ? '用此示例召唤专家（仅填入草稿，不会自动发送）' : readiness.hint}
          onClick={() => { setMenuOpen(false); onSummon(expertId, revisionId, example.prompt); }}>
          <span className="example-text"><strong>{example.title || '示例任务'}</strong><span>{example.prompt}</span></span>
          <span aria-hidden>→</span>
        </button>)}
      </div>
    </>}

    <h2 className="detail-section-title">配备技能 · {definition.skillRequirements.length}</h2>
    <p className="detail-subtitle">{isDraft ? '以下为已保存草稿配备的技能；发布时会固定技能版本。' : '以下为已发布版本配备的技能；简介和状态来自当前已安装目录，召唤时使用发布时固定的技能版本。'}</p>
    {skillsError && <p role="alert">{skillsError} <button onClick={() => void load()}>重试</button></p>}
    {!skills && !skillsError && <p role="status">正在读取配备技能…</p>}
    <div className="cap-list">
      {skills?.map(skill => <div className={`cap-row ${skill.selectable ? 'ok' : 'missing'}`} key={skill.skillId}>
        <span className="skill-copy"><strong>{skill.name}</strong><small>{skill.description}</small></span>
        <span className="cap-state">{skillStateLabel(skill)}</span>
      </div>)}
      {skills?.length === 0 && <div className="cap-row"><span className="muted">未显式配备技能，仍受原生任务能力与权限限制。</span></div>}

    </div>

    {definition.futureRequirements.length > 0 && <section aria-label="扩展能力">
      <h2 className="detail-section-title">扩展能力</h2>
      <p className="detail-subtitle">这些是专家声明的额外能力，不属于已配备技能。当前尚不支持接入与可用性校验；必需项会阻止召唤，可选项不阻止召唤。</p>
      <div className="cap-list">{definition.futureRequirements.map(req => <div className={`cap-row ${req.required ? 'missing' : ''}`} key={`${req.kind}:${req.key}`}>
        <span>{req.kind === 'connector' ? '连接器' : req.kind} · {req.key}</span>
        <span className="cap-state">{req.required ? '必需 · 暂不支持接入' : '可选 · 暂不支持接入'}</span>
      </div>)}</div>
    </section>}

    <details className="expert-settings"><summary>专家设定</summary>
    <Prose title="专业角色" body={definition.role} />
    </details>

    <div className="detail-head-actions" style={{ marginTop: 28, justifyContent: 'flex-end' }}>
      <button onClick={onClose}>关闭</button>
      <button onClick={() => { void load(); onChanged(); }} disabled={busy}>刷新</button>
    </div>
  </div>;
}

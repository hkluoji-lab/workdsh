import * as React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from 'workdsh-ui';
import { EXPERT_LIMITS, type DomainIssue, type ExpertDefinition, type ExpertValidation, type SkillRevisionRef } from '../shared.js';
import type { ExpertManagementClient } from './management.js';
import { SkillPicker } from './SkillPicker.js';
import { PublishConfirmDialog } from './PublishConfirmDialog.js';

export type ExpertDraftEditorProps = {
  readonly expertId: string;
  readonly management: ExpertManagementClient;
  readonly onClose: () => void;
  readonly onSaved: () => void;
  readonly onPublished: () => void;
  readonly onSummon: (expertId: string, revisionId: string | undefined, draftText: string | undefined) => void;
};

type ExampleRow = { id: string; title: string; prompt: string };
type FormState = {
  name: string; description: string; role: string; methodology: string;
  boundaries: string; deliverables: string; tags: string[];
  examples: ExampleRow[]; skillRequirements: { name: string; skillId?: string }[];
};

function messageOf(cause: unknown): string { return cause instanceof Error ? cause.message : '专家操作失败，请重试。'; }
function codeOf(cause: unknown): string { const code = (cause as unknown as { code?: unknown })?.code; return typeof code === 'string' ? code : ''; }

function fromDefinition(definition: ExpertDefinition): FormState {
  return {
    name: definition.name, description: definition.description, role: definition.role,
    methodology: definition.methodology, boundaries: definition.boundaries, deliverables: definition.deliverables,
    tags: [...definition.tags],
    examples: definition.examples.map(example => ({ id: example.id, title: example.title ?? '', prompt: example.prompt })),
    skillRequirements: definition.skillRequirements.map(req => ({ ...req })),
  };
}

function buildPatch(form: FormState): Partial<ExpertDefinition> {
  let exampleSeq = 0;
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    role: form.role, methodology: form.methodology, boundaries: form.boundaries, deliverables: form.deliverables,
    tags: form.tags.map(tag => tag.trim()).filter(Boolean).slice(0, EXPERT_LIMITS.tagsMax),
    examples: form.examples
      .filter(example => example.prompt.trim())
      .slice(0, EXPERT_LIMITS.examplesMax)
      .map(example => ({ id: example.id || `ex-${Date.now().toString(36)}-${exampleSeq++}`, prompt: example.prompt.trim(), ...(example.title.trim() ? { title: example.title.trim() } : {}) })),
    skillRequirements: form.skillRequirements.map(req => ({ ...req, name: req.name.trim() })).filter(req => req.name),
  };
}

function Counter({ value, max }: { value: number; max: number }) {
  return <span className={`counter ${value > max ? 'field-error' : ''}`}>{value}/{max}</span>;
}

export function ExpertDraftEditor({ expertId, management, onClose, onSaved, onPublished, onSummon }: ExpertDraftEditorProps) {
  const [form, setForm] = useState<FormState>();
  const [baseline, setBaseline] = useState('');
  const [publishedBaseline, setPublishedBaseline] = useState<string>();
  const [expertRevision, setExpertRevision] = useState('');
  const [draftRevision, setDraftRevision] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<Date>();
  const [issues, setIssues] = useState<readonly DomainIssue[]>([]);
  const [conflict, setConflict] = useState<{ latest: FormState; latestExpertRevision: string; latestDraftRevision: string }>();
  const [publish, setPublish] = useState<{ draftRevision: string; definition: ExpertDefinition; definitionDigest: string; dependencyLockDigest: string; dependencyLock: readonly SkillRevisionRef[] }>();

  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const detail = await management.get(expertId);
      const initial = fromDefinition(detail.draft.definition);
      setForm(initial);
      setBaseline(JSON.stringify(initial));
      setPublishedBaseline(detail.revision ? JSON.stringify(fromDefinition(detail.revision.definition)) : undefined);
      setExpertRevision(detail.expert.revision);
      setDraftRevision(detail.draft.revision);
      setIssues(detail.draft.validationIssues);
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }, [expertId, management]);

  useEffect(() => { void load(); }, [load]);

  const dirty = useMemo(() => (form ? JSON.stringify(form) !== baseline : false), [form, baseline]);

  const save = useCallback(async (current: FormState, casRevision: string): Promise<string | undefined> => {
    setSaving(true); setError('');
    try {
      const saved = await management.updateDraft(expertId, buildPatch(current), management.newOperationId('update-draft'), casRevision);
      const fresh = await management.get(expertId);
      setExpertRevision(fresh.expert.revision);
      setDraftRevision(fresh.draft.revision);
      setBaseline(JSON.stringify(current));
      setIssues(fresh.draft.validationIssues);
      setConflict(undefined);
      setSavedAt(new Date());
      onSaved();
      return saved.revision;
    } catch (cause) {
      if (codeOf(cause) === 'experts/conflict') {
        try {
          const fresh = await management.get(expertId);
          setConflict({ latest: fromDefinition(fresh.draft.definition), latestExpertRevision: fresh.expert.revision, latestDraftRevision: fresh.draft.revision });
          setError('草稿已在别处更新，请选择保留你的修改或加载最新版本。');
        } catch { setError(messageOf(cause)); }
      } else setError(messageOf(cause));
      return undefined;
    } finally { setSaving(false); }
  }, [expertId, management, onSaved]);

  const onSave = useCallback(() => { if (form) void save(form, expertRevision); }, [form, save, expertRevision]);

  const onPublish = useCallback(async () => {
    if (!form) return;
    setSaving(true); setError('');
    let revision = draftRevision;
    if (dirty) {
      const saved = await save(form, expertRevision);
      if (!saved) { setSaving(false); return; }
      revision = saved;
    }
    try {
      const validation: ExpertValidation = await management.validate(expertId, revision);
      setIssues(validation.issues);
      if (!validation.publishable) { setError('定义尚未通过校验，请先修复下列问题再发布。'); return; }
      const reviewed = await management.get(expertId);
      if (reviewed.draft.revision !== revision) throw new Error('草稿已被更新，请重新加载并审阅最新内容。');
      setPublish({ draftRevision: revision, definition: reviewed.draft.definition, definitionDigest: validation.definitionDigest, dependencyLockDigest: validation.dependencyLockDigest, dependencyLock: validation.dependencyLock });
    } catch (cause) { setError(messageOf(cause)); }
    finally { setSaving(false); }
  }, [form, dirty, draftRevision, expertRevision, save, management, expertId]);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => setForm(prev => (prev ? { ...prev, [key]: value } : prev)), []);

  if (publish && form) {
    return <PublishConfirmDialog expertId={expertId} draftRevision={publish.draftRevision}
      definition={publish.definition}
      definitionDigest={publish.definitionDigest} dependencyLockDigest={publish.dependencyLockDigest} dependencyLock={publish.dependencyLock}
      management={management}
      onClose={() => setPublish(undefined)}
      onPublished={() => { setPublish(undefined); onPublished(); }}
      onSummon={(id, revisionId, text) => { setPublish(undefined); onSummon(id, revisionId, text); }} />;
  }

  if (busy || !form) {
    return <Modal open label="编辑专家草稿" className="editor-dialog" onClose={onClose}>
      <div className="editor-head"><h2>编辑专家草稿</h2></div>
      <div className="editor-scroll">
<p className="muted">{error || '正在加载草稿…'}</p></div>
    </Modal>;
  }

  const nameInvalid = form.name.trim().length === 0 || form.name.length > EXPERT_LIMITS.nameMax;
  const descInvalid = form.description.length > EXPERT_LIMITS.descriptionMax;

  return <Modal open label="编辑专家草稿" className="editor-dialog" onClose={onClose}>
    <div className="editor-head">
      <h2>{form.name.trim() || '编辑专家草稿'}</h2>
      {savedAt && <span className="saved-at">已保存 {savedAt.toLocaleTimeString()}</span>}
    </div>

    <div className="editor-scroll">
      <div className="notice" role="status"><div className="notice-body">
        <strong>{publishedBaseline === undefined ? '正在编辑未发布草稿' : JSON.stringify(form) !== publishedBaseline ? '草稿有修改，尚未发布' : '正在编辑草稿'}</strong>
        <span>保存草稿仅保存编辑内容；明确确认发布后，专家详情与之后召唤的新任务才会使用此版本。已有任务保持原版本。</span>
      </div></div>
      {conflict && <div className="conflict">
        <h4>草稿冲突</h4>
        <p className="muted">服务端已有更新的草稿。你可以保留当前修改并覆盖，或加载最新版本（将丢弃未保存的本地修改）。</p>
        <div className="conflict-actions">
          <button onClick={() => { setExpertRevision(conflict.latestExpertRevision); setConflict(undefined); void save(form, conflict.latestExpertRevision); }}>保留我的并覆盖</button>
          <button onClick={() => { setForm(conflict.latest); setBaseline(JSON.stringify(conflict.latest)); setExpertRevision(conflict.latestExpertRevision); setDraftRevision(conflict.latestDraftRevision); setConflict(undefined); setError(''); }}>加载最新版本</button>
        </div>
      </div>}

      {issues.length > 0 && <div className="issues">
        <h4>校验问题（{issues.length}）</h4>
        <ul>{issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}{issue.path ? `（${issue.path}）` : ''}</li>)}</ul>
      </div>}

      {error && !conflict && <div className="issues"><h4>无法完成操作</h4><ul><li>{error}</li></ul></div>}

      <section className="group">
        <h3>基本信息</h3>
        <div className={`field ${nameInvalid ? 'invalid' : ''}`}>
          <label htmlFor="ex-name">名称 <Counter value={form.name.length} max={EXPERT_LIMITS.nameMax} /></label>
          <input id="ex-name" value={form.name} maxLength={EXPERT_LIMITS.nameMax + 20} onChange={event => set('name', event.currentTarget.value)} placeholder="例如：合同审查专家" />
          {nameInvalid && <p className="field-error">名称为必填，且不超过 {EXPERT_LIMITS.nameMax} 个字符。</p>}
        </div>
        <div className={`field ${descInvalid ? 'invalid' : ''}`}>
          <label htmlFor="ex-desc">简介 <Counter value={form.description.length} max={EXPERT_LIMITS.descriptionMax} /></label>
          <textarea id="ex-desc" value={form.description} onChange={event => set('description', event.currentTarget.value)} placeholder="一句话说明这个专家能帮你做什么" />
          {descInvalid && <p className="field-error">简介不超过 {EXPERT_LIMITS.descriptionMax} 个字符。</p>}
        </div>
        <div className="field">
          <label>标签（最多 {EXPERT_LIMITS.tagsMax} 个，每个 ≤20 字）</label>
          <div className="list-editor tag-editor">
            {form.tags.map((tag, index) => <div className="list-row" key={index}>
              <input value={tag} maxLength={20} aria-label={`标签 ${index + 1}`} onChange={event => set('tags', form.tags.map((t, i) => (i === index ? event.currentTarget.value : t)))} />
              <button className="remove" aria-label={`删除标签 ${index + 1}`} onClick={() => set('tags', form.tags.filter((_, i) => i !== index))}>删除</button>
            </div>)}
            {form.tags.length < EXPERT_LIMITS.tagsMax && <button className="add-row" onClick={() => set('tags', [...form.tags, ''])}>+ 添加标签</button>}
          </div>
        </div>
      </section>

      <section className="group">
        <h3>专业角色与方法</h3>
        <div className="field">
          <label htmlFor="ex-role">专业角色 <Counter value={form.role.length} max={EXPERT_LIMITS.proseMax} /></label>
          <textarea id="ex-role" className="prose" value={form.role} onChange={event => set('role', event.currentTarget.value)} placeholder="这个专家是谁、具备哪些专业背景与判断标准" />
        </div>
        <div className="field">
          <label htmlFor="ex-method">工作方法 <Counter value={form.methodology.length} max={EXPERT_LIMITS.proseMax} /></label>
          <textarea id="ex-method" className="prose" value={form.methodology} onChange={event => set('methodology', event.currentTarget.value)} placeholder="完成任务时遵循的步骤、方法与产出结构" />
        </div>
      </section>

      <section className="group">
        <h3>交付要求</h3>
        <div className="field">
          <label htmlFor="ex-bound">边界与约束 <Counter value={form.boundaries.length} max={EXPERT_LIMITS.proseMax} /></label>
          <textarea id="ex-bound" className="prose" value={form.boundaries} onChange={event => set('boundaries', event.currentTarget.value)} placeholder="不做什么、何时交回用户、需要遵守的约束" />
        </div>
        <div className="field">
          <label htmlFor="ex-deliver">交付物 <Counter value={form.deliverables.length} max={EXPERT_LIMITS.proseMax} /></label>
          <textarea id="ex-deliver" className="prose" value={form.deliverables} onChange={event => set('deliverables', event.currentTarget.value)} placeholder="最终交付的格式、内容与质量标准" />
        </div>
      </section>

      <section className="group">
        <h3>配备技能 · {form.skillRequirements.length}</h3>
        <p className="hint">选择真实已安装技能，发布时固定版本。移除配备项不会卸载共享技能。</p>
        <div className="list-editor">
          {form.skillRequirements.map((req, index) => <div className="equipped-row" key={req.skillId ?? req.name}>
            <strong>{req.name}</strong>
            <button className="remove" aria-label={`删除依赖 ${index + 1}`} onClick={() => set('skillRequirements', form.skillRequirements.filter((_, i) => i !== index))}>移除</button>
          </div>)}
          {!form.skillRequirements.length && <p className="hint">尚未配备技能。</p>}
          {!pickerOpen && <button className="add-row" onClick={() => setPickerOpen(true)}>+ 添加技能</button>}
        </div>
        {pickerOpen && <SkillPicker expertId={expertId} management={management} selected={form.skillRequirements} onCancel={() => setPickerOpen(false)} onConfirm={value => { set('skillRequirements', value); setPickerOpen(false); }} />}
      </section>

      <section className="group">
        <h3>示例任务（最多 {EXPERT_LIMITS.examplesMax} 条）</h3>
        <div className="list-editor">
          {form.examples.map((example, index) => <div className="example-editor-row" key={example.id || index}>
            <input value={example.title} aria-label={`示例 ${index + 1} 标题`} placeholder="示例标题（可选）" onChange={event => set('examples', form.examples.map((e, i) => (i === index ? { ...e, title: event.currentTarget.value } : e)))} />
            <textarea value={example.prompt} aria-label={`示例 ${index + 1} 内容`} placeholder="点击示例即可用它召唤专家（仅填入草稿）" maxLength={2000} onChange={event => set('examples', form.examples.map((e, i) => (i === index ? { ...e, prompt: event.currentTarget.value } : e)))} />
            <button className="remove" aria-label={`删除示例 ${index + 1}`} onClick={() => set('examples', form.examples.filter((_, i) => i !== index))}>删除示例</button>
          </div>)}
          {form.examples.length < EXPERT_LIMITS.examplesMax && <button className="add-row" onClick={() => set('examples', [...form.examples, { id: '', title: '', prompt: '' }])}>+ 添加示例任务</button>}
        </div>
      </section>
    </div>

    <div className="editor-foot">
      {dirty ? <span className="saved-at">有未保存的修改</span> : <span className="saved-at">{savedAt ? '全部已保存' : '尚未修改'}</span>}
      <button onClick={onClose}>取消</button>
      <button onClick={onSave} disabled={saving || !dirty}>{saving ? '正在保存…' : '保存草稿'}</button>
      <button className="primary" onClick={() => void onPublish()} disabled={saving || nameInvalid}>{saving ? '正在处理…' : '发布'}</button>
    </div>
  </Modal>;
}

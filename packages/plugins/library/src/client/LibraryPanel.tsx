import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { LibraryAssetKind, LibraryDraft, LibrarySearchHit, LibraryTreeEntry } from 'workdsh-contracts/library';
import type { LibraryClient } from './management.js';
import { libraryCss } from './styles.js';

type Props = PropsRuntime<'main'> & InjectFace<{ management: LibraryClient; toggleNavigation: () => void; currentSessionId: () => string | undefined }>;
type FolderTarget = { id?: string; label: string };
const kindLabel = (entry: LibraryTreeEntry): string => entry.kind === 'folder' ? '文件夹' : ({ markdown: 'Markdown', text: 'TXT', pdf: 'PDF', docx: 'Word', pptx: 'PowerPoint' } as const)[entry.asset!.kind];

export function LibraryPanel({ management, toggleNavigation, currentSessionId }: Props) {
  const [items, setItems] = useState<readonly LibraryTreeEntry[]>([]);
  const [parent, setParent] = useState<LibraryTreeEntry>();
  const [stack, setStack] = useState<readonly LibraryTreeEntry[]>([]);
  const [selected, setSelected] = useState<LibraryTreeEntry>();
  const [content, setContent] = useState('');
  const [originalUrl, setOriginalUrl] = useState('');
  const [draft, setDraft] = useState<LibraryDraft>();
  const [draftContent, setDraftContent] = useState('');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<LibraryAssetKind | ''>('');
  const [source, setSource] = useState<'upload' | 'task' | 'created' | ''>('');
  const [updatedAfter, setUpdatedAfter] = useState('');
  const [hits, setHits] = useState<readonly LibrarySearchHit[]>();
  const [folderTargets, setFolderTargets] = useState<readonly FolderTarget[]>();
  const [moving, setMoving] = useState<LibraryTreeEntry>();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const upload = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (originalUrl) URL.revokeObjectURL(originalUrl); }, [originalUrl]);
  const clearOriginal = () => { setOriginalUrl(old => { if (old) URL.revokeObjectURL(old); return ''; }); };
  const refresh = useCallback(async () => {
    setBusy(true); setError('');
    try { setItems(await management.list(parent?.id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '读取资料失败。'); }
    finally { setBusy(false); }
  }, [management, parent]);
  useEffect(() => { void refresh(); }, [refresh]);

  const open = async (entry: LibraryTreeEntry) => {
    setError(''); setNotice(''); setDraft(undefined); clearOriginal();
    if (entry.kind === 'folder') { setStack([...stack, entry]); setParent(entry); setSelected(undefined); return; }
    setSelected(entry); setContent('');
    if (entry.asset?.status === 'disabled') return;
    try {
      const revisionId = entry.revision?.id ?? hits?.find(hit => hit.nodeId === entry.id)?.revisionId;
      setContent(await management.readText(entry.asset!.id, revisionId));
      if (entry.asset?.kind === 'pdf') {
        const bytes = await management.readOriginal(entry.asset.id, revisionId);
        setOriginalUrl(URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })));
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : '读取资料失败。'); }
  };
  const back = () => { const next = stack.slice(0, -1); setStack(next); setParent(next.at(-1)); setSelected(undefined); setContent(''); clearOriginal(); };
  const createFolder = async () => { const name = window.prompt('文件夹名称'); if (!name) return; try { await management.createFolder(name, parent?.id); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : '新建文件夹失败。'); } };
  const files = async (list: FileList | null) => { if (!list?.length) return; setBusy(true); setError(''); try { for (const file of list) await management.importFile(file, parent?.id); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : '导入文件失败。'); } finally { setBusy(false); if (upload.current) upload.current.value = ''; } };
  const search = async (overrideQuery?: string, overrideSource?: 'task') => {
    const value = overrideQuery ?? query;
    if (overrideQuery === undefined && !value.trim() && !overrideSource && !kind && !source && !updatedAfter) { setHits(undefined); return; }
    setBusy(true); setError(''); setSelected(undefined); clearOriginal();
    try { setHits(await management.search(value, { ...(kind ? { kinds: [kind] } : {}), ...((overrideSource ?? source) ? { sources: [overrideSource ?? source as 'upload' | 'task' | 'created'] } : {}), ...(updatedAfter ? { updatedAfter: new Date(updatedAfter).toISOString() } : {}) })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '搜索失败。'); }
    finally { setBusy(false); }
  };
  const remove = async (entry: LibraryTreeEntry) => { if (!window.confirm(`删除“${entry.name}”？${entry.kind === 'folder' ? '文件夹内资料也会删除。' : ''}`)) return; try { await management.remove(entry.id); if (selected?.id === entry.id) setSelected(undefined); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : '删除失败。'); } };
  const beginEdit = async () => { if (!selected?.asset) return; try { const next = await management.createDraft(selected.asset.id, selected.revision?.id); setDraft(next); setDraftContent(next.content); } catch (cause) { setError(cause instanceof Error ? cause.message : '创建草稿失败。'); } };
  const saveDraft = async () => { if (!draft) return; try { const next = await management.updateDraft(draft.id, draftContent, draft.revision); setDraft(next); setDraftContent(next.content); } catch (cause) { setError(cause instanceof Error ? cause.message : '保存草稿失败。'); } };
  const publishDraft = async () => { if (!draft || !window.confirm('发布后会生成一个新的只读修订版本。继续吗？')) return; try { const saved = draftContent === draft.content ? draft : await management.updateDraft(draft.id, draftContent, draft.revision); const entry = await management.publishDraft(saved.id, saved.revision); setSelected(entry); setContent(draftContent); setDraft(undefined); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : '发布失败。'); } };
  const downloadOriginal = async () => { if (!selected?.asset) return; try { const bytes = await management.readOriginal(selected.asset.id, selected.revision?.id); const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: selected.asset.mediaType })); const link = document.createElement('a'); link.href = url; link.download = selected.name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1_000); } catch (cause) { setError(cause instanceof Error ? cause.message : '读取原件失败。'); } };
  const createText = async (documentKind: 'markdown' | 'text') => { const fallback = documentKind === 'markdown' ? '未命名文档.md' : '未命名文本.txt'; const name = window.prompt('文件名称', fallback); if (!name) return; const extension = documentKind === 'markdown' ? '.md' : '.txt'; const finalName = name.toLocaleLowerCase().endsWith(extension) ? name : `${name}${extension}`; const initial = documentKind === 'markdown' ? `# ${finalName.slice(0, -extension.length)}\n` : '\n'; try { await management.importFile(new File([initial], finalName, { type: documentKind === 'markdown' ? 'text/markdown' : 'text/plain' }), parent?.id); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : '新建资料失败。'); } };
  const setStatus = async () => { if (!selected?.asset) return; const status = selected.asset.status === 'disabled' ? 'active' : 'disabled'; if (status === 'disabled' && !window.confirm('停用后，已有任务引用会立即无法读取这份资料。继续吗？')) return; try { const entry = await management.setAssetStatus(selected.asset.id, status); setSelected(entry); if (status === 'disabled') { setContent(''); clearOriginal(); } setNotice(status === 'active' ? '资料已重新启用。' : '资料已停用，任务引用已立即失效。'); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : '更新状态失败。'); } };
  const addToCurrentTask = async () => { if (!selected) return; const sessionId = currentSessionId(); if (!sessionId) { setError('请先打开一个对话，再添加资料。'); return; } try { const current = await management.taskSelection(sessionId); const nodeIds = [...new Set([...current.map(row => row.nodeId), selected.id])]; await management.setTaskSelection(sessionId, nodeIds); setNotice(`已将“${selected.name}”用于当前对话。`); } catch (cause) { setError(cause instanceof Error ? cause.message : '添加到任务失败。'); } };
  const collectFolders = async (): Promise<FolderTarget[]> => { const result: FolderTarget[] = [{ label: '我的资料（根目录）' }]; const walk = async (parentId: string | undefined, prefix: string) => { for (const row of await management.list(parentId)) if (row.kind === 'folder') { result.push({ id: row.id, label: `${prefix}${row.name}` }); await walk(row.id, `${prefix}${row.name} / `); } }; await walk(undefined, ''); return result; };
  const beginMove = async (entry: LibraryTreeEntry) => { try { setMoving(entry); setFolderTargets(await collectFolders()); } catch (cause) { setMoving(undefined); setError(cause instanceof Error ? cause.message : '读取目录失败。'); } };
  const move = async (parentId: string | undefined) => { if (!moving) return; try { await management.move(moving.id, parentId); setMoving(undefined); setFolderTargets(undefined); if (selected?.id === moving.id) setSelected(undefined); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : '移动失败。'); } };
  const rename = async () => { if (!selected) return; const name = window.prompt('新名称', selected.name); if (!name) return; try { await management.rename(selected.id, name); setSelected({ ...selected, name }); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : '重命名失败。'); } };

  const changedLines = draft ? (() => { const before = content.split('\n'); const after = draftContent.split('\n'); return Array.from({ length: Math.max(before.length, after.length) }, (_, index) => ({ line: index + 1, before: before[index] ?? '', after: after[index] ?? '' })).filter(row => row.before !== row.after); })() : [];
  const shown = hits ? hits.map(hit => items.find(item => item.id === hit.nodeId) ?? ({ id: hit.nodeId, spaceId: '', kind: 'asset', name: hit.name, assetId: hit.assetId, asset: { id: hit.assetId, spaceId: '', nodeId: hit.nodeId, kind: hit.kind, mediaType: '', byteLength: 0, owner: { organizationId: '', ownerPrincipalId: '', scope: 'personal' }, status: 'active', currentRevisionId: hit.revisionId, source: hit.source, createdAt: hit.updatedAt, updatedAt: hit.updatedAt }, revision: undefined, createdAt: hit.updatedAt, updatedAt: hit.updatedAt } as LibraryTreeEntry)) : items;

  return <section className="wd-library"><style>{libraryCss}</style>
    <aside className="wd-library-nav"><h1>资料库</h1><div className="wd-library-primary"><button onClick={() => { setHits(undefined); setSelected(undefined); }}>⌕ 搜索</button><button onClick={() => void search('')}>◷ 最近</button><button onClick={() => void search('', 'task')}>▱ 本地产物</button></div><div className="wd-library-section-title"><span>我的资料</span><button onClick={() => void createFolder()}>＋</button></div><div className="wd-library-tree">{stack.map((entry, index) => <button key={entry.id} className="wd-library-row" onClick={() => { const next = stack.slice(0, index + 1); setStack(next); setParent(entry); }}><span>▾ {entry.name}</span></button>)}</div></aside>
    <main className="wd-library-work"><div className="wd-library-toolbar"><button className="wd-library-action" onClick={toggleNavigation}>导航</button>{parent || selected ? <button className="wd-library-back" onClick={back}>← 返回</button> : null}<h2>{selected?.name ?? parent?.name ?? '我的资料'}</h2><input type="search" placeholder="搜索资料" value={query} onChange={event => setQuery(event.currentTarget.value)} onKeyDown={event => { if (event.key === 'Enter') void search(); }} /><button className="wd-library-action" onClick={() => void search()}>搜索</button><button className="wd-library-action" onClick={() => void createText('markdown')}>新建 Markdown</button><button className="wd-library-action" onClick={() => void createText('text')}>新建 TXT</button><button className="wd-library-action" onClick={() => void createFolder()}>新建文件夹</button><button className="wd-library-action primary" onClick={() => upload.current?.click()}>上传导入</button><input ref={upload} className="wd-library-upload" type="file" multiple accept=".md,.markdown,.txt,.pdf,.docx,.pptx" onChange={event => void files(event.currentTarget.files)} /></div>
      <div className="wd-library-filters"><select aria-label="文件类型" value={kind} onChange={event => setKind(event.currentTarget.value as LibraryAssetKind | '')}><option value="">全部类型</option><option value="markdown">Markdown</option><option value="text">TXT</option><option value="pdf">PDF</option><option value="docx">Word</option><option value="pptx">PowerPoint</option></select><select aria-label="资料来源" value={source} onChange={event => setSource(event.currentTarget.value as typeof source)}><option value="">全部来源</option><option value="upload">上传导入</option><option value="task">任务产物</option><option value="created">新建资料</option></select><label>更新日期从 <input type="date" value={updatedAfter} onChange={event => setUpdatedAfter(event.currentTarget.value)} /></label>{hits ? <button className="wd-library-action" onClick={() => setHits(undefined)}>返回目录</button> : null}</div>
      {notice ? <div className="wd-library-notice" role="status">{notice}</div> : null}{error ? <div className="wd-library-error" role="alert">{error}</div> : null}
      {moving && folderTargets ? <div className="wd-library-move" role="dialog" aria-label="移动资料"><strong>将“{moving.name}”移动到</strong><div>{folderTargets.filter(target => target.id !== moving.id).map(target => <button key={target.id ?? 'root'} onClick={() => void move(target.id)}>📁 {target.label}</button>)}</div><button className="wd-library-action" onClick={() => { setMoving(undefined); setFolderTargets(undefined); }}>取消</button></div> : null}
      {selected ? <>{draft ? <div className="wd-library-editor"><div className="wd-library-editor-note">正在编辑草稿。保存草稿不会改变当前版本；只有“发布新版本”才会更新正文。</div>{changedLines.length ? <div className="wd-library-diff"><strong>待发布差异（{changedLines.length} 行）</strong>{changedLines.slice(0, 200).map(row => <div className="wd-library-diff-row" key={row.line}><span>{row.line}</span><del>{row.before || '∅'}</del><ins>{row.after || '∅'}</ins></div>)}</div> : <div className="wd-library-diff-empty">草稿与当前修订没有差异。</div>}<textarea value={draftContent} onChange={event => setDraftContent(event.currentTarget.value)} /><div className="wd-library-menu"><button className="wd-library-action" onClick={() => void saveDraft()}>保存草稿</button><button className="wd-library-action primary" onClick={() => void publishDraft()}>发布新版本</button><button className="wd-library-action" onClick={() => setDraft(undefined)}>取消</button></div></div> : <>{selected.asset?.status === 'disabled' ? <div className="wd-library-disabled">这份资料已停用。已有任务保留历史引用，但无法继续读取正文。</div> : originalUrl ? <iframe className="wd-library-pdf" title={selected.name} src={originalUrl} /> : <div className="wd-library-preview"><div className="wd-library-preview-label">{selected.asset?.kind === 'markdown' || selected.asset?.kind === 'text' ? '原始正文' : '可搜索文本'} · 修订 {selected.revision?.number ?? 1} · 转换状态 {selected.revision?.conversionStatus === 'ready' ? '可搜索' : selected.revision?.conversionStatus ?? '未知'}</div>{content}</div>}<div className="wd-library-menu">{selected.asset?.status !== 'disabled' && selected.asset && (selected.asset.kind === 'markdown' || selected.asset.kind === 'text') ? <button className="wd-library-action primary" onClick={() => void beginEdit()}>编辑草稿</button> : null}{selected.asset?.status !== 'disabled' ? <button className="wd-library-action" onClick={() => void addToCurrentTask()}>添加到当前任务</button> : null}<button className="wd-library-action" onClick={() => void downloadOriginal()} disabled={selected.asset?.status === 'disabled'}>下载原件</button><button className="wd-library-action" onClick={() => void beginMove(selected)}>移动到…</button><button className="wd-library-action" onClick={() => void rename()}>重命名</button><button className="wd-library-action" onClick={() => void setStatus()}>{selected.asset?.status === 'disabled' ? '重新启用' : '停用'}</button><button className="wd-library-action danger" onClick={() => void remove(selected)}>删除</button></div></>}</> : busy ? <div className="wd-library-empty">正在读取…</div> : shown.length ? <div className="wd-library-grid">{shown.map(entry => <article key={entry.id} className="wd-library-card"><button className="wd-library-card-main" onClick={() => void open(entry)}><strong>{entry.kind === 'folder' ? '📁' : '📄'} {entry.name}</strong><small>{kindLabel(entry)}{entry.revision ? ` · 修订 ${entry.revision.number}` : ''}{entry.asset?.status === 'disabled' ? ' · 已停用' : ''}{hits?.find(hit => hit.nodeId === entry.id)?.location ? ` · ${hits.find(hit => hit.nodeId === entry.id)!.location}` : ''}</small><small>{entry.asset?.source === 'task' ? '任务产物' : entry.asset?.source === 'created' ? '新建资料' : entry.asset ? '上传导入' : ''}{entry.updatedAt ? ` · ${new Date(entry.updatedAt).toLocaleString()}` : ''}</small></button><div className="wd-library-card-actions"><button onClick={() => void beginMove(entry)}>移动</button><button onClick={() => void remove(entry)}>删除</button></div></article>)}</div> : <div className="wd-library-empty">{hits ? '没有找到匹配资料。' : '这里还没有资料。上传文件或新建文件夹开始整理。'}</div>}
    </main>
  </section>;
}

import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { LibraryDraft, LibrarySearchHit, LibraryTreeEntry } from 'workdsh-contracts/library';
import type { LibraryClient } from './management.js';
import { libraryCss } from './styles.js';

type Props = PropsRuntime<'main'> & InjectFace<{ management: LibraryClient; toggleNavigation: () => void; currentSessionId: () => string | undefined }>;
type TreeRow = LibraryTreeEntry & { children?: TreeRow[] };
type MenuState = { entry?: LibraryTreeEntry; x: number; y: number; create?: boolean };
type View = 'library' | 'search' | 'recent' | 'outputs';
type FolderTarget = { id?: string; label: string };

const icon = (entry: LibraryTreeEntry) => entry.kind === 'folder' ? '📁' : entry.asset?.kind === 'pdf' ? 'PDF' : entry.asset?.kind === 'docx' ? 'W' : entry.asset?.kind === 'pptx' ? 'P' : entry.asset?.kind === 'text' ? 'T' : 'M';

export function LibraryPanel({ management, toggleNavigation, currentSessionId }: Props) {
  const [tree, setTree] = useState<readonly TreeRow[]>([]);
  const [selected, setSelected] = useState<LibraryTreeEntry>();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [view, setView] = useState<View>('library');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<readonly LibrarySearchHit[]>([]);
  const [content, setContent] = useState('');
  const [originalUrl, setOriginalUrl] = useState('');
  const [draft, setDraft] = useState<LibraryDraft>();
  const [draftContent, setDraftContent] = useState('');
  const [menu, setMenu] = useState<MenuState>();
  const [moving, setMoving] = useState<LibraryTreeEntry>();
  const [folderTargets, setFolderTargets] = useState<readonly FolderTarget[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const upload = useRef<HTMLInputElement>(null);

  const clearOriginal = useCallback(() => setOriginalUrl(old => { if (old) URL.revokeObjectURL(old); return ''; }), []);
  useEffect(() => () => { if (originalUrl) URL.revokeObjectURL(originalUrl); }, [originalUrl]);
  useEffect(() => { const close = () => setMenu(undefined); window.addEventListener('click', close); return () => window.removeEventListener('click', close); }, []);

  const loadTree = useCallback(async () => {
    const walk = async (parentId?: string): Promise<TreeRow[]> => Promise.all((await management.list(parentId)).map(async row => row.kind === 'folder' ? { ...row, children: await walk(row.id) } : row));
    setBusy(true); setError('');
    try { setTree(await walk()); } catch (cause) { setError(cause instanceof Error ? cause.message : '读取资料失败。'); } finally { setBusy(false); }
  }, [management]);
  useEffect(() => { void loadTree(); }, [loadTree]);

  const flatten = (rows: readonly TreeRow[]): LibraryTreeEntry[] => rows.flatMap(row => [row, ...(row.children ? flatten(row.children) : [])]);
  const allEntries = flatten(tree);
  const findById = (id: string) => allEntries.find(row => row.id === id);
  const open = async (entry: LibraryTreeEntry) => {
    setMenu(undefined); setError(''); setNotice(''); setDraft(undefined); clearOriginal();
    if (entry.kind === 'folder') { setExpanded(old => { const next = new Set(old); next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id); return next; }); return; }
    setSelected(entry); setView('library'); setContent('');
    if (entry.asset?.status === 'disabled') return;
    try {
      const revisionId = entry.revision?.id ?? hits.find(hit => hit.nodeId === entry.id)?.revisionId;
      setContent(await management.readText(entry.asset!.id, revisionId));
      if (entry.asset?.kind === 'pdf') { const bytes = await management.readOriginal(entry.asset.id, revisionId); setOriginalUrl(URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : '读取资料失败。'); }
  };
  const runSearch = async (nextView: View = 'search', nextQuery = query) => {
    setView(nextView); setSelected(undefined); clearOriginal(); setBusy(true); setError('');
    try { setHits(await management.search(nextQuery, nextView === 'outputs' ? { sources: ['task'] } : {})); } catch (cause) { setError(cause instanceof Error ? cause.message : '搜索失败。'); } finally { setBusy(false); }
  };
  const createFolder = async () => { const name = window.prompt('文件夹名称'); if (!name) return; try { await management.createFolder(name); await loadTree(); } catch (cause) { setError(cause instanceof Error ? cause.message : '新建文件夹失败。'); } };
  const createText = async (kind: 'markdown' | 'text') => { const extension = kind === 'markdown' ? '.md' : '.txt'; const name = window.prompt('文件名称', kind === 'markdown' ? '未命名文档.md' : '未命名文本.txt'); if (!name) return; const finalName = name.toLowerCase().endsWith(extension) ? name : `${name}${extension}`; try { await management.importFile(new File([kind === 'markdown' ? `# ${finalName.slice(0, -extension.length)}\n` : '\n'], finalName, { type: kind === 'markdown' ? 'text/markdown' : 'text/plain' })); await loadTree(); } catch (cause) { setError(cause instanceof Error ? cause.message : '新建资料失败。'); } };
  const files = async (list: FileList | null) => { if (!list?.length) return; setBusy(true); try { for (const file of list) await management.importFile(file); await loadTree(); } catch (cause) { setError(cause instanceof Error ? cause.message : '导入文件失败。'); } finally { setBusy(false); if (upload.current) upload.current.value = ''; } };
  const remove = async (entry: LibraryTreeEntry) => { if (!window.confirm(`删除“${entry.name}”？`)) return; try { await management.remove(entry.id); if (selected?.id === entry.id) setSelected(undefined); await loadTree(); } catch (cause) { setError(cause instanceof Error ? cause.message : '删除失败。'); } };
  const rename = async (entry: LibraryTreeEntry) => { const name = window.prompt('新名称', entry.name); if (!name) return; try { await management.rename(entry.id, name); if (selected?.id === entry.id) setSelected({ ...selected, name }); await loadTree(); } catch (cause) { setError(cause instanceof Error ? cause.message : '重命名失败。'); } };
  const addToTask = async (entry: LibraryTreeEntry) => { const sessionId = currentSessionId(); if (!sessionId) { setError('请先打开一个对话，再添加资料。'); return; } try { const current = await management.taskSelection(sessionId); await management.setTaskSelection(sessionId, [...new Set([...current.map(row => row.nodeId), entry.id])]); setNotice(`已将“${entry.name}”添加到当前任务。`); } catch (cause) { setError(cause instanceof Error ? cause.message : '添加到任务失败。'); } };
  const setStatus = async (entry: LibraryTreeEntry) => { if (!entry.asset) return; const status = entry.asset.status === 'disabled' ? 'active' : 'disabled'; if (status === 'disabled' && !window.confirm('停用后，已有任务将无法继续读取这份资料。继续吗？')) return; try { const next = await management.setAssetStatus(entry.asset.id, status); if (selected?.id === entry.id) setSelected(next); await loadTree(); } catch (cause) { setError(cause instanceof Error ? cause.message : '更新状态失败。'); } };
  const beginMove = (entry: LibraryTreeEntry) => { setMoving(entry); setFolderTargets([{ label: '我的资料（根目录）' }, ...allEntries.filter(row => row.kind === 'folder').map(row => ({ id: row.id, label: row.name }))]); };
  const move = async (parentId?: string) => { if (!moving) return; try { await management.move(moving.id, parentId); setMoving(undefined); await loadTree(); } catch (cause) { setError(cause instanceof Error ? cause.message : '移动失败。'); } };
  const beginEdit = async () => { if (!selected?.asset) return; try { const next = await management.createDraft(selected.asset.id, selected.revision?.id); setDraft(next); setDraftContent(next.content); } catch (cause) { setError(cause instanceof Error ? cause.message : '创建草稿失败。'); } };
  const publishDraft = async () => { if (!draft) return; try { const saved = draftContent === draft.content ? draft : await management.updateDraft(draft.id, draftContent, draft.revision); const next = await management.publishDraft(saved.id, saved.revision); setSelected(next); setContent(draftContent); setDraft(undefined); await loadTree(); } catch (cause) { setError(cause instanceof Error ? cause.message : '发布失败。'); } };
  const downloadOriginal = async () => { if (!selected?.asset) return; try { const bytes = await management.readOriginal(selected.asset.id, selected.revision?.id); const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: selected.asset.mediaType })); const link = document.createElement('a'); link.href = url; link.download = selected.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (cause) { setError(cause instanceof Error ? cause.message : '读取原件失败。'); } };
  const showMenu = (event: React.MouseEvent, state: Omit<MenuState, 'x' | 'y'>) => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); setMenu({ ...state, x: Math.min(rect.left, window.innerWidth - 210), y: rect.bottom + 5 }); };

  const Tree = ({ rows, depth = 0 }: { rows: readonly TreeRow[]; depth?: number }) => <>{rows.map(row => <React.Fragment key={row.id}><div className={`wd-library-tree-row${selected?.id === row.id ? ' selected' : ''}${row.asset?.status === 'disabled' ? ' disabled' : ''}`} style={{ paddingLeft: 12 + depth * 16 }} onClick={() => void open(row)}><button className="wd-library-disclosure" tabIndex={-1}>{row.kind === 'folder' ? (expanded.has(row.id) ? '⌄' : '›') : ''}</button><span className={`wd-library-kind kind-${row.asset?.kind ?? 'folder'}`}>{icon(row)}</span><span className="wd-library-name">{row.name}</span><button className="wd-library-more" aria-label={`${row.name} 更多操作`} onClick={event => showMenu(event, { entry: row })}>•••</button></div>{row.kind === 'folder' && expanded.has(row.id) ? <Tree rows={row.children ?? []} depth={depth + 1} /> : null}</React.Fragment>)}</>;
  const resultEntries = hits.map(hit => findById(hit.nodeId)).filter((row): row is LibraryTreeEntry => Boolean(row));

  return <section className="wd-library"><style>{libraryCss}</style>
    <aside className="wd-library-sidebar"><header><button className="wd-library-nav-toggle" onClick={toggleNavigation}>☰</button><h1>资料库</h1></header><nav className="wd-library-nav"><button className={view === 'search' ? 'active' : ''} onClick={() => { setView('search'); setSelected(undefined); }}>⌕ <span>搜索</span></button><button className={view === 'recent' ? 'active' : ''} onClick={() => void runSearch('recent', '')}>◷ <span>最近</span></button><button className={view === 'outputs' ? 'active' : ''} onClick={() => void runSearch('outputs', '')}>▱ <span>本地产物</span></button></nav><div className="wd-library-section-title"><span>我的资料</span><button aria-label="新建或导入" onClick={event => showMenu(event, { create: true })}>＋</button></div><div className="wd-library-tree" onClick={() => setView('library')}><Tree rows={tree} /></div><footer>本地资料库 · 仅当前设备</footer><input ref={upload} className="wd-library-upload" type="file" multiple accept=".md,.markdown,.txt,.pdf,.docx,.pptx" onChange={event => void files(event.currentTarget.files)} /></aside>
    <main className="wd-library-content">{notice ? <div className="wd-library-toast success">{notice}</div> : null}{error ? <div className="wd-library-toast error">{error}</div> : null}
      {selected ? <><header className="wd-library-document-header"><div><span>我的资料</span><b>/</b><strong>{selected.name}</strong>{selected.asset?.status === 'disabled' ? <em>已停用</em> : null}</div><div className="wd-library-head-actions">{isEditable(selected) ? <button onClick={() => void beginEdit()}>编辑</button> : null}<button onClick={() => void downloadOriginal()}>下载</button><button onClick={event => showMenu(event, { entry: selected })}>•••</button></div></header><div className="wd-library-document-body">{draft ? <div className="wd-library-editor"><div className="wd-library-editor-bar"><strong>编辑草稿</strong><span>发布后生成新的只读修订</span><button onClick={() => setDraft(undefined)}>取消</button><button className="primary" onClick={() => void publishDraft()}>发布新版本</button></div><textarea value={draftContent} onChange={event => setDraftContent(event.currentTarget.value)} /></div> : selected.asset?.status === 'disabled' ? <div className="wd-library-state">这份资料已停用。重新启用后才能查看或用于任务。</div> : originalUrl ? <iframe className="wd-library-pdf" title={selected.name} src={originalUrl} /> : <article className={`wd-library-original ${selected.asset?.kind ?? ''}`}><div className="wd-library-meta">修订 {selected.revision?.number ?? 1} · {selected.asset?.kind === 'docx' || selected.asset?.kind === 'pptx' ? '检索文本（原始预览接入中）' : '原始内容'}</div><pre>{content}</pre></article>}</div></>
      : view === 'search' ? <div className="wd-library-list-view"><h2>搜索</h2><form onSubmit={event => { event.preventDefault(); void runSearch('search'); }}><input autoFocus value={query} onChange={event => setQuery(event.currentTarget.value)} placeholder="搜索资料名称和内容"/><button>搜索</button></form>{busy ? <div className="wd-library-state">正在搜索…</div> : <ResultList rows={resultEntries} open={open} />}</div>
      : view === 'recent' || view === 'outputs' ? <div className="wd-library-list-view"><h2>{view === 'recent' ? '最近' : '本地产物'}</h2>{busy ? <div className="wd-library-state">正在读取…</div> : <ResultList rows={resultEntries} open={open} />}</div>
      : <div className="wd-library-welcome"><div className="wd-library-welcome-icon">▤</div><h2>我的资料</h2><p>从左侧选择资料，在这里查看原始内容。</p><button onClick={event => showMenu(event, { create: true })}>新建或导入资料</button></div>}
    </main>
    {menu ? <div className="wd-library-popover" style={{ left: menu.x, top: menu.y }} onClick={event => event.stopPropagation()}>{menu.create ? <><button onClick={() => void createText('markdown')}>新建文档（.md）</button><button onClick={() => void createText('text')}>新建文本（.txt）</button><button onClick={() => void createFolder()}>新建文件夹</button><hr/><button onClick={() => upload.current?.click()}>上传和导入</button></> : menu.entry ? <><button onClick={() => void addToTask(menu.entry!)}>添加到当前任务</button><hr/><button onClick={() => beginMove(menu.entry!)}>移动到…</button><button onClick={() => void rename(menu.entry!)}>重命名</button>{menu.entry.asset ? <button onClick={() => void setStatus(menu.entry!)}>{menu.entry.asset.status === 'disabled' ? '重新启用' : '停用'}</button> : null}<button className="danger" onClick={() => void remove(menu.entry!)}>删除</button></> : null}</div> : null}
    {moving ? <div className="wd-library-dialog-backdrop"><div className="wd-library-dialog"><h3>移动“{moving.name}”</h3><div>{folderTargets.filter(target => target.id !== moving.id).map(target => <button key={target.id ?? 'root'} onClick={() => void move(target.id)}>📁 {target.label}</button>)}</div><button className="cancel" onClick={() => setMoving(undefined)}>取消</button></div></div> : null}
  </section>;
}

const isEditable = (entry?: LibraryTreeEntry) => entry?.asset?.status !== 'disabled' && (entry?.asset?.kind === 'markdown' || entry?.asset?.kind === 'text');
function ResultList({ rows, open }: { rows: readonly LibraryTreeEntry[]; open: (row: LibraryTreeEntry) => Promise<void> }) { return rows.length ? <div className="wd-library-results">{rows.map(row => <button key={row.id} onClick={() => void open(row)}><span className={`wd-library-kind kind-${row.asset?.kind ?? 'folder'}`}>{icon(row)}</span><span><strong>{row.name}</strong><small>{row.asset?.source === 'task' ? '本地产物' : row.asset?.source === 'created' ? '新建资料' : '上传导入'} · {new Date(row.updatedAt).toLocaleString()}</small></span><i>›</i></button>)}</div> : <div className="wd-library-state">没有找到资料。</div>; }

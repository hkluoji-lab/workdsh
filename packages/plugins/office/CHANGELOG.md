## Current source candidate — HTML and PDF working copies

- Open self-contained HTML working copies before AI revision updates; sandbox the native preview and retain source/download bytes.
- Add PDF Chinese text and rectangle pages, AI page updates, manual text edits, real PDF.js preview, PDF download and native file delivery.
- Embed the licensed Noto Sans SC static font; no end-user Python, font download or system-font requirement for the PDF workflow.
- Existing arbitrary PDF import, OCR and image editing remain outside this slice. Published archives are unchanged.

## alpha.3 未发布：当前中文 PPT 编辑器集成

- 唯一 PPT 提供方：pptx-react-viewer 3.16.5 / pptx-viewer-core 3.14.3。
- 移除其他 PPT 编辑/预览实现及依赖；保留原生编辑、图表数据、同服务修订保存与中文工具栏。
- PPTX 文件 Tab 直接挂载；服务工作副本采用稳定页 ID。

## 0.1.0-alpha.3 — Unreleased PPT adapter work

- Add a private presentation model and atomic slide/element operations, native Konva10.5.0 canvas interactions and PptxGenJS4.0.1 editable text/image export. Both new components are MIT.
- This is a tested technical slice, not an installable real-time PPT feature yet. Host service, six tools, right-pane UI, text input and independent package lifecycle validation remain pending. PPT commands remain unavailable.
- Word development is paused; published alpha.2 remains unchanged.

## 0.1.0-alpha.2 — Word tables/images preview (2026-09-12)

- Reuse MIT Tiptap TableKit and Image extensions for table insertion, row/column editing, header rows, merge/split, column dragging and native image resize.
- Table/image entry points appear near the start of the compact native toolbar.
- AI tools and human editing use the same validated block model, CAS, receipts and human leases; table/image IDs map after a human commit.
- DOCX working copies retain supported merged tables, column widths, embedded PNG/JPEG images, sizes/alignment and existing text styles; original bytes remain available.
- Semantic comparison ignores DTO property order, preventing endless saving after Host validation.
- Model reads expose opaque image references; the existing content service resolves authorized source images and copies their original bytes into the target working copy. Document understanding stays with the model; no separate agent or reference module is added.
- PNG/JPEG up to512 KiB per image; 1 MiB batch, 2 MiB document, 50×50 grid/500 cells maximum. Nested tables, cell images, floating-layout fidelity, headers/footers and complete pagination remain unsupported.


## 0.1.0-alpha.1 — Word text preview (2026-09-12)

- Independent Harness Host/Client plugin with six shared content tools and a saved semantic document service.
- AI creates and opens the right-hand working copy immediately, then writes in visible committed batches.
- Native Tiptap editing with headings, text styles, lists, find/replace, undo/redo, zoom, autosave and reading follow.
- Download the latest saved working copy as DOCX; AI export uses the native Harness deliverable card.
- DOCX imports create a separate text editing copy, retain original bytes and provide original-layout preview.
- Native `/office` output chips and optional `@` working-copy references with explicit reference/target roles.
- All tool registrations are owned by the plugin lifecycle. Removal revokes menus, tools and previews; reinstallation retains saved documents. Missing-source draft references fail serialization rather than silently sending plain text.
- DOCX copy styling is isolated from surrounding code/file-preview typography. An external source update during editing cannot replace the active copy until editing ends.

- Word-only release packaging excludes experimental Univer/Excel/PPT adapters and their runtime dependencies; bundled dependency license texts are checked before packing.
- Frozen-revision exports have stable content-addressed paths. Retry after a lost write receipt verifies existing bytes; conflicting files are preserved, cancellation prevents delivery, and delivery-only failure exposes the saved path. Optional baseRevision rejects a changed document.

### Scope

Word text working copies only. Tables, images, headers/footers, embedded objects and complete Word pagination are outside the editable semantic model. Text-copy import flattens table paragraphs and clearly warns about unsupported features. Original files remain available. The other seven output types are selectable but their live adapters remain pending.

This is a development preview, not a complete Word replacement or an eight-editor release. Professional layout checks in Word/WPS, OS IME checks, cross-host export recovery and power-loss durability remain separate acceptance work.

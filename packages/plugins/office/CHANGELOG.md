# Office release notes

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

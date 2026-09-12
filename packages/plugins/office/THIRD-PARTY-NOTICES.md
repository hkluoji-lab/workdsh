# Third-party notices

Native document editing uses the MIT-licensed Tiptap core, StarterKit and ProseMirror packages, pinned through the workspace lockfile. No paid Tiptap collaboration, AI, import/export or pagination extension is included.

The existing browser file adapters continue to bundle Univer OSS (Apache-2.0), ExcelJS, docx-preview, pptx-preview and their required dependencies. They are distinct from the new native document working-copy API.

Each build writes `dist/THIRD-PARTY-LICENSES.txt` with the license/copyright/notice texts found in every dependency actually bundled by esbuild, and `dist/bundled-dependencies.json` with its exact version. These files travel inside the prebuilt plugin archive. Framework peer dependencies remain owned by the Harness installation. This inventory is not a claim that DOCX/PPTX conversion is lossless or that optional commercial SDKs have been licensed.

`dist/license-review.json` records legacy tarballs without a complete license text. Such entries are not cleared for a final product release by this build. The same-tag Univer repository license supplies the missing protocol 0.25.1 text; the remaining legacy entries require review or replacement in U5.

Tiptap UI Components (MIT), commit 799929bea4804c73767562b69f8acc2acdb8ac86; adapted Toolbar/Button and official SVG icons. Source and changes: src/live/tiptap-ui/SOURCE.md; license included in dist/THIRD-PARTY-LICENSES.txt.

## Word-only release variant

`corepack pnpm release:office:pack` builds the Word-only variant. It excludes the experimental Univer/ExcelJS/pptx-preview adapters from code and package dependencies; only DOCX file previews are registered. Both Word text-copy editing and original-layout DOCX viewing remain available. The eight output choices still describe the future roadmap. `dist/release-scope.json` identifies the variant. All actual bundled dependency license texts must be present; unknown licenses block this release build. isarray 1.0.0's MIT text is retained from its packaged README License section, not inferred from metadata. Dual-licensed `(MIT OR GPL-3.0-or-later)` code is distributed under its MIT option; `(MIT AND Zlib)` includes both texts. Experimental full builds remain subject to the legacy review described above.

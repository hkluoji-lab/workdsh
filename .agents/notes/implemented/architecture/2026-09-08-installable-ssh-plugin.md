# Installable SSH plugin (2026-09-08)

## Decision and scope

The user explicitly changed the deliverable from an independent Electron desktop product to an SSH plugin installed into DeepSeek Harness. The preceding Desktop implementation is checkpointed at `faac235783`. Its packages remain intact; new SSH work is owned by the fifth root Yarn workspace, `dsh-plugin-ssh`.

The plugin owns a `dsh.bundle` patch, a Cordis Host face, a `dsh.client` face, and prebuilt browser assets. It does not fork the Harness shell, replace the root slot, depend on either Desktop workspace, or include Electron. No upstream submodule files are changed.

## Integration

- The bundle inserts one named plugin row. Standard `dsh plugin --profile web add <tarball> --ignore-scripts` activates it; remove reverses the composition.
- Client factories use `window.__ModuleLoader__.load`, with React supplied by Harness. `ctx.slots.inject` waits for `sidebar.footer.action` and `shell.overlay` before registering unique `dsh-ssh` entries. This matters because package graph edges alone do not guarantee parent-slot declarations are ready.
- A same-origin full-workspace iframe isolates xterm/editor CSS. Returning to Harness hides the workspace and preserves its live sessions. Unloading the plugin removes its registered surfaces and closes Host resources through `ctx.effect`.
- The `/ssh-workbench` carrier uses the configured `ctx.connection.requestRejection` authentication fence plus a loopback Host/Origin restriction. No auth bypass or private listening server is introduced.
- SSH2 provides PTY and SFTP. The optional native performance extensions are unnecessary; installation skips lifecycle scripts.
- AI uses `ctx.llm`, configured provider/model IDs, a bounded per-SSH conversation, and explicit terminal-context submission. This is a read/advice assistant, not a remote execution agent. It does not replace the Harness agent's shell provider or submit remote data into unrelated Harness sessions.

## Presentation

Restore the approved compact workspace: global navigation and host tabs above a toolbar, icon rail, real terminal, optional files/editor, AI or transfer panel. Connection management uses a searchable table. Do not recreate prototype telemetry, exit-code blocks or example host sessions as live data. Model keys remain in Harness settings. Missing features are recorded in the package README.

## Compatibility and validation

Baseline: official npm `@deepseek-ai/dsh@0.1.2-rc.1`, isolated install and DSH_HOME. A pre-existing global `0.1.0-rc.7` lacks the required connection fence; fail explicitly on that interface instead of rendering a blank workbench. Exact CLI paths are used in the installation smoke to avoid accidentally resolving an old global CLI.

`ssh:check` builds and checks plugin code and runs security, SFTP, AI and client-factory tests. `scripts/smoke-install.mjs` installs the tarball with the official CLI, verifies authenticated pages/assets, graph inclusion, models, input/origin rejection, then removes the bundle. CI declares macOS and Windows jobs; adding the workflow is not evidence those remote jobs have run.

The root upstream gate is unchanged and still needs the pinned source checkout. The missing pin is separate from installing and testing a published-runtime plugin.

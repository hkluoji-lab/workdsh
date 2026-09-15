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

## 0.1.0: host conversation and workbench

User authorized the conversation-first workflow while retaining manual SSH. Checkpoint before this change: `8947867f6d`. The plugin now registers uniquely prefixed `dsh_ssh_hosts/exec/read/edit` tools with the Harness tools service. Host records are persisted separately from credentials and shared with the browser; legacy browser records migrate on first workspace/menu use.

Command/read/edit calls preserve upstream denials and request Host approval, fail closed without approval support. Commands use a separate SSH exec channel, explicit cwd, bounded output and timeout, cancellation, and no retries. They never write to the manual PTY. Reviewed edits require exact old text plus version, create a remote backup, then use the existing atomic save. They do not claim a service is healthy.

Client adds a session composer selector and keyed views for its own tool names. Completed card data comes from durable tool results; live output is a bounded same-origin Host cache. Cards open the existing iframe with an origin/source-checked host/file intent. Manual output handoff stages text for explicit insertion into the current composer, never auto-submits. The separate legacy AI sidebar still has independent history.

Validation: 19 tests including local SSH exec, cancellation and subsequent manual PTY use, backup/conflict checks, approval policy preservation, host persistence and slot cleanup. Official 0.1.2-rc.1 install smoke passed. In an isolated official Web host, checked composer menu, host-specific draft creation, and opening the correct host form; no model request or business-server change was made during UI QA. Full live Agent repair, card interaction during a real model run and Windows remain unverified.

/**
 * Shared presentation tokens. Domain and runtime state do not belong here.
 *
 * Values resolve to the official `--dsw-*` semantic aliases owned by
 * `@deepseek-ai/dsh-client-ui-theme`. Every name must be part of the official
 * semantic vocabulary and carry a base declaration: an unknown name resolves to
 * nothing and the declaration is dropped at computed-value time, and a hardcoded
 * fallback would silently hide that by painting a stale prototype colour (8 such
 * names shipped unnoticed until 2026-09-24). The whole tree is now fallback-free
 * and `corepack pnpm probe:theme` asserts both halves, so keep these aliases bare.
 * Appearance is driven by the official ThemeRuntime, which applies
 * `body[data-ds-dark-theme]` and `prefers-color-scheme`; feature components must
 * never branch on the theme themselves (see docs/UI-DESIGN.md 15/17).
 */
export const tokens = {
  canvas: 'var(--dsw-alias-bg-base)',
  sidebar: 'var(--dsw-specific-sidebar-fill)',
  card: 'var(--dsw-alias-bg-layer-2)',
  selected: 'var(--dsw-alias-interactive-bg-active)',
  border: 'var(--dsw-alias-border-l2)',
  text: 'var(--dsw-alias-label-primary)',
  secondary: 'var(--dsw-alias-label-secondary)',
} as const;

export type WorkdshTokens = typeof tokens;

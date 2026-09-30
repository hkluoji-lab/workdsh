import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client';
import * as React from 'react';
import { GeWordmark } from './GeWordmark.js';

/**
 * 文案去掉 `DSH` 前缀后，`企业AI工作台` 在官方默认 18px 下自然宽约 112px，
 * 可单行容纳于官方名称席位（约 127px，行高 24px），故回归官方默认 18px/600 排版，
 * 与左侧 24px 高的 10GE 字标形成字号与明度对比。官方 `.brandName` 无 nowrap，
 * 换行会被 `.brand{overflow:hidden}` 裁切，故此处仍显式声明 nowrap 并留 ellipsis 兜底。
 */
export function BrandName() {
  return (
    <span
      data-testid="workdsh-brand"
      style={{
        display: 'inline-block',
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        letterSpacing: 0,
        fontSize: 18,
        lineHeight: '24px',
        fontWeight: 600,
        color: 'var(--dsw-alias-label-primary, currentColor)',
      }}
    >
      企业AI工作台
    </span>
  );
}

/** The owner supplies the box edge; the wordmark keeps its own aspect ratio. */
export function BrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return <GeWordmark height={size} />;
}

export function DiagnosticsMark() {
  return <span aria-hidden>W</span>;
}

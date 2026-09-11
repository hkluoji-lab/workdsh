import type { Context } from '@deepseek-ai/cordis';

/** Product diagnostics only. Feature packages are installed as separate Profile layers. */
export const name = 'workdsh-installation-probe';

export function apply(ctx: Context): void {
  ctx.effect(() => {
    process.stdout.write('[workdsh:probe] activated\n');
    return () => process.stdout.write('[workdsh:probe] disposed\n');
  });
}

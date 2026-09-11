import type { Context } from '@deepseek-ai/cordis';
import { applySkillsHost } from 'workdsh-plugin-skills';

/** WorkDSH's bundled skill contribution for the default Harness profile. */
export const name = 'workdsh-installation-probe';
export const inject = ['skills', 'connection', 'tools'];

export function apply(ctx: Context): void {
  applySkillsHost(ctx);
  ctx.effect(() => {
    process.stdout.write('[workdsh:probe] activated\n');
    return () => process.stdout.write('[workdsh:probe] disposed\n');
  });
}

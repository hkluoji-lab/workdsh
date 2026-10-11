import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-storage-domain';
import type {} from '@deepseek-ai/dsh-client-connection';
import type {} from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-attachment';
import type {} from '@deepseek-ai/dsh-fs-local';
import { DriveManager, type DriveManagerOptions } from './services/drive-manager.js';
import { registerDriveCapture } from './services/capture.js';
import { registerDriveConnection } from './remote/drive-api.js';
import { registerDriveTools } from './tools/drive-tools.js';

export * from './services/drive-manager.js';
export * from './storage/domain.js';

export const name = 'workdsh-plugin-drive';
export const inject = ['storageDomain', 'connection', 'tools', 'workdshIdentity', 'attachments', 'fs'];

export async function apply(ctx: Context, options: DriveManagerOptions = {}): Promise<void> {
  await ctx.plugin(DriveManager, options);
  await ctx.plugin({
    name: 'workdsh-drive-integration',
    inject: [...inject, 'workdshDrive'],
    apply(integration: Context) {
      registerDriveConnection(integration);
      registerDriveTools(integration);
      registerDriveCapture(integration);
    },
  });
}

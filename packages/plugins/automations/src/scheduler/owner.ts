/**
 * Single scheduler owner for one Harness home (ACCEPTANCE.md P-AU-3, CONTRACTS.md section 4).
 *
 * The arbiter is the kernel, exactly as the official Session persistence does it: a
 * non-blocking `flock(2)` on one file, with **no expiry**. Contention means another live
 * process already schedules, and the kernel releases the lock when that process dies — so a
 * crashed Host is replaced immediately, while two live Hosts can never both claim the same
 * occurrence. There is deliberately no stored lease: a lease row would be a second source of
 * truth about who schedules, and the probe proved the official model has no expiry to honour.
 */
import { mkdir, open } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname } from 'node:path';
import { tryLockExclusive } from '@deepseek-ai/node-addon-system/flock';

/** Identity recorded on claimed occurrences (`ScheduleOccurrence.claimedBy`). */
export const schedulerOwnerId = (): string => `${hostname()}-${process.pid}`;

const isContention = (error: unknown): boolean => {
  const code = (error as { code?: string } | undefined)?.code;
  return code === 'EAGAIN' || code === 'EWOULDBLOCK';
};

export interface SchedulerOwnership {
  readonly ownerId: string;
  /** Drop the lock. The kernel also drops it when this process exits. */
  release(): Promise<void>;
}

/**
 * Take the scheduler lock, or report that another live Host holds it.
 *
 * @param lockPath - one file per Harness home; the path is the identity of the lock.
 * @param ownerId - identity stamped on the occurrences this Host claims.
 * @returns the held ownership, or `undefined` when another process is already scheduling.
 */
export async function acquireSchedulerOwnership(lockPath: string, ownerId: string): Promise<SchedulerOwnership | undefined> {
  await mkdir(dirname(lockPath), { recursive: true });
  const handle = await open(lockPath, 'w');
  try {
    await tryLockExclusive(handle.fd);
  } catch (error) {
    await handle.close();
    if (isContention(error)) return undefined;
    throw error;
  }
  return { ownerId, release: () => handle.close() };
}

/** TM-01 business policy only. Host-owned inputs; no tools, scheduler or Agent state.
 * The Host must authenticate callers, resolve frozen member bindings, verify
 * receipts against native history, re-read artifact bytes, and atomically
 * persist each returned state. This internal module is not yet installed as a
 * production team service.
 */
export interface SopStage {
  id: string;
  worker: string;
  reviewer?: string;
  instructions?: string;
  dependsOn: string[];
  maxAttempts: number;
}
export interface SopPlan { stages: SopStage[]; maxTotalAttempts: number }
/** One immutable file version pinned by an output receipt. The Host recomputes
 * `sha256`/`byteLength` from the workspace bytes; a path alone proves nothing. */
export interface SopArtifact { path: string; sha256: string; byteLength: number }
export interface SopReceipt { sessionId: string; terminalSeq: number; digest: string; artifacts?: SopArtifact[] }
export type SopVerdict = 'accepted' | 'changes-requested' | 'blocked';
export interface SopAttempt {
  number: number;
  workSessionId: string;
  inputs: Record<string, string>;
  output?: SopReceipt;
  reviewSessionId?: string;
  proposal?: { outputDigest: string; verdict: SopVerdict };
  decision?: { verdict: SopVerdict; receipt: SopReceipt };
  abandoned?: string;
}
export interface SopState { revision: number; plan: SopPlan; attempts: Record<string, SopAttempt[]> }

function requireThat(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(`sop/${code}`);
}
function bounded(value: number, max: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= max;
}
function receiptValid(receipt: SopReceipt, sessionId: string): void {
  requireThat(receipt.sessionId === sessionId && bounded(receipt.terminalSeq, Number.MAX_SAFE_INTEGER)
    && /^[a-f0-9]{64}$/.test(receipt.digest), 'invalid-receipt');
  if (receipt.artifacts !== undefined) {
    requireThat(Array.isArray(receipt.artifacts) && receipt.artifacts.length > 0, 'invalid-artifacts');
    const paths = new Set<string>();
    for (const artifact of receipt.artifacts) {
      requireThat(typeof artifact.path === 'string' && artifact.path.length > 0
        && /^[a-f0-9]{64}$/.test(artifact.sha256)
        && Number.isSafeInteger(artifact.byteLength) && artifact.byteLength > 0, 'invalid-artifacts');
      requireThat(!paths.has(artifact.path), 'duplicate-artifact');
      paths.add(artifact.path);
    }
  }
}
export function createSop(plan: SopPlan): SopState {
  requireThat(bounded(plan.stages.length, 20) && bounded(plan.maxTotalAttempts, 20)
    && plan.maxTotalAttempts >= plan.stages.length, 'invalid-budget');
  requireThat(new Set(plan.stages.flatMap(s => [s.worker, ...(s.reviewer ? [s.reviewer] : [])])).size <= 8, 'member-limit');
  const ids = new Set(plan.stages.map(s => s.id));
  requireThat(ids.size === plan.stages.length && [...ids].every(id => /^[a-z][a-z0-9_-]{0,63}$/.test(id)), 'invalid-stage');
  const visited = new Set<string>();
  const visiting = new Set<string>();
  function visit(id: string): void {
    requireThat(!visiting.has(id), 'cyclic-dependencies');
    if (visited.has(id)) return;
    visiting.add(id);
    const stage = plan.stages.find(s => s.id === id)!;
    requireThat(stage.worker && (!stage.reviewer || stage.worker !== stage.reviewer), 'self-review');
    requireThat(bounded(stage.maxAttempts, 3), 'invalid-budget');
    requireThat(new Set(stage.dependsOn).size === stage.dependsOn.length && stage.dependsOn.every(dep => ids.has(dep)), 'invalid-dependencies');
    stage.dependsOn.forEach(visit);
    visiting.delete(id); visited.add(id);
  }
  plan.stages.forEach(stage => visit(stage.id));
  return { revision: 0, plan: structuredClone(plan), attempts: Object.fromEntries(plan.stages.map(s => [s.id, []])) };
}
function change(state: SopState, revision: number, stageId: string,
  update: (next: SopState, stage: SopStage, attempts: SopAttempt[]) => void): SopState {
  requireThat(state.revision === revision, 'revision-conflict');
  const next = structuredClone(state);
  const stage = next.plan.stages.find(s => s.id === stageId);
  requireThat(stage, 'unknown-stage');
  update(next, stage, next.attempts[stageId]!);
  next.revision++;
  return next;
}
function latest(attempts: SopAttempt[]): SopAttempt {
  const attempt = attempts.at(-1);
  requireThat(attempt, 'no-attempt');
  return attempt;
}
function unusedSession(state: SopState, sessionId: string): void {
  requireThat(sessionId && !Object.values(state.attempts).flat().some(a => a.workSessionId === sessionId || a.reviewSessionId === sessionId), 'session-reused');
}
export function admitSopWork(state: SopState, revision: number, stageId: string, sessionId: string): SopState {
  return change(state, revision, stageId, (next, stage, attempts) => {
    const prior = attempts.at(-1);
    requireThat(!prior || prior.abandoned || prior.decision?.verdict === 'changes-requested', 'attempt-not-retryable');
    const inputs: Record<string, string> = {};
    for (const dep of stage.dependsOn) {
      const accepted = next.attempts[dep]?.at(-1);
      requireThat(accepted?.output && accepted.decision?.verdict === 'accepted' && !accepted.abandoned, 'predecessor-not-accepted');
      inputs[dep] = accepted.output.digest;
    }
    requireThat(attempts.length < stage.maxAttempts && Object.values(next.attempts).flat().length < next.plan.maxTotalAttempts, 'attempt-limit');
    unusedSession(next, sessionId);
    attempts.push({ number: attempts.length + 1, workSessionId: sessionId, inputs });
  });
}
export function recordSopOutput(state: SopState, revision: number, stageId: string, receipt: SopReceipt): SopState {
  return change(state, revision, stageId, (_next, stage, attempts) => {
    const attempt = latest(attempts);
    requireThat(!attempt.output && !attempt.abandoned, 'output-immutable');
    receiptValid(receipt, attempt.workSessionId);
    attempt.output = structuredClone(receipt);
    if (!stage.reviewer) attempt.decision = { verdict: 'accepted', receipt: structuredClone(receipt) };
  });
}
export function admitSopReview(state: SopState, revision: number, stageId: string, sessionId: string): SopState {
  return change(state, revision, stageId, (next, stage, attempts) => {
    requireThat(stage.reviewer, 'review-not-required');
    const attempt = latest(attempts);
    requireThat(attempt.output && !attempt.reviewSessionId && !attempt.abandoned, 'review-not-admissible');
    unusedSession(next, sessionId);
    attempt.reviewSessionId = sessionId;
  });
}
export function proposeSopReview(state: SopState, revision: number, stageId: string, callerSessionId: string,
  outputDigest: string, verdict: SopVerdict): SopState {
  return change(state, revision, stageId, (_next, _stage, attempts) => {
    const attempt = latest(attempts);
    requireThat(attempt.reviewSessionId === callerSessionId, 'wrong-reviewer');
    requireThat(attempt.output?.digest === outputDigest, 'stale-output');
    requireThat(!attempt.abandoned && !attempt.proposal && !attempt.decision, 'review-already-closed');
    requireThat(['accepted', 'changes-requested', 'blocked'].includes(verdict), 'invalid-verdict');
    attempt.proposal = { outputDigest, verdict };
  });
}
/** A tool proposal is not acceptance. Only the Host, after a completed native
 * review turn, can attach its verified receipt and commit the decision. */
export function finalizeSopReview(state: SopState, revision: number, stageId: string, receipt: SopReceipt): SopState {
  return change(state, revision, stageId, (_next, _stage, attempts) => {
    const attempt = latest(attempts);
    requireThat(attempt.proposal && !attempt.decision && !attempt.abandoned, 'review-not-finalizable');
    requireThat(attempt.output?.digest === attempt.proposal.outputDigest, 'stale-output');
    receiptValid(receipt, attempt.reviewSessionId!);
    attempt.decision = { verdict: attempt.proposal.verdict, receipt: structuredClone(receipt) };
  });
}
/** Explicit failure disposition consumes the attempt. Never re-open an accepted
 * version or silently spawn repeated reviewers within the same attempt. */
export function abandonSopAttempt(state: SopState, revision: number, stageId: string, reason: string): SopState {
  return change(state, revision, stageId, (_next, _stage, attempts) => {
    const attempt = latest(attempts);
    requireThat(reason && !attempt.decision && !attempt.abandoned, 'attempt-closed');
    attempt.abandoned = reason;
  });
}
/** Host-owned byte check for review, handoff and delivery. The caller re-reads
 * every path pinned by the attempt's output OR decision receipt and passes the
 * observed digests; a text-only attempt pins nothing and passes. Missing, extra
 * or changed bytes fail closed. */
export function verifySopArtifacts(state: SopState, revision: number, stageId: string, actual: SopArtifact[]): void {
  requireThat(state.revision === revision, 'revision-conflict');
  requireThat(state.plan.stages.some(s => s.id === stageId), 'unknown-stage');
  const attempt = state.attempts[stageId]?.at(-1);
  requireThat(attempt?.output, 'no-output');
  const expected = [...(attempt.output.artifacts ?? []), ...(attempt.decision?.receipt.artifacts ?? [])];
  if (expected.length === 0) return;
  const byPath = new Map<string, SopArtifact>();
  for (const artifact of actual) {
    if (typeof artifact?.path === 'string') byPath.set(artifact.path, artifact);
  }
  requireThat(actual.length === expected.length, 'artifact-mismatch');
  for (const artifact of expected) {
    const found = byPath.get(artifact.path);
    requireThat(found && found.sha256 === artifact.sha256 && found.byteLength === artifact.byteLength, 'stale-artifact');
  }
}

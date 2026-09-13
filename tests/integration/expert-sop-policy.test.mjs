import test from 'node:test';
import assert from 'node:assert/strict';
import * as p from '../../packages/plugins/experts/dist/domain/team-sop.js';

const plan = () => ({ maxTotalAttempts: 4, stages: [
  { id: 'draft', worker: 'writer', reviewer: 'reviewer', dependsOn: [], maxAttempts: 2 },
  { id: 'deliver', worker: 'reviewer', reviewer: 'writer', dependsOn: ['draft'], maxAttempts: 1 },
] });
const receipt = (sessionId, digest = 'a'.repeat(64)) => ({ sessionId, terminalSeq: 10, digest });
function output(state, id = 'work-1', digest) {
  state = p.admitSopWork(state, state.revision, 'draft', id);
  return p.recordSopOutput(state, state.revision, 'draft', receipt(id, digest));
}
function review(state, verdict, session = 'review-1') {
  state = p.admitSopReview(state, state.revision, 'draft', session);
  state = p.proposeSopReview(state, state.revision, 'draft', session, state.attempts.draft.at(-1).output.digest, verdict);
  return p.finalizeSopReview(state, state.revision, 'draft', receipt(session));
}
const artifact = (path, fill = 'b') => ({ path, sha256: fill.repeat(64), byteLength: 128 });
function artifactOutput(state, id, artifacts) {
  state = p.admitSopWork(state, state.revision, 'draft', id);
  return p.recordSopOutput(state, state.revision, 'draft', { ...receipt(id), artifacts });
}

test('SOP definition rejects cycles, missing predecessors, self-review and unbounded attempts', () => {
  for (const [edit, error] of [
    [s => s.stages[0].dependsOn.push('deliver'), /cyclic-dependencies/],
    [s => s.stages[1].dependsOn.push('missing'), /invalid-dependencies/],
    [s => { s.stages[0].reviewer = 'writer'; }, /self-review/],
    [s => { s.stages[0].maxAttempts = Infinity; }, /invalid-budget/],
    [s => { s.maxTotalAttempts = 21; }, /invalid-budget/],
    [s => { s.maxTotalAttempts = 1; }, /invalid-budget/],
  ]) { const definition = plan(); edit(definition); assert.throws(() => p.createSop(definition), error); }
});

test('native output and review proposal alone cannot release a predecessor', () => {
  let state = output(p.createSop(plan()));
  const original = structuredClone(state);
  assert.throws(() => p.admitSopWork(state, state.revision, 'deliver', 'later'), /predecessor-not-accepted/);
  assert.deepEqual(state, original, 'rejected changes must not mutate persisted state');
  state = p.admitSopReview(state, state.revision, 'draft', 'review-1');
  state = p.proposeSopReview(state, state.revision, 'draft', 'review-1', 'a'.repeat(64), 'accepted');
  assert.throws(() => p.admitSopWork(state, state.revision, 'deliver', 'later'), /predecessor-not-accepted/);
  assert.throws(() => p.finalizeSopReview(state, state.revision, 'draft', receipt('work-1')), /invalid-receipt/);
  state = p.finalizeSopReview(state, state.revision, 'draft', receipt('review-1'));
  state = p.admitSopWork(state, state.revision, 'deliver', 'later');
  assert.deepEqual(state.attempts.deliver[0].inputs, { draft: 'a'.repeat(64) });
});

test('changed outputs require new attempts and current reviewer; accepted output is immutable', () => {
  let state = review(output(p.createSop(plan())), 'changes-requested');
  state = output(state, 'work-2', 'b'.repeat(64));
  state = p.admitSopReview(state, state.revision, 'draft', 'review-2');
  assert.throws(() => p.proposeSopReview(state, state.revision, 'draft', 'review-1', 'a'.repeat(64), 'accepted'), /wrong-reviewer/);
  assert.throws(() => p.proposeSopReview(state, state.revision, 'draft', 'review-2', 'a'.repeat(64), 'accepted'), /stale-output/);
  state = p.proposeSopReview(state, state.revision, 'draft', 'review-2', 'b'.repeat(64), 'accepted');
  state = p.finalizeSopReview(state, state.revision, 'draft', receipt('review-2'));
  assert.throws(() => p.recordSopOutput(state, state.revision, 'draft', receipt('work-2')), /output-immutable/);
  assert.throws(() => p.admitSopWork(state, state.revision, 'draft', 'work-3'), /attempt-not-retryable/);
  assert.throws(() => p.abandonSopAttempt(state, state.revision, 'draft', 'retry accepted'), /attempt-closed/);
});

test('bounded rework, explicit failed-review disposition, global cap and blocked verdict fail closed', () => {
  let state = review(output(p.createSop(plan())), 'changes-requested');
  state = review(output(state, 'work-2'), 'changes-requested', 'review-2');
  assert.throws(() => p.admitSopWork(state, state.revision, 'draft', 'work-3'), /attempt-limit/);
  state = p.createSop({ stages: [plan().stages[0]], maxTotalAttempts: 1 });
  state = output(state);
  state = p.admitSopReview(state, state.revision, 'draft', 'review-1');
  state = p.proposeSopReview(state, state.revision, 'draft', 'review-1', 'a'.repeat(64), 'accepted');
  state = p.abandonSopAttempt(state, state.revision, 'draft', 'native review aborted');
  assert.throws(() => p.finalizeSopReview(state, state.revision, 'draft', receipt('review-1')), /review-not-finalizable/);
  assert.throws(() => p.admitSopReview(state, state.revision, 'draft', 'review-2'), /review-not-admissible/);
  assert.throws(() => p.admitSopWork(state, state.revision, 'draft', 'work-2'), /attempt-limit/);
  state = review(output(p.createSop(plan())), 'blocked');
  assert.throws(() => p.admitSopWork(state, state.revision, 'draft', 'work-2'), /attempt-not-retryable/);
});

test('artifact receipts validate file-version shape and reject ambiguous pins', () => {
  const pin = artifact('report.md');
  let state = p.admitSopWork(p.createSop(plan()), 0, 'draft', 'work-1');
  for (const [artifacts, error] of [
    [[], /invalid-artifacts/],
    [[{ ...pin, path: '' }], /invalid-artifacts/],
    [[{ ...pin, sha256: 'xyz' }], /invalid-artifacts/],
    [[{ ...pin, sha256: undefined }], /invalid-artifacts/],
    [[{ ...pin, byteLength: 0 }], /invalid-artifacts/],
    [[{ ...pin, byteLength: 1.5 }], /invalid-artifacts/],
    [[pin, artifact('report.md', 'c')], /duplicate-artifact/],
  ]) {
    assert.throws(() => p.recordSopOutput(state, state.revision, 'draft', { ...receipt('work-1'), artifacts }), error);
  }
  state = p.recordSopOutput(state, state.revision, 'draft', { ...receipt('work-1'), artifacts: [pin, artifact('notes.txt')] });
  assert.deepEqual(state.attempts.draft[0].output.artifacts.map(a => a.path), ['report.md', 'notes.txt']);
});

test('review, handoff and delivery fail closed when pinned bytes change or paths drift', () => {
  const pin = artifact('draft.md');
  const bytes = () => [{ path: 'draft.md', sha256: 'b'.repeat(64), byteLength: 128 }];
  // A text-only receipt pins nothing and passes without a byte check.
  const textOnly = output(p.createSop(plan()));
  p.verifySopArtifacts(textOnly, textOnly.revision, 'draft', []);
  assert.throws(() => p.verifySopArtifacts(textOnly, textOnly.revision, 'deliver', []), /no-output/);
  let state = artifactOutput(p.createSop(plan()), 'work-1', [pin]);
  p.verifySopArtifacts(state, state.revision, 'draft', bytes());
  assert.throws(() => p.verifySopArtifacts(state, state.revision - 1, 'draft', bytes()), /revision-conflict/);
  assert.throws(() => p.verifySopArtifacts(state, state.revision, 'missing', bytes()), /unknown-stage/);
  assert.throws(() => p.verifySopArtifacts(state, state.revision, 'draft', [{ ...bytes()[0], sha256: 'c'.repeat(64) }]), /stale-artifact/);
  assert.throws(() => p.verifySopArtifacts(state, state.revision, 'draft', [{ ...bytes()[0], byteLength: 129 }]), /stale-artifact/);
  assert.throws(() => p.verifySopArtifacts(state, state.revision, 'draft', []), /artifact-mismatch/);
  assert.throws(() => p.verifySopArtifacts(state, state.revision, 'draft', [...bytes(), artifact('extra.txt')]), /artifact-mismatch/);
  assert.throws(() => p.verifySopArtifacts(state, state.revision, 'draft', [artifact('other.md')]), /stale-artifact/);
  // The reviewer's decision can pin its own review report; changed bytes fail the same way.
  state = p.admitSopReview(state, state.revision, 'draft', 'review-1');
  state = p.proposeSopReview(state, state.revision, 'draft', 'review-1', 'a'.repeat(64), 'accepted');
  state = p.finalizeSopReview(state, state.revision, 'draft', { ...receipt('review-1'), artifacts: [artifact('review.md')] });
  assert.equal(state.attempts.draft[0].decision.receipt.artifacts[0].path, 'review.md');
  // Both the output pin and the decision pin are re-checked together.
  p.verifySopArtifacts(state, state.revision, 'draft', [bytes()[0], artifact('review.md')]);
  assert.throws(() => p.verifySopArtifacts(state, state.revision, 'draft', [bytes()[0]]), /artifact-mismatch/);
  assert.throws(() => p.verifySopArtifacts(state, state.revision, 'draft', [bytes()[0], artifact('review.md', 'e')]), /stale-artifact/);
  assert.throws(() => p.recordSopOutput(state, state.revision, 'draft', receipt('work-1')), /output-immutable/);
});

test('stale revisions and reused session ids cannot allocate duplicate authority', () => {
  let state = output(p.createSop(plan()));
  assert.throws(() => p.admitSopReview(state, state.revision - 1, 'draft', 'review-1'), /revision-conflict/);
  assert.throws(() => p.admitSopReview(state, state.revision, 'draft', 'work-1'), /session-reused/);
  state = review(state, 'changes-requested');
  assert.throws(() => p.admitSopWork(state, state.revision, 'draft', 'review-1'), /session-reused/);
  const copied = JSON.parse(JSON.stringify(state));
  const next = p.admitSopWork(copied, copied.revision, 'draft', 'work-2');
  assert.equal(next.attempts.draft.length, 2);
  assert.equal(state.attempts.draft.length, 1);
});


test('optional review permits ordinary team handoff only after actual native output', () => {
  let state = p.createSop({ maxTotalAttempts: 2, stages: [
    { id: 'analyze', worker: 'analyst', dependsOn: [], maxAttempts: 1 },
    { id: 'summarize', worker: 'editor', dependsOn: ['analyze'], maxAttempts: 1 },
  ] });
  state = p.admitSopWork(state, state.revision, 'analyze', 'native-analysis');
  assert.throws(() => p.admitSopWork(state, state.revision, 'summarize', 'native-summary'), /predecessor-not-accepted/);
  state = p.recordSopOutput(state, state.revision, 'analyze', receipt('native-analysis'));
  assert.equal(state.attempts.analyze[0].decision.verdict, 'accepted');
  assert.throws(() => p.admitSopReview(state, state.revision, 'analyze', 'unnecessary-review'), /review-not-required/);
  state = p.admitSopWork(state, state.revision, 'summarize', 'native-summary');
  assert.deepEqual(state.attempts.summarize[0].inputs, { analyze: 'a'.repeat(64) });
});

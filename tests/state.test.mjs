import test from 'node:test';
import assert from 'node:assert/strict';
import { contextFrom, metric, stepState, timeLabel } from '../web/src/lib/state.js';

test('zero is preserved; missing numbers stay missing', () => {
  assert.equal(metric(0), '0');
  assert.equal(metric(null), '—');
  assert.equal(metric(undefined), '—');
});

test('SSE progress does not discard agent identity or running status', () => {
  let steps = stepState({}, 'step_started', { id: 'extract', agent: 'media', name: 'Read video' });
  steps = stepState(steps, 'step_progress', { id: 'extract', done: 1, total: 6 });
  assert.equal(steps.extract.agent, 'media');
  assert.equal(steps.extract.status, 'running');
  steps = stepState(steps, 'step_finished', { id: 'extract', status: 'ok', output: {} });
  assert.equal(steps.extract.status, 'ok');
});

test('uploaded video starts before posting with no fabricated outcomes', () => {
  assert.equal(contextFrom().published, false);
  assert.equal(contextFrom().outcome, null);
  assert.equal(contextFrom().sku_id, null);
});

test('timestamps support seeking without inventing a missing timestamp', () => {
  assert.equal(timeLabel(65.8), '01:05');
  assert.equal(timeLabel(undefined), '—');
});

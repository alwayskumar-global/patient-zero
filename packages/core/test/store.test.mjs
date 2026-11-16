import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkRelate, openStore } from '../dist/index.js';

test('loads the native Relate binding and executes Cypher', () => {
  assert.equal(checkRelate().connected, true);
});

test('read-only default refuses a missing store without creating one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pz-missing-'));
  try {
    const path = join(dir, 'missing.rl');
    assert.throws(() => openStore(path));
    assert.equal(existsSync(path), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('requires a single-file store rather than a directory store', () => {
  assert.throws(() => openStore(':memory:'), /ending in .rl/);
});

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openStore } from '../packages/core/dist/index.js';

const [mode, path] = process.argv.slice(2);
if (mode === '--write' && path) {
  const db = openStore(path, { readOnly: false });
  db.connect().query('CREATE (:Smoke {name: $name})', { name: 'patient-zero' });
  db.checkpoint();
} else if (mode === '--read' && path) {
  const db = openStore(path);
  const conn = db.connect();
  assert.equal(conn.query('MATCH (n:Smoke) RETURN n.name AS name').single().name, 'patient-zero');
  assert.throws(() => conn.query('CREATE (:MustNotWrite)'));
} else {
  // Relate has no close method. Separate processes release each store lease.
  const dir = mkdtempSync(join(tmpdir(), 'patient-zero-smoke-'));
  try {
    for (const phase of ['--write', '--read']) {
      const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), phase, join(dir, 'smoke.rl')], {
        encoding: 'utf8', timeout: 30_000,
      });
      if (result.error) throw result.error;
      assert.equal(result.status, 0, result.stderr || `Smoke phase failed: ${phase}`);
    }
    console.log('PASS: native binding, .rl persistence across processes, read-only query and write rejection.');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

import { Database } from '@relate/relate';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
export * from './model.js';
export * from './graph.js';
export * from './detect.js';
export * from './lockfile.js';
export * from './gate.js';

/** Read-only by default; do not accidentally create an empty gate input store. */
export function openStore(path: string, options: { readOnly?: boolean } = {}): Database {
  if (!path.endsWith('.rl')) {
    throw new Error('A single-file Relate store path ending in .rl is required.');
  }
  const absolutePath = resolve(path);
  const readOnly = options.readOnly ?? true;
  if (readOnly && !statSync(absolutePath).isFile()) {
    throw new Error(`Expected a store file: ${absolutePath}`);
  }
  return Database.open(absolutePath, { readOnly });
}

/** In-memory check only; no incident data, network requests or persistent writes. */
export function checkRelate(): { engine: string; connected: boolean } {
  const db = Database.open(':memory:');
  const row = db.connect().query('RETURN 1 AS ok').single();
  if (row.ok !== 1 && row.ok !== 1n) throw new Error('Unexpected Relate smoke result.');
  return { engine: '@relate/relate@1.0.1', connected: true };
}

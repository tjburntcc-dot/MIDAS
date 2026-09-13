import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { rawHash, requireThat } from '../contracts.ts';
import { StateStore } from '../state.ts';

export function backupPilot(store: StateStore, directory: string) {
  const target = resolve(directory); requireThat(!existsSync(target), 'BACKUP_TARGET_EXISTS'); mkdirSync(target, {recursive: true});
  const file = join(target, 'pilot.sqlite');
  store.db.prepare('VACUUM INTO ?').run(file);
  const manifest = {version: 'pilot-backup-v1', file: 'pilot.sqlite', sha256: rawHash(readFileSync(file)), createdAt: new Date().toISOString(), contains: 'company data, immutable evidence, tool observations and local preview state; no credentials', privacy: 'private owner data; keep off Git and public storage'};
  writeFileSync(join(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n'); return manifest;
}
export function restorePilot(directory: string, targetRoot: string, expectedHash: string) {
  const source = resolve(directory), target = resolve(targetRoot);
  requireThat(!existsSync(target), 'RESTORE_TARGET_EXISTS');
  requireThat(/^[a-f0-9]{64}$/.test(expectedHash), 'RESTORE_HASH_REQUIRED');
  const manifest = JSON.parse(readFileSync(join(source, 'manifest.json'), 'utf8'));
  requireThat(manifest.version === 'pilot-backup-v1' && manifest.file === 'pilot.sqlite' && manifest.sha256 === expectedHash, 'RESTORE_MANIFEST_MISMATCH');
  const file = join(source, 'pilot.sqlite'); requireThat(rawHash(readFileSync(file)) === expectedHash, 'RESTORE_CONTENT_MISMATCH');
  mkdirSync(target, {recursive: true}); copyFileSync(file, join(target, 'pilot.sqlite'), constants.COPYFILE_EXCL);
  const db = new StateStore(join(target, 'pilot.sqlite'));
  try { requireThat(db.db.prepare('PRAGMA integrity_check').get()?.integrity_check === 'ok', 'RESTORE_DATABASE_INVALID'); } finally { db.close(); }
  return {restored: true, target, sha256: expectedHash, automaticExecution: false};
}

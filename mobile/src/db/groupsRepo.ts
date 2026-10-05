import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from './database';
import { enqueue } from './syncQueueRepo';
import type { Group } from '../types';

function rowToGroup(row: any): Group {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deleted: !!row.deleted,
  };
}

export async function createGroup(name: string): Promise<Group> {
  const db = getDb();
  const now = Date.now();
  const id = uuidv4();

  await db.execute('INSERT INTO groups (id, name, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, 0)', [
    id,
    name,
    now,
    now,
  ]);

  await enqueue(id, 'group', 'upsert', now, { name, createdAt: now });

  return { id, name, createdAt: now, updatedAt: now };
}

export async function listGroups(): Promise<Group[]> {
  const db = getDb();
  const res = await db.execute('SELECT * FROM groups WHERE deleted = 0 ORDER BY created_at DESC');
  return res.rows.map(rowToGroup);
}

export async function getGroup(id: string): Promise<Group | null> {
  const db = getDb();
  const res = await db.execute('SELECT * FROM groups WHERE id = ? AND deleted = 0', [id]);
  const row = res.rows[0];
  return row ? rowToGroup(row) : null;
}

/** Upsert coming FROM the server (pull / sync response) — does not re-enqueue. */
export async function upsertGroupFromServer(group: Group): Promise<void> {
  const db = getDb();
  const existingRes = await db.execute('SELECT updated_at FROM groups WHERE id = ?', [group.id]);
  const existing = existingRes.rows[0];
  if (existing && existing.updated_at >= group.updatedAt) return; // local copy already newer/equal

  await db.execute(
    `INSERT INTO groups (id, name, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at, deleted = excluded.deleted`,
    [group.id, group.name, group.createdAt, group.updatedAt, group.deleted ? 1 : 0],
  );
}

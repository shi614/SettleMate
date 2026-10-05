import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from './database';
import { enqueue } from './syncQueueRepo';
import type { Member } from '../types';

function rowToMember(row: any): Member {
  return {
    id: row.id,
    groupId: row.group_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deleted: !!row.deleted,
  };
}

export async function addMember(groupId: string, name: string): Promise<Member> {
  const db = getDb();
  const now = Date.now();
  const id = uuidv4();

  await db.execute(
    'INSERT INTO members (id, group_id, name, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, 0)',
    [id, groupId, name, now, now],
  );

  await enqueue(id, 'member', 'upsert', now, { groupId, name, createdAt: now });

  return { id, groupId, name, createdAt: now, updatedAt: now };
}

export async function listMembers(groupId: string): Promise<Member[]> {
  const db = getDb();
  const res = await db.execute('SELECT * FROM members WHERE group_id = ? AND deleted = 0 ORDER BY created_at ASC', [
    groupId,
  ]);
  return res.rows.map(rowToMember);
}

export async function upsertMemberFromServer(member: Member): Promise<void> {
  const db = getDb();
  const existingRes = await db.execute('SELECT updated_at FROM members WHERE id = ?', [member.id]);
  const existing = existingRes.rows[0];
  if (existing && existing.updated_at >= member.updatedAt) return;

  await db.execute(
    `INSERT INTO members (id, group_id, name, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at, deleted = excluded.deleted`,
    [member.id, member.groupId, member.name, member.createdAt, member.updatedAt, member.deleted ? 1 : 0],
  );
}

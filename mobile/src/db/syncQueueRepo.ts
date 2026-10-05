import { getDb } from './database';
import type { SyncAction, SyncEntity, SyncActionType } from '../types';

export async function enqueue(
  entityId: string,
  entity: SyncEntity,
  actionType: SyncActionType,
  updatedAt: number,
  payload: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  await db.execute(
    'INSERT INTO sync_queue (entity_id, entity, action_type, updated_at, payload, attempts, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
    [entityId, entity, actionType, updatedAt, JSON.stringify(payload), Date.now()],
  );
}

export async function getPendingActions(limit = 50): Promise<SyncAction[]> {
  const db = getDb();
  const res = await db.execute('SELECT * FROM sync_queue ORDER BY queue_row_id ASC LIMIT ?', [limit]);
  return res.rows.map((row: any) => ({
    id: row.entity_id,
    entity: row.entity,
    type: row.action_type,
    updatedAt: row.updated_at,
    payload: JSON.parse(row.payload),
    queueRowId: row.queue_row_id,
    attempts: row.attempts,
  }));
}

export async function getQueueSize(): Promise<number> {
  const db = getDb();
  const res = await db.execute('SELECT COUNT(*) as count FROM sync_queue');
  return res.rows[0]?.count ?? 0;
}

export async function removeFromQueue(queueRowId: number): Promise<void> {
  const db = getDb();
  await db.execute('DELETE FROM sync_queue WHERE queue_row_id = ?', [queueRowId]);
}

export async function incrementAttempts(queueRowId: number): Promise<void> {
  const db = getDb();
  await db.execute('UPDATE sync_queue SET attempts = attempts + 1 WHERE queue_row_id = ?', [queueRowId]);
}

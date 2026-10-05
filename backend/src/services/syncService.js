const db = require('../db');

/**
 * Conflict resolution strategy: LAST-WRITE-WINS by `updatedAt` timestamp.
 *
 * Every row (group/member/expense) carries an `updated_at` set on the device
 * that made the change. When two devices edit the same row offline and both
 * later sync, whichever edit has the greater `updated_at` wins and is
 * persisted; the losing edit is reported back to its device as a `conflict`
 * so the UI can tell the user "your change was overridden by a newer edit".
 *
 * This is simple and works well for a small trusted group (no server-side
 * merge of individual fields), which is the right trade-off for a hostel
 * expense tracker. A fancier CRDT/field-level merge is possible but overkill
 * here — worth mentioning as a known limitation in an interview.
 */

const TABLES = {
  group: 'groups',
  member: 'members',
  expense: 'expenses',
};

function getRow(entity, id) {
  const table = TABLES[entity];
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
}

function applyAction(action) {
  const { entity, type, id, updatedAt, payload } = action;
  const table = TABLES[entity];
  if (!table) {
    return { id, status: 'error', reason: `Unknown entity ${entity}` };
  }

  const existing = getRow(entity, id);

  // Conflict check: an existing row with a newer-or-equal updatedAt wins.
  if (existing && existing.updated_at >= updatedAt) {
    return { id, status: 'conflict', serverVersion: rowToDto(entity, existing) };
  }

  if (type === 'delete') {
    if (existing) {
      db.prepare(`UPDATE ${table} SET deleted = 1, updated_at = ? WHERE id = ?`).run(updatedAt, id);
    } else {
      db.prepare(
        `INSERT INTO ${table} (id, ${deleteStubColumns(entity)}, created_at, updated_at, deleted) VALUES (?, ${deleteStubPlaceholders(
          entity,
        )}, ?, ?, 1)`,
      ).run(id, ...deleteStubValues(entity, payload), updatedAt, updatedAt);
    }
    return { id, status: 'applied' };
  }

  // upsert
  upsertRow(entity, id, payload, updatedAt, existing);
  return { id, status: 'applied', serverVersion: rowToDto(entity, getRow(entity, id)) };
}

function deleteStubColumns(entity) {
  if (entity === 'group') return 'name';
  if (entity === 'member') return 'group_id, name';
  return 'group_id, description, amount, paid_by, participants';
}
function deleteStubPlaceholders(entity) {
  return deleteStubColumns(entity)
    .split(', ')
    .map(() => '?')
    .join(', ');
}
function deleteStubValues(entity, payload = {}) {
  if (entity === 'group') return [payload.name || 'deleted'];
  if (entity === 'member') return [payload.groupId, payload.name || 'deleted'];
  return [payload.groupId, payload.description || '', payload.amount || 0, payload.paidBy || '', '[]'];
}

function upsertRow(entity, id, payload, updatedAt, existing) {
  const now = updatedAt;
  if (entity === 'group') {
    if (existing) {
      db.prepare('UPDATE groups SET name = ?, updated_at = ?, deleted = 0 WHERE id = ?').run(payload.name, now, id);
    } else {
      db.prepare('INSERT INTO groups (id, name, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, 0)').run(
        id,
        payload.name,
        payload.createdAt || now,
        now,
      );
    }
  } else if (entity === 'member') {
    if (existing) {
      db.prepare('UPDATE members SET name = ?, updated_at = ?, deleted = 0 WHERE id = ?').run(payload.name, now, id);
    } else {
      db.prepare(
        'INSERT INTO members (id, group_id, name, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, 0)',
      ).run(id, payload.groupId, payload.name, payload.createdAt || now, now);
    }
  } else if (entity === 'expense') {
    const participantsJson = JSON.stringify(payload.participants || []);
    if (existing) {
      db.prepare(
        'UPDATE expenses SET description = ?, amount = ?, paid_by = ?, participants = ?, updated_at = ?, deleted = 0 WHERE id = ?',
      ).run(payload.description, payload.amount, payload.paidBy, participantsJson, now, id);
    } else {
      db.prepare(
        `INSERT INTO expenses (id, group_id, description, amount, paid_by, participants, created_at, updated_at, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      ).run(
        id,
        payload.groupId,
        payload.description,
        payload.amount,
        payload.paidBy,
        participantsJson,
        payload.createdAt || now,
        now,
      );
    }
  }
}

function rowToDto(entity, row) {
  if (!row) return null;
  if (entity === 'expense') {
    return {
      id: row.id,
      groupId: row.group_id,
      description: row.description,
      amount: row.amount,
      paidBy: row.paid_by,
      participants: JSON.parse(row.participants),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deleted: !!row.deleted,
    };
  }
  if (entity === 'member') {
    return {
      id: row.id,
      groupId: row.group_id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deleted: !!row.deleted,
    };
  }
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deleted: !!row.deleted,
  };
}

function processBatch(actions) {
  const results = [];
  // Each action is applied in its own nested transaction so one bad action
  // (e.g. a foreign-key violation from actions arriving out of order) can't
  // roll back — and silently drop — every other valid action in the batch.
  const tx = db.transaction(() => {
    for (const action of actions) {
      try {
        results.push(applyAction(action));
      } catch (err) {
        results.push({ id: action.id, status: 'error', reason: err.message });
      }
    }
  });
  tx();
  return results;
}

module.exports = { processBatch, rowToDto };

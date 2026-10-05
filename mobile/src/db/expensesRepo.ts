import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from './database';
import { enqueue } from './syncQueueRepo';
import type { Expense, ExpenseParticipant } from '../types';

function rowToExpense(row: any): Expense {
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

export interface NewExpenseInput {
  groupId: string;
  description: string;
  amount: number;
  paidBy: string;
  participants: ExpenseParticipant[];
}

export async function createExpense(input: NewExpenseInput): Promise<Expense> {
  const db = getDb();
  const now = Date.now();
  const id = uuidv4();
  const participantsJson = JSON.stringify(input.participants);

  await db.execute(
    `INSERT INTO expenses (id, group_id, description, amount, paid_by, participants, created_at, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [id, input.groupId, input.description, input.amount, input.paidBy, participantsJson, now, now],
  );

  await enqueue(id, 'expense', 'upsert', now, {
    groupId: input.groupId,
    description: input.description,
    amount: input.amount,
    paidBy: input.paidBy,
    participants: input.participants,
    createdAt: now,
  });

  return { id, ...input, createdAt: now, updatedAt: now };
}

export async function listExpenses(groupId: string): Promise<Expense[]> {
  const db = getDb();
  const res = await db.execute('SELECT * FROM expenses WHERE group_id = ? AND deleted = 0 ORDER BY created_at DESC', [
    groupId,
  ]);
  return res.rows.map(rowToExpense);
}

export async function deleteExpense(id: string, groupId: string): Promise<void> {
  const db = getDb();
  const now = Date.now();
  await db.execute('UPDATE expenses SET deleted = 1, updated_at = ? WHERE id = ?', [now, id]);
  await enqueue(id, 'expense', 'delete', now, { groupId });
}

export async function upsertExpenseFromServer(expense: Expense): Promise<void> {
  const db = getDb();
  const existingRes = await db.execute('SELECT updated_at FROM expenses WHERE id = ?', [expense.id]);
  const existing = existingRes.rows[0];
  if (existing && existing.updated_at >= expense.updatedAt) return;

  await db.execute(
    `INSERT INTO expenses (id, group_id, description, amount, paid_by, participants, created_at, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET description = excluded.description, amount = excluded.amount,
       paid_by = excluded.paid_by, participants = excluded.participants, updated_at = excluded.updated_at,
       deleted = excluded.deleted`,
    [
      expense.id,
      expense.groupId,
      expense.description,
      expense.amount,
      expense.paidBy,
      JSON.stringify(expense.participants),
      expense.createdAt,
      expense.updatedAt,
      expense.deleted ? 1 : 0,
    ],
  );
}

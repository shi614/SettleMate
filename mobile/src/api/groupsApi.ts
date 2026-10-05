import { apiClient } from './client';
import { upsertGroupFromServer } from '../db/groupsRepo';
import { upsertMemberFromServer } from '../db/membersRepo';
import { upsertExpenseFromServer } from '../db/expensesRepo';
import type { Expense, Group, Member } from '../types';

interface FullGroupDto extends Group {
  members: Member[];
  expenses: Expense[];
}

/** Pulls the server's full state for a group and merges it into local
 * SQLite (server rows only win if newer — see upsert*FromServer). Used for
 * "pull to refresh" so a second device's offline changes show up here too. */
export async function pullGroup(groupId: string): Promise<void> {
  const { data } = await apiClient.get<FullGroupDto>(`/groups/${groupId}`);

  await upsertGroupFromServer({ id: data.id, name: data.name, createdAt: data.createdAt, updatedAt: data.updatedAt });
  await Promise.all(data.members.map(upsertMemberFromServer));
  await Promise.all(data.expenses.map(upsertExpenseFromServer));
}

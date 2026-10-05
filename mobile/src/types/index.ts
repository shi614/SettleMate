export interface Group {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

export interface Member {
  id: string;
  groupId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

export interface ExpenseParticipant {
  memberId: string;
  share: number;
}

export interface Expense {
  id: string;
  groupId: string;
  description: string;
  amount: number;
  paidBy: string;
  participants: ExpenseParticipant[];
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

export type SyncEntity = 'group' | 'member' | 'expense';
export type SyncActionType = 'upsert' | 'delete';

export interface SyncAction {
  id: string;
  entity: SyncEntity;
  type: SyncActionType;
  updatedAt: number;
  payload: Record<string, unknown>;
  // local bookkeeping
  queueRowId?: number;
  attempts?: number;
}

export interface SettlementTransaction {
  from: string;
  to: string;
  amount: number;
}

export interface SettlementResult {
  balances: Record<string, number>;
  transactions: SettlementTransaction[];
}

export type RootStackParamList = {
  GroupList: undefined;
  GroupDetail: { groupId: string; groupName: string };
  AddExpense: { groupId: string };
  SettleUp: { groupId: string };
};

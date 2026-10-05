import type { Expense, Member, SettlementResult } from '../types';

/**
 * Same greedy max-heap settle-up strategy as the backend (see
 * backend/src/utils/settleUp.js for the full rationale). Duplicated here
 * — rather than imported from a shared package — so the app can compute
 * "who owes whom" fully offline, with zero network dependency, straight
 * from whatever is in local SQLite right now.
 */

interface HeapItem {
  memberId: string;
  amount: number;
}

class MaxHeap {
  private items: HeapItem[] = [];

  size(): number {
    return this.items.length;
  }

  push(item: HeapItem): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): HeapItem {
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].amount >= this.items[index].amount) break;
      [this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
      index = parent;
    }
  }

  private bubbleDown(index: number): void {
    const n = this.items.length;
    for (;;) {
      const left = 2 * index + 1;
      const right = 2 * index + 2;
      let largest = index;
      if (left < n && this.items[left].amount > this.items[largest].amount) largest = left;
      if (right < n && this.items[right].amount > this.items[largest].amount) largest = right;
      if (largest === index) break;
      [this.items[largest], this.items[index]] = [this.items[index], this.items[largest]];
      index = largest;
    }
  }
}

const EPSILON = 0.01;

export function computeSettlement(members: Member[], expenses: Expense[]): SettlementResult {
  const balances: Record<string, number> = {};
  for (const m of members) balances[m.id] = 0;

  for (const expense of expenses) {
    balances[expense.paidBy] = (balances[expense.paidBy] ?? 0) + expense.amount;
    for (const p of expense.participants) {
      balances[p.memberId] = (balances[p.memberId] ?? 0) - p.share;
    }
  }

  const creditors = new MaxHeap();
  const debtors = new MaxHeap();

  for (const [memberId, amount] of Object.entries(balances)) {
    if (amount > EPSILON) creditors.push({ memberId, amount });
    else if (amount < -EPSILON) debtors.push({ memberId, amount: -amount });
  }

  const transactions: SettlementResult['transactions'] = [];

  while (creditors.size() > 0 && debtors.size() > 0) {
    const creditor = creditors.pop();
    const debtor = debtors.pop();

    const settled = Math.min(creditor.amount, debtor.amount);
    transactions.push({
      from: debtor.memberId,
      to: creditor.memberId,
      amount: Math.round(settled * 100) / 100,
    });

    const creditorRemainder = creditor.amount - settled;
    const debtorRemainder = debtor.amount - settled;

    if (creditorRemainder > EPSILON) creditors.push({ memberId: creditor.memberId, amount: creditorRemainder });
    if (debtorRemainder > EPSILON) debtors.push({ memberId: debtor.memberId, amount: debtorRemainder });
  }

  return { balances, transactions };
}

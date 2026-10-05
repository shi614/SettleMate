/**
 * Settle-up algorithm — "who pays whom" with (close to) the minimum number
 * of transactions, computed with a greedy max-heap matching strategy.
 *
 * Why not brute force? Finding the ABSOLUTE minimum number of transactions
 * to settle a group of balances is the "Optimal Account Balancing" problem
 * (LeetCode 465) and is NP-hard in general (equivalent to partitioning the
 * balances into zero-sum subsets). For a hostel/trip group that's realistically
 * 2-30 people, exhaustive search is overkill. A greedy strategy that always
 * matches the biggest creditor with the biggest debtor runs in O(n log n) and
 * produces a transaction count that is optimal or near-optimal in practice,
 * while staying easy to reason about and fast for any group size.
 *
 * Two binary max-heaps (implemented from scratch below, not a library) drive
 * the greedy matching: one of people owed money, one of people who owe money.
 */

class MaxHeap {
  constructor() {
    this.items = [];
  }

  size() {
    return this.items.length;
  }

  peek() {
    return this.items[0];
  }

  push(item) {
    this.items.push(item);
    this._bubbleUp(this.items.length - 1);
  }

  pop() {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      this.items[0] = last;
      this._bubbleDown(0);
    }
    return top;
  }

  _bubbleUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].amount >= this.items[index].amount) break;
      [this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
      index = parent;
    }
  }

  _bubbleDown(index) {
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

const EPSILON = 0.01; // treat sub-paisa differences as settled

/**
 * @param {Array<{id: string, name: string}>} members
 * @param {Array<{paidBy: string, participants: Array<{memberId: string, share: number}>}>} expenses
 * @returns {{balances: Record<string, number>, transactions: Array<{from: string, to: string, amount: number}>}}
 */
function computeSettlement(members, expenses) {
  const balances = Object.fromEntries(members.map(m => [m.id, 0]));

  for (const expense of expenses) {
    balances[expense.paidBy] = (balances[expense.paidBy] || 0) + expense.amount;
    for (const p of expense.participants) {
      balances[p.memberId] = (balances[p.memberId] || 0) - p.share;
    }
  }

  const creditors = new MaxHeap(); // people who should RECEIVE money (balance > 0)
  const debtors = new MaxHeap(); // people who OWE money (stored as positive amount)

  for (const [memberId, amount] of Object.entries(balances)) {
    if (amount > EPSILON) creditors.push({ memberId, amount });
    else if (amount < -EPSILON) debtors.push({ memberId, amount: -amount });
  }

  const transactions = [];

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

module.exports = { computeSettlement, MaxHeap };

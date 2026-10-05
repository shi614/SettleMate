import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Expense, Member } from '../types';

export const EXPENSE_ROW_HEIGHT = 72;

interface Props {
  expense: Expense;
  payerName: string;
  participantCount: number;
  onPress?: (expense: Expense) => void;
}

/**
 * React.memo + a custom comparator keeps this row from re-rendering when
 * unrelated state changes (e.g. the sync banner's pending count ticking)
 * — only re-renders if the row's own data actually changed. Combined with
 * FlatList's getItemLayout (fixed EXPENSE_ROW_HEIGHT below) the list can
 * skip measuring every row and jump straight to offsets, which matters
 * once a trip has hundreds of expenses.
 */
function ExpenseListItemBase({ expense, payerName, participantCount }: Props) {
  const perHead = expense.amount / Math.max(participantCount, 1);

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text style={styles.description} numberOfLines={1}>
          {expense.description}
        </Text>
        <Text style={styles.meta}>
          {payerName} paid · split {participantCount} ways
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.amount}>₹{expense.amount.toFixed(2)}</Text>
        <Text style={styles.meta}>₹{perHead.toFixed(2)} / head</Text>
      </View>
    </View>
  );
}

function areEqual(prev: Props, next: Props) {
  return (
    prev.expense.id === next.expense.id &&
    prev.expense.updatedAt === next.expense.updatedAt &&
    prev.payerName === next.payerName &&
    prev.participantCount === next.participantCount
  );
}

export const ExpenseListItem = React.memo(ExpenseListItemBase, areEqual);

const styles = StyleSheet.create({
  row: {
    height: EXPENSE_ROW_HEIGHT,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  left: { flex: 1, marginRight: 12 },
  right: { alignItems: 'flex-end' },
  description: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  meta: { fontSize: 12, color: '#888', marginTop: 4 },
  amount: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
});

export function buildMemberNameLookup(members: Member[]): Record<string, string> {
  return Object.fromEntries(members.map(m => [m.id, m.name]));
}

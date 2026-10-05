import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import type { RootStackParamList, Expense } from '../types';
import { listMembers } from '../db/membersRepo';
import { listExpenses } from '../db/expensesRepo';
import { pullGroup } from '../api/groupsApi';
import { ExpenseListItem, EXPENSE_ROW_HEIGHT, buildMemberNameLookup } from '../components/ExpenseListItem';
import { SyncStatusBar } from '../components/SyncStatusBar';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupDetail'>;

export function GroupDetailScreen({ route, navigation }: Props) {
  const { groupId, groupName } = route.params;
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [nameLookup, setNameLookup] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    const [members, expenseList] = await Promise.all([listMembers(groupId), listExpenses(groupId)]);
    setNameLookup(buildMemberNameLookup(members));
    setExpenses(expenseList);
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const onPullToRefresh = async () => {
    setRefreshing(true);
    try {
      await pullGroup(groupId);
    } catch {
      // offline or server unreachable — local data still shown, nothing to do
    } finally {
      await refresh();
      setRefreshing(false);
    }
  };

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <SafeAreaView style={styles.container}>
      <SyncStatusBar />
      <View style={styles.summary}>
        <Text style={styles.groupName}>{groupName}</Text>
        <Text style={styles.total}>₹{total.toFixed(2)} total spent</Text>
      </View>

      <FlatList
        data={expenses}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullToRefresh} />}
        // FlatList perf: every row is a fixed height, so getItemLayout lets
        // the list compute scroll offsets without measuring each row — no
        // layout pass needed just to scroll to the bottom of a long list.
        getItemLayout={(_data, index) => ({ length: EXPENSE_ROW_HEIGHT, offset: EXPENSE_ROW_HEIGHT * index, index })}
        removeClippedSubviews
        maxToRenderPerBatch={12}
        windowSize={7}
        initialNumToRender={12}
        ListEmptyComponent={<Text style={styles.empty}>No expenses yet.</Text>}
        renderItem={({ item }) => (
          <ExpenseListItem
            expense={item}
            payerName={nameLookup[item.paidBy] ?? 'Unknown'}
            participantCount={item.participants.length}
          />
        )}
      />

      <View style={styles.actions}>
        <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('SettleUp', { groupId })}>
          <Text style={styles.secondaryButtonText}>Settle Up</Text>
        </Pressable>
        <Pressable style={styles.primaryButton} onPress={() => navigation.navigate('AddExpense', { groupId })}>
          <Text style={styles.primaryButtonText}>+ Add Expense</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  summary: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  groupName: { fontSize: 20, fontWeight: '700' },
  total: { fontSize: 13, color: '#666', marginTop: 2 },
  empty: { color: '#888', fontSize: 14, textAlign: 'center', marginTop: 40 },
  actions: { flexDirection: 'row', padding: 16, gap: 12, borderTopWidth: 1, borderTopColor: '#eee' },
  primaryButton: { flex: 1, backgroundColor: '#2563eb', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  primaryButtonText: { color: 'white', fontWeight: '700' },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#1e293b', fontWeight: '700' },
});

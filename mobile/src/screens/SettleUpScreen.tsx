import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, Member, SettlementResult } from '../types';
import { listMembers } from '../db/membersRepo';
import { listExpenses } from '../db/expensesRepo';
import { computeSettlement } from '../utils/settleUp';

type Props = NativeStackScreenProps<RootStackParamList, 'SettleUp'>;

export function SettleUpScreen({ route }: Props) {
  const { groupId } = route.params;
  const [members, setMembers] = useState<Member[]>([]);
  const [result, setResult] = useState<SettlementResult | null>(null);

  useEffect(() => {
    (async () => {
      const [memberList, expenseList] = await Promise.all([listMembers(groupId), listExpenses(groupId)]);
      setMembers(memberList);
      setResult(computeSettlement(memberList, expenseList));
    })();
  }, [groupId]);

  const nameOf = (id: string) => members.find(m => m.id === id)?.name ?? 'Unknown';

  if (!result) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.sectionTitle}>Balances</Text>
      <FlatList
        data={members}
        keyExtractor={m => m.id}
        renderItem={({ item }) => {
          const balance = result.balances[item.id] ?? 0;
          const isPositive = balance > 0.01;
          const isNegative = balance < -0.01;
          return (
            <View style={styles.balanceRow}>
              <Text style={styles.memberName}>{item.name}</Text>
              <Text style={[styles.balanceAmount, isPositive && styles.positive, isNegative && styles.negative]}>
                {isPositive ? `gets back ₹${balance.toFixed(2)}` : isNegative ? `owes ₹${Math.abs(balance).toFixed(2)}` : 'settled up'}
              </Text>
            </View>
          );
        }}
      />

      <Text style={styles.sectionTitle}>Minimum transactions to settle</Text>
      <FlatList
        data={result.transactions}
        keyExtractor={(_, i) => String(i)}
        ListEmptyComponent={<Text style={styles.empty}>Everyone is settled up 🎉</Text>}
        renderItem={({ item }) => (
          <View style={styles.txRow}>
            <Text style={styles.txText}>
              <Text style={styles.txName}>{nameOf(item.from)}</Text> pays{' '}
              <Text style={styles.txName}>{nameOf(item.to)}</Text>
            </Text>
            <Text style={styles.txAmount}>₹{item.amount.toFixed(2)}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#555', marginTop: 16, marginBottom: 8 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f1f1' },
  memberName: { fontSize: 15, fontWeight: '600' },
  balanceAmount: { fontSize: 14, color: '#666' },
  positive: { color: '#16a34a', fontWeight: '700' },
  negative: { color: '#dc2626', fontWeight: '700' },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  txText: { fontSize: 14, color: '#334155' },
  txName: { fontWeight: '700' },
  txAmount: { fontSize: 15, fontWeight: '700', color: '#2563eb' },
  empty: { color: '#888', textAlign: 'center', marginTop: 20 },
});

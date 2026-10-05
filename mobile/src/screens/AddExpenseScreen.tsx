import React, { useEffect, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, Member } from '../types';
import { listMembers } from '../db/membersRepo';
import { createExpense } from '../db/expensesRepo';
import { syncEngine } from '../sync/syncEngine';

type Props = NativeStackScreenProps<RootStackParamList, 'AddExpense'>;

export function AddExpenseScreen({ route, navigation }: Props) {
  const { groupId } = route.params;
  const [members, setMembers] = useState<Member[]>([]);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    listMembers(groupId).then(list => {
      setMembers(list);
      setPaidBy(list[0]?.id ?? null);
      setSelected(new Set(list.map(m => m.id)));
    });
  }, [groupId]);

  const toggleParticipant = (memberId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const onSave = async () => {
    const parsedAmount = parseFloat(amount);
    if (!description.trim() || !paidBy || !parsedAmount || parsedAmount <= 0 || selected.size === 0) {
      Alert.alert('Missing info', 'Fill in description, amount, payer, and at least one participant.');
      return;
    }

    const participantIds = Array.from(selected);
    const share = Math.round((parsedAmount / participantIds.length) * 100) / 100;
    const participants = participantIds.map(memberId => ({ memberId, share }));

    await createExpense({ groupId, description: description.trim(), amount: parsedAmount, paidBy, participants });
    syncEngine.notifyLocalMutation();
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Description</Text>
        <TextInput style={styles.input} placeholder="e.g. Hotel, Dinner" value={description} onChangeText={setDescription} />

        <Text style={styles.label}>Amount (₹)</Text>
        <TextInput style={styles.input} placeholder="0.00" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />

        <Text style={styles.label}>Paid by</Text>
        <View style={styles.chipRow}>
          {members.map(m => (
            <Pressable
              key={m.id}
              style={[styles.chip, paidBy === m.id && styles.chipActive]}
              onPress={() => setPaidBy(m.id)}
            >
              <Text style={[styles.chipText, paidBy === m.id && styles.chipTextActive]}>{m.name}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Split equally among</Text>
        <View style={styles.chipRow}>
          {members.map(m => (
            <Pressable
              key={m.id}
              style={[styles.chip, selected.has(m.id) && styles.chipActive]}
              onPress={() => toggleParticipant(m.id)}
            >
              <Text style={[styles.chipText, selected.has(m.id) && styles.chipTextActive]}>{m.name}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.saveButton} onPress={onSave}>
          <Text style={styles.saveButtonText}>Save Expense</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginTop: 16, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f1f5f9' },
  chipActive: { backgroundColor: '#2563eb' },
  chipText: { color: '#1e293b', fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: 'white' },
  saveButton: { marginTop: 32, backgroundColor: '#16a34a', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  saveButtonText: { color: 'white', fontWeight: '700', fontSize: 16 },
});

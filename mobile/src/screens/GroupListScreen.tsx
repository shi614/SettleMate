import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import type { RootStackParamList } from '../types';
import { createGroup, listGroups } from '../db/groupsRepo';
import { addMember } from '../db/membersRepo';
import { syncEngine } from '../sync/syncEngine';
import { SyncStatusBar } from '../components/SyncStatusBar';
import type { Group } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupList'>;

export function GroupListScreen({ navigation }: Props) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [membersText, setMembersText] = useState('');

  const refresh = useCallback(async () => {
    setGroups(await listGroups());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const onCreate = async () => {
    if (!name.trim()) return;
    const group = await createGroup(name.trim());
    const memberNames = membersText
      .split(',')
      .map(n => n.trim())
      .filter(Boolean);
    await Promise.all(memberNames.map(memberName => addMember(group.id, memberName)));

    syncEngine.notifyLocalMutation();
    setName('');
    setMembersText('');
    setModalVisible(false);
    refresh();
  };

  return (
    <SafeAreaView style={styles.container}>
      <SyncStatusBar />
      <View style={styles.header}>
        <Text style={styles.title}>Your Groups</Text>
        <Pressable style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Text style={styles.addButtonText}>+ New Group</Text>
        </Pressable>
      </View>

      <FlatList
        data={groups}
        keyExtractor={item => item.id}
        contentContainerStyle={groups.length === 0 && styles.emptyContainer}
        ListEmptyComponent={<Text style={styles.empty}>No groups yet — create one to get started.</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={styles.groupRow}
            onPress={() => navigation.navigate('GroupDetail', { groupId: item.id, groupName: item.name })}
          >
            <Text style={styles.groupName}>{item.name}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
      />

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Group</Text>
            <TextInput
              style={styles.input}
              placeholder="Group name (e.g. Goa Trip)"
              value={name}
              onChangeText={setName}
            />
            <TextInput
              style={styles.input}
              placeholder="Members, comma separated (e.g. Ishaan, Rahul, Priya)"
              value={membersText}
              onChangeText={setMembersText}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelButton} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.createButton} onPress={onCreate}>
                <Text style={styles.createText}>Create</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 22, fontWeight: '700' },
  addButton: { backgroundColor: '#2563eb', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  addButtonText: { color: 'white', fontWeight: '600' },
  groupRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  groupName: { fontSize: 17, fontWeight: '600' },
  chevron: { fontSize: 20, color: '#aaa' },
  emptyContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { color: '#888', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: 'white', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 15,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  cancelButton: { paddingHorizontal: 16, paddingVertical: 10 },
  cancelText: { color: '#666', fontWeight: '600' },
  createButton: { backgroundColor: '#2563eb', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  createText: { color: 'white', fontWeight: '600' },
});

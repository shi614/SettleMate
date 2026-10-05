import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { syncEngine, type SyncState } from '../sync/syncEngine';

export function SyncStatusBar() {
  const [state, setState] = useState<SyncState>({
    isOnline: true,
    pendingCount: 0,
    isSyncing: false,
    lastSyncedAt: null,
    lastConflictCount: 0,
  });

  useEffect(() => syncEngine.subscribe(setState), []);

  if (state.isOnline && state.pendingCount === 0) return null;

  const label = !state.isOnline
    ? `Offline — ${state.pendingCount} change${state.pendingCount === 1 ? '' : 's'} waiting to sync`
    : state.isSyncing
      ? 'Syncing…'
      : `${state.pendingCount} change${state.pendingCount === 1 ? '' : 's'} queued`;

  return (
    <View style={[styles.bar, !state.isOnline ? styles.offline : styles.syncing]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingVertical: 6, alignItems: 'center' },
  offline: { backgroundColor: '#b45309' },
  syncing: { backgroundColor: '#2563eb' },
  text: { color: 'white', fontSize: 12, fontWeight: '600' },
});

import NetInfo from '@react-native-community/netinfo';
import { apiClient } from '../api/client';
import { getPendingActions, getQueueSize, removeFromQueue, incrementAttempts } from '../db/syncQueueRepo';
import { upsertGroupFromServer } from '../db/groupsRepo';
import { upsertMemberFromServer } from '../db/membersRepo';
import { upsertExpenseFromServer } from '../db/expensesRepo';
import type { SyncAction } from '../types';

/**
 * Drains the local outbox (sync_queue) to the backend whenever the device
 * is online, and reconciles any last-write-wins conflicts the server
 * reports by overwriting the local row with the server's winning version.
 *
 * Flow:
 *  1. NetInfo tells us connectivity changed (or we're polling after a
 *     mutation) -> if online and queue non-empty, flush.
 *  2. Pending actions are POSTed in one batch to /api/sync.
 *  3. Each result is either "applied" (drop from queue) or "conflict"
 *     (drop from queue too, since retrying a lost conflict would just
 *     lose again — but we overwrite local state with the server's version
 *     so the UI reflects reality) or a transient failure (left in queue,
 *     attempts++, retried next flush).
 */

type Listener = (state: SyncState) => void;

export interface SyncState {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  lastSyncedAt: number | null;
  lastConflictCount: number;
}

class SyncEngine {
  private state: SyncState = {
    isOnline: true,
    pendingCount: 0,
    isSyncing: false,
    lastSyncedAt: null,
    lastConflictCount: 0,
  };

  private listeners = new Set<Listener>();
  private started = false;

  start() {
    if (this.started) return;
    this.started = true;

    this.refreshPendingCount();

    NetInfo.addEventListener(netState => {
      const isOnline = Boolean(netState.isConnected && netState.isInternetReachable !== false);
      this.setState({ isOnline });
      if (isOnline) this.flush();
    });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  /** Call after every local write so the UI's pending-count updates immediately,
   * and we opportunistically try to flush right away if we're online. */
  notifyLocalMutation() {
    this.refreshPendingCount();
    if (this.state.isOnline) this.flush();
  }

  private async refreshPendingCount() {
    const pendingCount = await getQueueSize();
    this.setState({ pendingCount });
  }

  private setState(partial: Partial<SyncState>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach(l => l(this.state));
  }

  async flush(): Promise<void> {
    if (this.state.isSyncing) return;
    const pending = await getPendingActions(50);
    if (pending.length === 0) return;

    this.setState({ isSyncing: true });

    try {
      const actions = pending.map(dehydrate);
      const { data } = await apiClient.post<{ results: Array<{ id: string; status: string; serverVersion?: any }> }>(
        '/sync',
        { actions },
      );

      let conflictCount = 0;

      for (const result of data.results) {
        const action = pending.find(a => a.id === result.id);
        if (!action?.queueRowId) continue;

        if (result.status === 'applied' || result.status === 'conflict') {
          if (result.status === 'conflict') {
            conflictCount += 1;
            await reconcileConflict(action.entity, result.serverVersion);
          }
          await removeFromQueue(action.queueRowId);
        } else {
          await incrementAttempts(action.queueRowId);
        }
      }

      this.setState({ lastSyncedAt: Date.now(), lastConflictCount: conflictCount });
      await this.refreshPendingCount();

      // More queued than this batch covered — keep draining.
      const remaining = await getQueueSize();
      if (remaining > 0) {
        this.setState({ isSyncing: false });
        this.flush();
        return;
      }
    } catch (err) {
      // Network blip or server down — leave queue intact, NetInfo / next
      // mutation will trigger a retry.
      console.warn('[sync] flush failed, will retry', err);
    } finally {
      this.setState({ isSyncing: false });
    }
  }
}

function dehydrate(action: SyncAction) {
  return {
    id: action.id,
    entity: action.entity,
    type: action.type,
    updatedAt: action.updatedAt,
    payload: action.payload,
  };
}

async function reconcileConflict(entity: SyncAction['entity'], serverVersion: any): Promise<void> {
  if (!serverVersion) return;
  if (entity === 'group') await upsertGroupFromServer(serverVersion);
  else if (entity === 'member') await upsertMemberFromServer(serverVersion);
  else if (entity === 'expense') await upsertExpenseFromServer(serverVersion);
}

export const syncEngine = new SyncEngine();

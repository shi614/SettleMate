# SettleMate — Offline-first Expense Splitter

A hostel/trip expense tracker that works **fully offline** and syncs to a server the moment connectivity returns. Built as a portfolio/interview project to demonstrate local-first mobile architecture, conflict resolution, FlatList performance, and a greedy/heap algorithm (the "settle-up" problem).

```
┌─────────────────────────┐          ┌───────────────────────────┐
│   React Native (CLI)    │          │     Node.js + Express      │
│                         │  HTTP    │                            │
│  UI  ──────────────┐    │  (sync)  │  /api/groups               │
│       │            │    │ ───────> │  /api/sync                │
│  SQLite (op-sqlite) │    │          │  /api/groups/:id/settle   │
│   - groups           │   │ <─────── │                            │
│   - members           │  │          │  SQLite (better-sqlite3)  │
│   - expenses           │ │          │   - groups/members/expenses│
│   - sync_queue (outbox) │ │          │   (source of truth)        │
│                         │ │          └───────────────────────────┘
│  NetInfo listener ──────┘ │
│  (triggers queue flush)   │
└─────────────────────────┘
```

Every screen reads and writes **local SQLite only**. A mutation is written to the local tables *and* appended to a `sync_queue` "outbox" table in the same operation. A `SyncEngine` watches connectivity via `NetInfo` and, whenever online, drains the outbox to the backend in a single batched `POST /api/sync` call. The UI never blocks on the network.

## Why this stack (talking points for an interview)

**Local storage — SQLite over AsyncStorage** ([mobile/src/db](mobile/src/db))
AsyncStorage is a flat key-value store: modeling relations ("all expenses for group X", "all members of group X") means loading and JSON-parsing a growing blob on every screen, with no indexes. It also has known write-latency and storage-size cliffs on Android. SQLite (via [`@op-engineering/op-sqlite`](https://github.com/OP-Engineering/op-sqlite), a JSI binding — no bridge serialization, works with the New Architecture) gives real indexed queries and a proper relational schema, and gives us a durable, queryable table to use as the sync outbox instead of hand-rolling an array-in-AsyncStorage queue.

**Connectivity + sync queue** ([mobile/src/sync/syncEngine.ts](mobile/src/sync/syncEngine.ts))
Every local write (`createGroup`, `addMember`, `createExpense`, ...) inserts a row into `sync_queue` describing the mutation (entity, action type, payload, client timestamp). `@react-native-community/netinfo` notifies the app of connectivity changes; the `SyncEngine` singleton drains the queue FIFO, batching all pending actions into one `POST /api/sync` request, and retries automatically on the next connectivity event or mutation if the request fails.

**Conflict handling — last-write-wins by timestamp** ([backend/src/services/syncService.js](backend/src/services/syncService.js))
Every row carries `updatedAt`, set on the device that made the edit. If two phones edit the same expense offline, whichever `updatedAt` is newer wins when both eventually sync; the server tells the losing device it hit a `conflict` and returns the winning row, which the device immediately writes into its own local SQLite so the UI reflects reality. This is a deliberate, named trade-off — a CRDT or field-level merge would resolve conflicts more gracefully, but LWW is simple, predictable, and is the right fit for a small trusted group splitting a hotel bill.

**FlatList optimization** ([mobile/src/screens/GroupDetailScreen.tsx](mobile/src/screens/GroupDetailScreen.tsx), [mobile/src/components/ExpenseListItem.tsx](mobile/src/components/ExpenseListItem.tsx))
- `keyExtractor` returns the stable expense id (never array index).
- `getItemLayout` with a **fixed row height** lets FlatList compute scroll offsets without a measurement pass — important once a trip has hundreds of expenses.
- `ExpenseListItem` is wrapped in `React.memo` with a custom comparator, so a row only re-renders when its own `updatedAt` changes — not when the sync banner's pending count ticks or another row updates.
- `removeClippedSubviews`, `maxToRenderPerBatch`, `windowSize` tuned for a typical expense list.

**Settle-up algorithm — greedy + max-heap** ([backend/src/utils/settleUp.js](backend/src/utils/settleUp.js), mirrored in [mobile/src/utils/settleUp.ts](mobile/src/utils/settleUp.ts) so it also works fully offline)
Finding the *absolute* minimum number of transactions to settle a group of balances is "Optimal Account Balancing" (LeetCode 465) — NP-hard in general. Instead, two binary max-heaps (hand-written, not a library — one of creditors, one of debtors) are used to always match the person owed the most against the person who owes the most, settle the smaller of the two amounts, and repeat. This runs in **O(n log n)**, is trivial to reason about, and is optimal or near-optimal for realistic group sizes (2–30 people). The README calls out the NP-hard trade-off explicitly — a good thing to mention if asked "is this really minimal?" in an interview.

## Project layout

```
backend/                Node + Express sync server (source of truth)
  src/db/                SQLite schema (better-sqlite3)
  src/routes/            groups.js (CRUD + settle), sync.js (batch sync)
  src/services/          syncService.js — LWW conflict resolution
  src/utils/settleUp.js  greedy/heap settle-up algorithm

mobile/                 React Native CLI app (TypeScript)
  src/db/                 op-sqlite schema + repositories (groups/members/expenses/sync_queue)
  src/sync/syncEngine.ts  NetInfo-driven outbox flush + conflict reconciliation
  src/api/                axios client + server pull (GET /api/groups/:id)
  src/utils/settleUp.ts   same greedy/heap algorithm, runs offline
  src/screens/            GroupList, GroupDetail, AddExpense, SettleUp
  src/components/         ExpenseListItem (memoized), SyncStatusBar
```

## Running it

### Backend

```bash
cd backend
npm install
npm start          # listens on http://localhost:4000
```

`GET /health`, `POST /api/groups`, `GET /api/groups/:id`, `GET /api/groups/:id/settle`, `POST /api/sync`.

### Mobile (Android)

```bash
cd mobile
npm install
npx react-native run-android   # needs an emulator running or a device connected
```

The app talks to `http://10.0.2.2:4000` by default — the Android emulator's alias for your machine's `localhost`. On a **physical device**, edit [mobile/src/api/client.ts](mobile/src/api/client.ts) and point `DEV_HOST` at your machine's LAN IP instead (and make sure the phone is on the same Wi-Fi as the backend).

### Demoing the offline-first behavior

1. Start the backend, run the app, create a group and add an expense — it saves instantly (local SQLite), and the sync banner briefly shows "queued" then disappears once it's pushed.
2. Turn on **Airplane Mode** on the emulator/device, add a few more expenses — the app works identically, the sync banner shows "Offline — N changes waiting to sync".
3. Turn connectivity back on — `NetInfo` fires, the queue drains automatically, the banner clears.
4. To see a conflict: edit the same expense from two "devices" (e.g. two emulators, or curl directly against `/api/sync` with an older `updatedAt`) — the losing edit gets overwritten locally with the server's winning version.

## Known trade-offs (worth saying out loud in an interview)

- **LWW, not CRDT**: a genuinely concurrent edit to two different fields of the same expense will still lose the whole row, not merge field-by-field. Fine for a small trusted group; not fine at larger scale.
- **Greedy settle-up isn't provably minimal**: see the NP-hard note above. A brute-force/backtracking exact solver would only be worth it for very small groups, as a trade-off discussion.
- **No auth**: group IDs are UUIDs, not protected by login. Adding auth is the natural "what would you add next" answer.

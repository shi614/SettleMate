import { open, type DB } from '@op-engineering/op-sqlite';

/**
 * Local-first storage layer.
 *
 * We use SQLite (via op-sqlite, a JSI binding) instead of AsyncStorage because:
 *  - AsyncStorage is a flat key-value store. Modeling groups/members/expenses
 *    with relations and queries ("all expenses for group X") means either
 *    loading + JSON-parsing a huge blob on every read, or hand-rolling an
 *    index — SQLite gives us real indexed queries for free.
 *  - AsyncStorage writes are batched/async and have historically had size
 *    and performance cliffs on Android once you store more than a few MB.
 *  - We need a durable, queryable "outbox" (the sync_queue table below) that
 *    survives app restarts while offline; a relational table with a WHERE
 *    clause is the natural fit, not an array we re-serialize every mutation.
 *
 * op-sqlite's execute() is async (it hops to a native thread over JSI), so
 * every call in this layer is awaited — nothing here is actually blocking
 * the JS thread.
 */

let dbInstance: DB | null = null;
let initPromise: Promise<void> | null = null;

export function getDb(): DB {
  if (!dbInstance) {
    dbInstance = open({ name: 'expense_splitter.sqlite' });
  }
  return dbInstance;
}

export function initDatabase(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const db = getDb();

    await db.execute(`
      CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        paid_by TEXT NOT NULL,
        participants TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0
      );
    `);

    // The offline outbox: every local mutation is appended here first, and
    // drained in FIFO order once NetInfo reports connectivity.
    await db.execute(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        queue_row_id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_id TEXT NOT NULL,
        entity TEXT NOT NULL,
        action_type TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        payload TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
    `);

    await db.execute('CREATE INDEX IF NOT EXISTS idx_members_group ON members(group_id);');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_expenses_group ON expenses(group_id);');
  })();

  return initPromise;
}

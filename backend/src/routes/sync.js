const express = require('express');
const { processBatch } = require('../services/syncService');

const router = express.Router();

/**
 * POST /api/sync
 * Body: { actions: Array<{ id, entity: 'group'|'member'|'expense', type: 'upsert'|'delete', updatedAt, payload }> }
 *
 * The mobile app queues every offline mutation as one of these actions and
 * flushes the whole queue here as soon as connectivity returns. The server
 * applies them inside a single transaction and reports, per action, whether
 * it was applied or lost to a newer conflicting edit (last-write-wins).
 */
router.post('/', (req, res) => {
  const { actions } = req.body;
  if (!Array.isArray(actions)) {
    return res.status(400).json({ error: 'actions must be an array' });
  }

  const results = processBatch(actions);
  res.json({ results });
});

module.exports = router;

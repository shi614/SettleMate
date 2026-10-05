const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { computeSettlement } = require('../utils/settleUp');

const router = express.Router();

// Create a group (members optional at creation time)
router.post('/', (req, res) => {
  const { name, members = [] } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const now = Date.now();
  const groupId = uuid();

  const insertGroup = db.prepare('INSERT INTO groups (id, name, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, 0)');
  const insertMember = db.prepare(
    'INSERT INTO members (id, group_id, name, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, 0)',
  );

  const tx = db.transaction(() => {
    insertGroup.run(groupId, name, now, now);
    for (const memberName of members) {
      insertMember.run(uuid(), groupId, memberName, now, now);
    }
  });
  tx();

  res.status(201).json(getFullGroup(groupId));
});

router.get('/', (_req, res) => {
  const groups = db.prepare('SELECT * FROM groups WHERE deleted = 0 ORDER BY created_at DESC').all();
  res.json(groups.map(g => ({ id: g.id, name: g.name, createdAt: g.created_at, updatedAt: g.updated_at })));
});

router.get('/:id', (req, res) => {
  const group = getFullGroup(req.params.id);
  if (!group) return res.status(404).json({ error: 'not found' });
  res.json(group);
});

router.get('/:id/settle', (req, res) => {
  const group = getFullGroup(req.params.id);
  if (!group) return res.status(404).json({ error: 'not found' });

  const expenses = group.expenses.map(e => ({ paidBy: e.paidBy, amount: e.amount, participants: e.participants }));
  const result = computeSettlement(group.members, expenses);
  res.json(result);
});

function getFullGroup(groupId) {
  const group = db.prepare('SELECT * FROM groups WHERE id = ? AND deleted = 0').get(groupId);
  if (!group) return null;

  const members = db
    .prepare('SELECT * FROM members WHERE group_id = ? AND deleted = 0 ORDER BY created_at ASC')
    .all(groupId)
    .map(m => ({ id: m.id, groupId: m.group_id, name: m.name, createdAt: m.created_at, updatedAt: m.updated_at }));

  const expenses = db
    .prepare('SELECT * FROM expenses WHERE group_id = ? AND deleted = 0 ORDER BY created_at DESC')
    .all(groupId)
    .map(e => ({
      id: e.id,
      groupId: e.group_id,
      description: e.description,
      amount: e.amount,
      paidBy: e.paid_by,
      participants: JSON.parse(e.participants),
      createdAt: e.created_at,
      updatedAt: e.updated_at,
    }));

  return {
    id: group.id,
    name: group.name,
    createdAt: group.created_at,
    updatedAt: group.updated_at,
    members,
    expenses,
  };
}

module.exports = router;

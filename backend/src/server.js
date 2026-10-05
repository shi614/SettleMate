const express = require('express');
const cors = require('cors');

require('./db'); // initialize schema on boot

const groupsRouter = require('./routes/groups');
const syncRouter = require('./routes/sync');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true, time: Date.now() }));

app.use('/api/groups', groupsRouter);
app.use('/api/sync', syncRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Expense Splitter backend listening on http://localhost:${PORT}`);
});

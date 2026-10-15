import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getDb, load, save, flush, findPortfolio, findBot, createPortfolio } from './store.js';
import { getQuote, getQuotes, getHistory, search, normalizeSymbol, HISTORY_PRESETS } from './marketData.js';
import {
  placeOrder,
  cancelOrder,
  evaluatePendingOrders,
  valuePortfolio,
  snapshotEquity,
  openOrderSymbols,
  heldSymbols,
  events,
} from './broker.js';
import { listStrategies, resolveParams, STRATEGIES } from './strategies.js';
import { runBacktest } from './backtest.js';
import { createBot, tickAllBots, BOT_INTERVALS, logBot } from './botRunner.js';

const PORT = Number(process.env.PORT) || 3001;
const QUOTE_TICK_MS = 10_000;
const BOT_TICK_MS = 30_000;
const EQUITY_SNAPSHOT_MS = 5 * 60_000;

load();
const app = express();
app.use(express.json());

// Wrap async handlers so thrown errors reach the error middleware.
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---- Market data -----------------------------------------------------------

app.get('/api/search', h(async (req, res) => res.json(await search(req.query.q))));

app.get('/api/quote/:symbol', h(async (req, res) => res.json(await getQuote(req.params.symbol))));

app.get('/api/quotes', h(async (req, res) => {
  const symbols = String(req.query.symbols ?? '').split(',').filter(Boolean);
  res.json(await getQuotes(symbols));
}));

app.get('/api/history/:symbol', h(async (req, res) => {
  const preset = HISTORY_PRESETS[req.query.preset];
  const range = preset?.range ?? req.query.range ?? '1y';
  const interval = preset?.interval ?? req.query.interval ?? '1d';
  res.json(await getHistory(req.params.symbol, range, interval));
}));

// ---- Watchlist -------------------------------------------------------------

app.get('/api/watchlist', (req, res) => res.json(getDb().watchlist));

app.put('/api/watchlist', h(async (req, res) => {
  if (!Array.isArray(req.body)) throw Object.assign(new Error('Expected an array of symbols'), { status: 400 });
  getDb().watchlist = [...new Set(req.body.map(normalizeSymbol))].slice(0, 50);
  save();
  res.json(getDb().watchlist);
}));

// ---- Portfolios & orders ---------------------------------------------------

app.get('/api/portfolios', h(async (req, res) => {
  res.json(await Promise.all(getDb().portfolios.map(valuePortfolio)));
}));

app.post('/api/portfolios', (req, res) => {
  const name = String(req.body.name ?? '').trim();
  const startingCash = Number(req.body.startingCash ?? 100_000);
  const commission = Number(req.body.commission ?? 0);
  if (!name) throw Object.assign(new Error('Name is required'), { status: 400 });
  if (!(startingCash >= 100 && startingCash <= 1e9)) {
    throw Object.assign(new Error('Starting cash must be between $100 and $1,000,000,000'), { status: 400 });
  }
  if (!(commission >= 0)) throw Object.assign(new Error('Commission cannot be negative'), { status: 400 });
  const p = createPortfolio({ name, startingCash, commission });
  p.equityHistory.push({ time: Math.floor(Date.now() / 1000), value: startingCash });
  getDb().portfolios.push(p);
  save();
  res.status(201).json({ id: p.id });
});

app.get('/api/portfolios/:id', h(async (req, res) => {
  const p = findPortfolio(req.params.id);
  res.json({
    ...(await valuePortfolio(p)),
    orders: p.orders.slice(0, 100),
    transactions: p.transactions.slice(0, 200),
    equityHistory: p.equityHistory,
  });
}));

app.delete('/api/portfolios/:id', (req, res) => {
  const db = getDb();
  findPortfolio(req.params.id);
  if (db.portfolios.length === 1) throw Object.assign(new Error('Cannot delete your only portfolio'), { status: 400 });
  db.portfolios = db.portfolios.filter((p) => p.id !== req.params.id);
  db.bots = db.bots.filter((b) => b.portfolioId !== req.params.id);
  save();
  res.status(204).end();
});

app.post('/api/portfolios/:id/reset', (req, res) => {
  const p = findPortfolio(req.params.id);
  const fresh = createPortfolio({ name: p.name, startingCash: p.startingCash, commission: p.commission });
  Object.assign(p, { ...fresh, id: p.id, createdAt: Date.now() });
  p.equityHistory.push({ time: Math.floor(Date.now() / 1000), value: p.startingCash });
  for (const bot of getDb().bots.filter((b) => b.portfolioId === p.id)) {
    bot.state = { qty: 0, avgCost: 0, strategy: {} };
    logBot(bot, 'Portfolio was reset; bot position cleared');
  }
  save();
  events.emit('portfolio', p.id);
  res.json({ ok: true });
});

app.post('/api/portfolios/:id/orders', h(async (req, res) => {
  res.status(201).json(await placeOrder(req.params.id, req.body));
}));

app.delete('/api/portfolios/:id/orders/:orderId', (req, res) => {
  res.json(cancelOrder(req.params.id, req.params.orderId));
});

// ---- Strategies, bots & backtests -----------------------------------------

app.get('/api/strategies', (req, res) => {
  res.json({ strategies: listStrategies(), botIntervals: Object.keys(BOT_INTERVALS) });
});

app.get('/api/bots', (req, res) => {
  res.json(getDb().bots.map(({ log, ...b }) => ({ ...b, log: log.slice(0, 50) })));
});

app.post('/api/bots', h(async (req, res) => {
  const { name, portfolioId, strategy, interval } = req.body;
  const symbol = normalizeSymbol(req.body.symbol);
  const params = resolveParams(strategy, req.body.params);
  await getQuote(symbol); // validate symbol
  const bot = createBot({ name, portfolioId, strategy, symbol, interval, params });
  res.status(201).json(bot);
}));

app.patch('/api/bots/:id', (req, res) => {
  const bot = findBot(req.params.id);
  if (typeof req.body.active === 'boolean' && req.body.active !== bot.active) {
    bot.active = req.body.active;
    bot.status = bot.active ? 'Starting' : 'Paused';
    logBot(bot, bot.active ? 'Bot resumed' : 'Bot paused');
  }
  save();
  res.json(bot);
});

app.delete('/api/bots/:id', (req, res) => {
  findBot(req.params.id);
  getDb().bots = getDb().bots.filter((b) => b.id !== req.params.id);
  save();
  res.status(204).end();
});

const BACKTEST_INTERVALS = { '1h': ['6mo', '1y', '2y'], '1d': ['6mo', '1y', '2y', '5y', '10y'], '1wk': ['2y', '5y', '10y', 'max'] };

app.post('/api/backtest', h(async (req, res) => {
  const { strategy, range = '2y', interval = '1d' } = req.body;
  if (!BACKTEST_INTERVALS[interval]?.includes(range)) {
    throw Object.assign(new Error(`Range ${range} is not available for ${interval} bars`), { status: 400 });
  }
  const symbol = normalizeSymbol(req.body.symbol);
  const params = resolveParams(strategy, req.body.params);
  const startingCash = Number(req.body.startingCash ?? 10_000);
  const commission = Number(req.body.commission ?? 0);
  const { candles } = await getHistory(symbol, range, interval);
  const result = runBacktest({ candles, strategyId: strategy, params, startingCash, commission, interval });
  res.json({ symbol, strategy: STRATEGIES[strategy].name, range, interval, params, candles, ...result });
}));

app.get('/api/backtest/options', (req, res) => res.json(BACKTEST_INTERVALS));

// ---- Live stream (Server-Sent Events) -------------------------------------

const clients = new Set(); // { res, symbols:Set }

app.get('/api/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const client = { res, symbols: new Set() };
  try {
    String(req.query.symbols ?? '').split(',').filter(Boolean).forEach((s) => client.symbols.add(normalizeSymbol(s)));
  } catch {
    // ignore bad symbols in the subscription
  }
  clients.add(client);
  res.write('retry: 3000\n\n');
  pushQuotes([client]);
  req.on('close', () => clients.delete(client));
});

function send(client, event, data) {
  client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function pushQuotes(targets = clients) {
  const wanted = new Set();
  for (const c of targets) c.symbols.forEach((s) => wanted.add(s));
  if (!wanted.size) return;
  const quotes = await getQuotes([...wanted]);
  for (const c of targets) {
    const subset = {};
    for (const s of c.symbols) if (quotes[s]) subset[s] = quotes[s];
    send(c, 'quotes', subset);
  }
}

events.on('portfolio', (id) => clients.forEach((c) => send(c, 'portfolio', { id })));
events.on('bot', (id) => clients.forEach((c) => send(c, 'bot', { id })));

// ---- Background loops ------------------------------------------------------

async function quoteTick() {
  try {
    const symbols = new Set([...openOrderSymbols()]);
    if (symbols.size) await evaluatePendingOrders(await getQuotes([...symbols]));
    await pushQuotes();
    for (const c of clients) c.res.write(': ping\n\n');
  } catch (err) {
    console.warn('Quote tick failed:', err.message);
  }
}

setInterval(quoteTick, QUOTE_TICK_MS);
setInterval(() => tickAllBots().catch((err) => console.warn('Bot tick failed:', err.message)), BOT_TICK_MS);
setInterval(() => {
  if (heldSymbols().size || getDb().portfolios.some((p) => !p.equityHistory.length)) snapshotEquity();
}, EQUITY_SNAPSHOT_MS);
setTimeout(() => tickAllBots().catch(() => {}), 2000);

// ---- Static client (production) & errors -----------------------------------

const clientDist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message ?? 'Internal error' });
});

const server = app.listen(PORT, () => console.log(`Stock simulator API listening on http://localhost:${PORT}`));

function shutdown() {
  flush();
  server.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

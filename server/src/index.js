import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getDb, load, save, flush, findPortfolio, findBot, createPortfolio } from './store.js';
import { getQuote, getQuotes, getHistory, getScreener, search, normalizeSymbol, HISTORY_PRESETS, SCREENERS } from './marketData.js';
import {
  placeOrder,
  cancelOrder,
  evaluatePendingOrders,
  valuePortfolio,
  snapshotEquity,
  openOrderSymbols,
  heldSymbols,
  checkMarginCalls,
  events,
} from './broker.js';
import { runBacktest } from './backtest.js';
import { createBot, updateBot, tickAllBots, scanBot, logBot, emptyBotState, migrateLegacyBots, mapLimit } from './botRunner.js';
import { metricCatalog, OPERATORS } from './rules/metrics.js';
import { validateBotConfig, ACTIONS, SIZINGS, UNIVERSE_SOURCES, DEFAULT_LIMITS, MAX_UNIVERSE } from './rules/validate.js';
import { BOT_INTERVALS, BACKTEST_RANGES } from './rules/intervals.js';
import { TEMPLATES, SYMBOL_LISTS } from './rules/templates.js';

const PORT = Number(process.env.PORT) || 3001;
const QUOTE_TICK_MS = 10_000;
const BOT_TICK_MS = 30_000;
const EQUITY_SNAPSHOT_MS = 5 * 60_000;

load();
migrateLegacyBots();
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
    bot.state = emptyBotState();
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

// ---- Bot builder, bots & backtests ---------------------------------------

app.get('/api/bot-builder', (req, res) => {
  res.json({
    metrics: metricCatalog(),
    operators: Object.entries(OPERATORS).map(([id, o]) => ({ id, label: o.label })),
    actions: Object.entries(ACTIONS).map(([id, a]) => ({ id, ...a })),
    sizings: SIZINGS,
    sources: UNIVERSE_SOURCES,
    screeners: SCREENERS,
    symbolLists: SYMBOL_LISTS,
    intervals: Object.fromEntries(Object.entries(BOT_INTERVALS).map(([id, i]) => [id, i.label])),
    backtestRanges: BACKTEST_RANGES,
    defaultLimits: DEFAULT_LIMITS,
    maxUniverse: MAX_UNIVERSE,
    templates: TEMPLATES,
  });
});

const botSummary = ({ log, ...b }) => ({ ...b, log: log.slice(0, 100) });

app.get('/api/bots', (req, res) => res.json(getDb().bots.map(botSummary)));

app.post('/api/bots', (req, res) => {
  const config = validateBotConfig(req.body.config);
  const bot = createBot({ config, portfolioId: req.body.portfolioId, templateId: req.body.templateId });
  res.status(201).json(botSummary(bot));
});

app.put('/api/bots/:id', (req, res) => {
  const bot = findBot(req.params.id);
  updateBot(bot, validateBotConfig(req.body.config));
  res.json(botSummary(bot));
});

app.patch('/api/bots/:id', (req, res) => {
  const bot = findBot(req.params.id);
  if (typeof req.body.active === 'boolean' && req.body.active !== bot.active) {
    bot.active = req.body.active;
    bot.status = bot.active ? 'Starting' : 'Paused';
    logBot(bot, bot.active ? 'Bot resumed' : 'Bot paused');
  }
  save();
  res.json(botSummary(bot));
});

app.delete('/api/bots/:id', (req, res) => {
  findBot(req.params.id);
  getDb().bots = getDb().bots.filter((b) => b.id !== req.params.id);
  save();
  res.status(204).end();
});

// Dry run: evaluate a (possibly unsaved) bot against live data without trading.
app.post('/api/bots/preview', h(async (req, res) => {
  const config = validateBotConfig(req.body.config);
  const portfolio = findPortfolio(req.body.portfolioId);
  const bot = req.body.botId ? findBot(req.body.botId) : null;
  const results = await scanBot(config, { portfolio, bot: bot && { ...bot, state: structuredClone(bot.state) }, dryRun: true });
  res.json({ time: Date.now(), results });
}));

app.post('/api/backtest', h(async (req, res) => {
  const config = validateBotConfig(req.body.config);
  const range = req.body.range ?? '2y';
  if (!BACKTEST_RANGES[config.interval]?.includes(range)) {
    throw Object.assign(new Error(`A ${range} period is not available for ${config.interval} bars`), { status: 400 });
  }
  const startingCash = Number(req.body.startingCash ?? 10_000);
  const commission = Number(req.body.commission ?? 0);
  if (!(startingCash >= 100)) throw Object.assign(new Error('Starting cash must be at least $100'), { status: 400 });
  if (!(commission >= 0)) throw Object.assign(new Error('Commission cannot be negative'), { status: 400 });

  const warnings = [];
  const u = config.universe;
  let entries;
  if (u.source === 'list') entries = u.symbols.map((symbol) => ({ symbol }));
  else if (u.source === 'watchlist') entries = getDb().watchlist.slice(0, MAX_UNIVERSE).map((symbol) => ({ symbol }));
  else if (u.source === 'screener') {
    entries = await getScreener(u.screener, u.count);
    warnings.push(
      "Screener backtests use the stocks on today's screener for the whole period, so they're biased toward stocks that recently did well (look-ahead bias). Fundamentals are also today's values.",
    );
  } else {
    throw Object.assign(new Error("A bot that trades current holdings can't be backtested. Choose specific stocks instead."), { status: 400 });
  }
  if (!entries.length) throw Object.assign(new Error('The bot has no stocks to backtest'), { status: 400 });

  const histories = await mapLimit(entries, 6, async (e) => {
    try {
      const { candles } = await getHistory(e.symbol, range, config.interval);
      return { symbol: e.symbol, candles, fundamentals: e.fundamentals };
    } catch (err) {
      warnings.push(`${e.symbol}: ${err.message}`);
      return { symbol: e.symbol, candles: [] };
    }
  });

  const result = runBacktest({ config, histories, startingCash, commission });
  const traded = new Set(result.trades.map((t) => t.symbol));
  const prices = Object.fromEntries(
    histories
      .filter((h) => h.candles.length && (traded.has(h.symbol) || histories.length === 1))
      .map((h) => [h.symbol, h.candles.map((c) => ({ time: c.time, value: c.close }))]),
  );
  res.json({ range, interval: config.interval, warnings, prices, ...result });
}));

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
    const shorts = getDb().portfolios.flatMap((p) => Object.keys(p.positions).filter((s) => p.positions[s].qty < 0));
    const symbols = new Set([...openOrderSymbols(), ...shorts]);
    if (symbols.size) {
      const quotes = await getQuotes([...symbols]);
      await evaluatePendingOrders(quotes);
      if (shorts.length) checkMarginCalls(await getQuotes(getDb().portfolios.flatMap((p) => Object.keys(p.positions))));
    }
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

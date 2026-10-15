// Runs rule-based bots against live data. On every tick a bot:
//   1. works out which stocks to look at (its universe, plus anything it holds),
//   2. loads live prices and history for each one,
//   3. evaluates its filters and rules (rules/engine.js),
//   4. places market orders for any rule that fires while the market is open.
// The same scan powers the "preview" dry run in the bot builder.

import { getDb, save, findPortfolio, newId } from './store.js';
import { getHistory, getQuote, getQuotes, getScreener } from './marketData.js';
import { evaluateSymbol } from './rules/engine.js';
import { BOT_INTERVALS } from './rules/intervals.js';
import { MAX_UNIVERSE, validateBotConfig } from './rules/validate.js';
import { legacyBotToConfig } from './rules/templates.js';
import { placeOrder, events } from './broker.js';
import { roundQty, accountSnapshot } from './accounting.js';

const MAX_LOG = 300;

export const emptyBotState = () => ({ positions: {}, lastTrade: {}, fired: {}, tradeCount: 0, realizedPnl: 0 });

export function logBot(bot, message, level = 'info') {
  bot.log.unshift({ time: Date.now(), level, message });
  bot.log.length = Math.min(bot.log.length, MAX_LOG);
  save();
  events.emit('bot', bot.id);
}

export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// Which stocks to evaluate: the configured source, plus every stock the bot
// currently holds (so exit rules keep running even if it leaves the screener).
export async function resolveUniverse(universe, portfolio, botPositions = {}) {
  let entries;
  if (universe.source === 'list') entries = universe.symbols.map((symbol) => ({ symbol }));
  else if (universe.source === 'watchlist') entries = getDb().watchlist.map((symbol) => ({ symbol }));
  else if (universe.source === 'holdings') entries = Object.keys(portfolio.positions).map((symbol) => ({ symbol }));
  else entries = await getScreener(universe.screener, universe.count);
  entries = entries.slice(0, MAX_UNIVERSE);
  const seen = new Set(entries.map((e) => e.symbol));
  for (const [symbol, pos] of Object.entries(botPositions)) {
    if (pos.qty !== 0 && !seen.has(symbol)) entries.push({ symbol, heldOnly: true });
  }
  return entries;
}

// Live quote plus history, with the in-progress bar marked to the live price.
async function loadSymbol(symbol, interval) {
  const cfg = BOT_INTERVALS[interval];
  const [quote, hist] = await Promise.all([getQuote(symbol), getHistory(symbol, cfg.range, interval)]);
  const candles = hist.candles.slice();
  if (candles.length < 2) throw new Error('Not enough price history');
  const last = candles.at(-1);
  if (quote.marketOpen && last.time + cfg.seconds > Date.now() / 1000) {
    candles[candles.length - 1] = {
      ...last,
      close: quote.price,
      high: Math.max(last.high, quote.price),
      low: Math.min(last.low, quote.price),
    };
  }
  return { quote, candles };
}

function accountFor(portfolio, prices, state) {
  return {
    ...accountSnapshot(portfolio, prices),
    openPositions: Object.values(state.positions).filter((p) => p.qty !== 0).length,
  };
}

async function execute(bot, portfolio, symbol, intent, barTime) {
  const state = bot.state;
  const held = portfolio.positions[symbol]?.qty ?? 0;
  let qty = intent.qty;
  // Never close more than the portfolio still has (the user may have traded it manually).
  if (intent.side === 'sell') qty = roundQty(Math.min(qty, Math.max(held, 0)));
  if (intent.side === 'cover') qty = roundQty(Math.min(qty, Math.max(-held, 0)));
  if (!(qty > 0)) {
    delete state.positions[symbol];
    logBot(bot, `${symbol}: wanted to ${intent.side} but the portfolio no longer has that position; bot position reset`, 'warn');
    return null;
  }

  const { transaction: tx } = await placeOrder(
    portfolio.id,
    { symbol, side: intent.side, qty, type: 'market' },
    { source: 'bot', botId: bot.id, reason: `${bot.name}: ${intent.reason}` },
  );

  const pos = state.positions[symbol] ?? { qty: 0, avgCost: 0, openedAt: null };
  const absQty = Math.abs(pos.qty);
  if (intent.side === 'buy' || intent.side === 'short') {
    pos.avgCost = (absQty * pos.avgCost + qty * tx.price) / (absQty + qty);
    pos.qty = intent.side === 'buy' ? roundQty(pos.qty + qty) : -roundQty(absQty + qty);
    pos.openedAt = pos.openedAt ?? barTime;
    state.positions[symbol] = pos;
  } else {
    const remaining = roundQty(absQty - qty);
    if (remaining <= 0) delete state.positions[symbol];
    else state.positions[symbol] = { ...pos, qty: pos.qty > 0 ? remaining : -remaining };
  }
  state.lastTrade[symbol] = barTime;
  if (intent.ruleId) state.fired[symbol] = { ...state.fired[symbol], [intent.ruleId]: barTime };
  state.tradeCount += 1;
  state.realizedPnl = Math.round((state.realizedPnl + tx.realizedPnl) * 100) / 100;
  logBot(bot, `${intent.side.toUpperCase()} ${qty} ${symbol} @ $${tx.price.toFixed(2)} — ${intent.reason}`, 'trade');
  return tx;
}

/**
 * Evaluate every stock in a bot's universe.
 * With `bot` set and dryRun false, fires orders; otherwise only reports what would happen.
 */
export async function scanBot(config, { portfolio, bot = null, dryRun = true }) {
  const state = bot?.state ?? emptyBotState();
  const cfg = BOT_INTERVALS[config.interval];
  if (config.universe.source === 'holdings') {
    // Holdings bots manage every position in the portfolio, including ones opened manually.
    for (const [symbol, pos] of Object.entries(portfolio.positions)) {
      state.positions[symbol] = { qty: pos.qty, avgCost: pos.avgCost, openedAt: state.positions[symbol]?.openedAt ?? null };
    }
    for (const symbol of Object.keys(state.positions)) if (!portfolio.positions[symbol]) delete state.positions[symbol];
  }
  const universe = await resolveUniverse(config.universe, portfolio, state.positions);

  const loaded = await mapLimit(universe, 6, async (u) => {
    try {
      return { ...u, ...(await loadSymbol(u.symbol, config.interval)) };
    } catch (err) {
      return { ...u, error: err.message };
    }
  });

  const prices = {};
  const others = Object.keys(portfolio.positions).filter((s) => !loaded.some((l) => l.symbol === s));
  for (const [s, q] of Object.entries(await getQuotes(others))) prices[s] = q.price;
  for (const l of loaded) if (l.quote) prices[l.symbol] = l.quote.price;

  // Positions the bot holds go first so exits can free cash and slots for entries.
  const ordered = loaded
    .map((l, i) => ({ ...l, i }))
    .sort((a, b) => Number(Boolean(state.positions[b.symbol])) - Number(Boolean(state.positions[a.symbol])) || a.i - b.i);

  const results = [];
  for (const item of ordered) {
    if (item.error) {
      results.push({ symbol: item.symbol, error: item.error });
      continue;
    }
    const res = evaluateSymbol({
      config,
      symbol: item.symbol,
      candles: item.candles,
      fundamentals: { ...item.fundamentals, dayChangePct: item.quote.changePercent },
      position: state.positions[item.symbol] ?? { qty: 0, avgCost: 0, openedAt: null },
      lastTradeTime: state.lastTrade[item.symbol] ?? null,
      firedRules: state.fired[item.symbol] ?? {},
      account: accountFor(portfolio, prices, state),
      barsPerYear: cfg.barsPerYear,
      commission: portfolio.commission ?? 0,
    });
    res.name = item.quote.name;
    res.marketOpen = item.quote.marketOpen;
    res.heldOnly = Boolean(item.heldOnly);

    if (res.intent && !dryRun) {
      if (!item.quote.marketOpen) {
        res.blocked = 'Market closed';
      } else {
        try {
          const tx = await execute(bot, portfolio, item.symbol, res.intent, item.candles.at(-1).time);
          res.executed = Boolean(tx);
        } catch (err) {
          res.blocked = err.message;
          logBot(bot, `${item.symbol}: order failed — ${err.message}`, 'error');
        }
      }
    }
    results.push(res);
  }
  return results;
}

export async function tickBot(bot) {
  const portfolio = findPortfolio(bot.portfolioId);
  const results = await scanBot(bot.config, { portfolio, bot, dryRun: false });
  const open = results.some((r) => r.marketOpen);
  bot.lastScan = { time: Date.now(), results };
  bot.status = open ? `Watching ${results.length} stock${results.length === 1 ? '' : 's'}` : 'Market closed — waiting';
  save();
  events.emit('bot', bot.id);
}

let running = false;

export async function tickAllBots() {
  if (running) return; // previous tick still in progress
  running = true;
  try {
    for (const bot of getDb().bots) {
      if (!bot.active) continue;
      try {
        await tickBot(bot);
        bot.lastError = null;
      } catch (err) {
        bot.status = `Error: ${err.message}`;
        if (bot.lastError !== err.message) logBot(bot, err.message, 'error');
        bot.lastError = err.message;
      }
    }
  } finally {
    running = false;
  }
}

export function createBot({ config, portfolioId, templateId }) {
  findPortfolio(portfolioId);
  const n = getDb().bots.length + 1;
  const bot = {
    id: newId(),
    name: config.name || `Bot ${n}`,
    portfolioId,
    templateId: templateId ?? null,
    config,
    active: true,
    status: 'Starting',
    state: emptyBotState(),
    log: [],
    lastScan: null,
    createdAt: Date.now(),
  };
  getDb().bots.push(bot);
  logBot(bot, 'Bot created');
  return bot;
}

export function updateBot(bot, config) {
  bot.config = config;
  bot.name = config.name || bot.name;
  bot.lastScan = null;
  logBot(bot, 'Bot settings updated');
}

// Convert bots saved by the earlier single-strategy version of the app.
export function migrateLegacyBots() {
  for (const bot of getDb().bots) {
    if (bot.config) continue;
    try {
      bot.config = validateBotConfig(legacyBotToConfig(bot));
      const { qty = 0, avgCost = 0 } = bot.state ?? {};
      bot.state = emptyBotState();
      if (qty > 0) bot.state.positions[bot.symbol] = { qty, avgCost, openedAt: null };
      for (const k of ['strategy', 'symbol', 'interval', 'params']) delete bot[k];
      bot.log ??= [];
      logBot(bot, 'Converted to a rule-based bot');
    } catch (err) {
      console.warn(`Could not migrate bot ${bot.id}:`, err.message);
      bot.active = false;
    }
  }
  save();
}

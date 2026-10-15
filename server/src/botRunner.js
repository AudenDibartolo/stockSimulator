// Runs active strategy bots against live data. Each bot evaluates its strategy
// once per completed bar of its interval, and checks stop-loss/take-profit on
// every tick. Bots only trade while the market is open.

import { getDb, save, findPortfolio, newId } from './store.js';
import { getHistory, getQuote } from './marketData.js';
import { runStep, checkRisk } from './engine.js';
import { placeOrder, events } from './broker.js';
import { roundQty } from './accounting.js';

export const BOT_INTERVALS = {
  '5m': { range: '1mo', seconds: 300 },
  '15m': { range: '1mo', seconds: 900 },
  '1h': { range: '6mo', seconds: 3600 },
  '1d': { range: '2y', seconds: 86400 },
};

const MAX_LOG = 200;

export function logBot(bot, message, level = 'info') {
  bot.log.unshift({ time: Date.now(), level, message });
  bot.log.length = Math.min(bot.log.length, MAX_LOG);
  save();
  events.emit('bot', bot.id);
}

async function execute(bot, portfolio, intent, price) {
  // A bot only sells shares it bought, and never more than the portfolio still holds
  // (the user may have sold some manually).
  let qty = intent.qty;
  if (intent.side === 'sell') {
    const held = portfolio.positions[bot.symbol]?.qty ?? 0;
    qty = roundQty(Math.min(qty, held));
    if (!(qty > 0)) {
      bot.state.qty = 0;
      bot.state.avgCost = 0;
      logBot(bot, `Wanted to sell but portfolio no longer holds ${bot.symbol}; position reset`, 'warn');
      return;
    }
  }
  try {
    const result = await placeOrder(
      portfolio.id,
      { symbol: bot.symbol, side: intent.side, qty, type: 'market' },
      { source: 'bot', botId: bot.id, reason: `${bot.name}: ${intent.reason}` },
    );
    const fillPrice = result.transaction?.price ?? price;
    const s = bot.state;
    if (intent.side === 'buy') {
      s.avgCost = ((s.qty ?? 0) * (s.avgCost ?? 0) + qty * fillPrice) / ((s.qty ?? 0) + qty);
      s.qty = roundQty((s.qty ?? 0) + qty);
    } else {
      s.qty = roundQty(Math.max(0, (s.qty ?? 0) - qty));
      if (s.qty === 0) s.avgCost = 0;
    }
    s.tradeCount = (s.tradeCount ?? 0) + 1;
    logBot(bot, `${intent.side.toUpperCase()} ${qty} ${bot.symbol} @ $${fillPrice.toFixed(2)} — ${intent.reason}`, 'trade');
  } catch (err) {
    logBot(bot, `Order failed: ${err.message}`, 'error');
  }
}

export async function tickBot(bot, { now = Date.now() } = {}) {
  const portfolio = findPortfolio(bot.portfolioId);
  const quote = await getQuote(bot.symbol);
  if (!quote.marketOpen) {
    bot.status = 'Waiting for market open';
    return;
  }
  bot.status = 'Running';
  const position = { qty: bot.state.qty ?? 0, avgCost: bot.state.avgCost ?? 0 };

  // Intra-bar risk management on the live price.
  const risk = checkRisk(bot.params, position, quote.price);
  if (risk) {
    await execute(bot, portfolio, risk, quote.price);
    return;
  }

  // Only completed bars feed the strategy; the newest bar may still be forming.
  const cfg = BOT_INTERVALS[bot.interval];
  const { candles } = await getHistory(bot.symbol, cfg.range, bot.interval);
  const completed = candles.filter((c) => c.time + cfg.seconds <= now / 1000);
  const lastBar = completed.at(-1);
  if (!lastBar || bot.state.lastBarTime === lastBar.time) return;
  bot.state.lastBarTime = lastBar.time;

  const intent = runStep({
    strategyId: bot.strategy,
    params: bot.params,
    state: bot.state.strategy,
    candles: completed,
    price: quote.price,
    position,
    cash: portfolio.cash,
    commission: portfolio.commission ?? 0,
  });
  save();
  if (intent) await execute(bot, portfolio, intent, quote.price);
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
      } catch (err) {
        bot.status = `Error: ${err.message}`;
        if (bot.lastError !== err.message) logBot(bot, err.message, 'error');
        bot.lastError = err.message;
        continue;
      }
      bot.lastError = null;
    }
  } finally {
    running = false;
  }
}

export function createBot({ name, portfolioId, strategy, symbol, interval, params }) {
  if (!BOT_INTERVALS[interval]) {
    throw Object.assign(new Error(`Interval must be one of ${Object.keys(BOT_INTERVALS).join(', ')}`), { status: 400 });
  }
  findPortfolio(portfolioId);
  const bot = {
    id: newId(),
    name: name?.trim() || `${strategy} ${symbol}`,
    portfolioId,
    strategy,
    symbol,
    interval,
    params,
    active: true,
    status: 'Starting',
    state: { qty: 0, avgCost: 0, strategy: {} },
    log: [],
    createdAt: Date.now(),
  };
  getDb().bots.push(bot);
  logBot(bot, `Bot created: trading ${symbol} on ${interval} bars`);
  return bot;
}

// Paper broker: executes orders against live quotes and manages pending
// limit/stop orders for each portfolio.

import { EventEmitter } from 'node:events';
import { getDb, save, findPortfolio, newId } from './store.js';
import { getQuote, getQuotes, normalizeSymbol } from './marketData.js';
import { applyFill, roundQty, TradeError, marketValue } from './accounting.js';

export const events = new EventEmitter(); // 'portfolio' (portfolioId), 'bot' (botId)
events.setMaxListeners(0);

const MAX_TRANSACTIONS = 5000;

function recordFill(portfolio, { symbol, side, qty, price, orderType, source, botId, reason }) {
  const fill = applyFill(portfolio, { symbol, side, qty, price, commission: portfolio.commission ?? 0 });
  const tx = {
    id: newId(),
    time: Date.now(),
    symbol,
    side,
    qty,
    price,
    total: fill.gross,
    commission: fill.commission,
    realizedPnl: fill.realizedPnl,
    orderType,
    source, // 'manual' | 'bot'
    botId,
    reason,
  };
  portfolio.transactions.unshift(tx);
  portfolio.transactions.length = Math.min(portfolio.transactions.length, MAX_TRANSACTIONS);
  save();
  events.emit('portfolio', portfolio.id);
  return tx;
}

function parseOrder(input) {
  const symbol = normalizeSymbol(input.symbol);
  const side = input.side;
  const type = input.type ?? 'market';
  if (!['buy', 'sell'].includes(side)) throw new TradeError('Side must be "buy" or "sell"');
  if (!['market', 'limit', 'stop'].includes(type)) throw new TradeError('Type must be market, limit or stop');
  const order = { symbol, side, type };
  if (input.qty != null && input.qty !== '') order.qty = roundQty(Number(input.qty));
  else if (input.dollars != null && input.dollars !== '') order.dollars = Number(input.dollars);
  else throw new TradeError('Enter a quantity or dollar amount');
  if (order.qty != null && !(order.qty > 0)) throw new TradeError('Quantity must be greater than zero');
  if (order.dollars != null && !(order.dollars > 0)) throw new TradeError('Dollar amount must be greater than zero');
  if (type === 'limit') {
    order.limitPrice = Number(input.limitPrice);
    if (!(order.limitPrice > 0)) throw new TradeError('Limit price is required');
  }
  if (type === 'stop') {
    order.stopPrice = Number(input.stopPrice);
    if (!(order.stopPrice > 0)) throw new TradeError('Stop price is required');
  }
  return order;
}

export async function placeOrder(portfolioId, input, { source = 'manual', botId, reason } = {}) {
  const portfolio = findPortfolio(portfolioId);
  const order = parseOrder(input);
  const quote = await getQuote(order.symbol); // also validates the symbol exists

  if (order.dollars != null) {
    const refPrice = order.limitPrice ?? order.stopPrice ?? quote.price;
    order.qty = roundQty(order.dollars / refPrice);
    if (!(order.qty > 0)) throw new TradeError('Dollar amount is too small for one share fraction');
  }

  if (order.side === 'sell') {
    const held = portfolio.positions[order.symbol]?.qty ?? 0;
    if (order.qty > held + 1e-9) {
      throw new TradeError(`You only hold ${held} ${order.symbol} (short selling is not supported)`);
    }
  }

  if (order.type === 'market') {
    const tx = recordFill(portfolio, {
      symbol: order.symbol,
      side: order.side,
      qty: order.qty,
      price: quote.price,
      orderType: 'market',
      source,
      botId,
      reason: reason ?? (quote.marketOpen ? undefined : 'Market closed: filled at last price'),
    });
    return { status: 'filled', transaction: tx };
  }

  const pending = {
    id: newId(),
    symbol: order.symbol,
    side: order.side,
    type: order.type,
    qty: order.qty,
    limitPrice: order.limitPrice,
    stopPrice: order.stopPrice,
    status: 'open',
    createdAt: Date.now(),
  };
  portfolio.orders.unshift(pending);
  save();
  events.emit('portfolio', portfolio.id);
  // It may already be marketable.
  await evaluatePendingOrders({ [order.symbol]: quote });
  return { status: pending.status, order: pending };
}

export function cancelOrder(portfolioId, orderId) {
  const portfolio = findPortfolio(portfolioId);
  const order = portfolio.orders.find((o) => o.id === orderId);
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (order.status !== 'open') throw new TradeError(`Order is already ${order.status}`);
  order.status = 'cancelled';
  order.closedAt = Date.now();
  save();
  events.emit('portfolio', portfolio.id);
  return order;
}

export function isTriggered(order, price) {
  if (order.type === 'limit') return order.side === 'buy' ? price <= order.limitPrice : price >= order.limitPrice;
  if (order.type === 'stop') return order.side === 'buy' ? price >= order.stopPrice : price <= order.stopPrice;
  return false;
}

// Fill any open limit/stop orders whose trigger condition is met by the given quotes.
export async function evaluatePendingOrders(quotes) {
  for (const portfolio of getDb().portfolios) {
    for (const order of portfolio.orders) {
      if (order.status !== 'open') continue;
      const quote = quotes[order.symbol];
      if (!quote || !isTriggered(order, quote.price)) continue;
      try {
        const tx = recordFill(portfolio, {
          symbol: order.symbol,
          side: order.side,
          qty: order.qty,
          price: quote.price,
          orderType: order.type,
          source: 'manual',
        });
        order.status = 'filled';
        order.filledPrice = quote.price;
        order.transactionId = tx.id;
      } catch (err) {
        order.status = 'rejected';
        order.rejectReason = err.message;
      }
      order.closedAt = Date.now();
      save();
      events.emit('portfolio', portfolio.id);
    }
  }
}

export function openOrderSymbols() {
  const syms = new Set();
  for (const p of getDb().portfolios) for (const o of p.orders) if (o.status === 'open') syms.add(o.symbol);
  return syms;
}

export function heldSymbols() {
  const syms = new Set();
  for (const p of getDb().portfolios) for (const s of Object.keys(p.positions)) syms.add(s);
  return syms;
}

// Portfolio summary enriched with live prices.
export async function valuePortfolio(portfolio) {
  const quotes = await getQuotes(Object.keys(portfolio.positions));
  const positions = Object.entries(portfolio.positions).map(([symbol, pos]) => {
    const q = quotes[symbol];
    const price = q?.price ?? pos.avgCost;
    const value = pos.qty * price;
    const cost = pos.qty * pos.avgCost;
    return {
      symbol,
      name: q?.name ?? symbol,
      qty: pos.qty,
      avgCost: pos.avgCost,
      price,
      value,
      cost,
      unrealizedPnl: value - cost,
      unrealizedPnlPct: cost ? ((value - cost) / cost) * 100 : 0,
      dayChange: q ? pos.qty * q.change : 0,
      dayChangePercent: q?.changePercent ?? 0,
      stale: !q,
    };
  });
  const prices = Object.fromEntries(positions.map((p) => [p.symbol, p.price]));
  const totalValue = marketValue(portfolio, prices);
  const investedValue = positions.reduce((a, p) => a + p.value, 0);
  return {
    id: portfolio.id,
    name: portfolio.name,
    startingCash: portfolio.startingCash,
    commission: portfolio.commission ?? 0,
    cash: portfolio.cash,
    realizedPnl: portfolio.realizedPnl,
    createdAt: portfolio.createdAt,
    totalValue,
    investedValue,
    totalPnl: totalValue - portfolio.startingCash,
    totalPnlPct: (totalValue / portfolio.startingCash - 1) * 100,
    dayChange: positions.reduce((a, p) => a + p.dayChange, 0),
    positions: positions.sort((a, b) => b.value - a.value),
  };
}

// Periodically snapshot each portfolio's total value for the equity chart.
export async function snapshotEquity() {
  for (const portfolio of getDb().portfolios) {
    try {
      const { totalValue } = await valuePortfolio(portfolio);
      const hist = portfolio.equityHistory;
      hist.push({ time: Math.floor(Date.now() / 1000), value: Math.round(totalValue * 100) / 100 });
      if (hist.length > 5000) hist.splice(0, hist.length - 5000);
    } catch (err) {
      console.warn(`Equity snapshot failed for ${portfolio.name}:`, err.message);
    }
  }
  save();
}

// Replays a rule-based bot over historical bars for every stock in its universe,
// sharing one cash balance like a real portfolio. Orders fill at the close of
// the bar that triggered them.

import { evaluateSymbol } from './rules/engine.js';
import { barsPerYear as barsPerYearFor } from './rules/intervals.js';
import { applyFill, newPortfolioState, roundMoney, accountSnapshot, marginCallNeeded } from './accounting.js';

/**
 * histories: [{ symbol, candles, fundamentals? }]
 */
export function runBacktest({ config, histories, startingCash = 10_000, commission = 0 }) {
  const series = histories.filter((h) => h.candles?.length);
  if (!series.length) throw Object.assign(new Error('No historical data to backtest'), { status: 400 });
  const bpy = barsPerYearFor(config.interval);

  const times = [...new Set(series.flatMap((h) => h.candles.map((c) => c.time)))].sort((a, b) => a - b);
  const cursor = Object.fromEntries(series.map((h) => [h.symbol, -1]));
  const portfolio = newPortfolioState(startingCash);
  const meta = {}; // symbol -> { openedAt, lastTrade }
  const lastPrice = {};
  const trades = [];
  const equity = [];
  const benchmark = [];

  // Benchmark: split the starting cash equally and buy & hold every stock from its first bar.
  const slice = startingCash / series.length;
  const benchShares = {};
  let benchCash = startingCash;

  const fill = (symbol, side, qty, price, time, reason) => {
    const res = applyFill(portfolio, { symbol, side, qty, price, commission, prices: lastPrice });
    const m = (meta[symbol] ??= { openedAt: null, lastTrade: null });
    m.lastTrade = time;
    if (!portfolio.positions[symbol]) m.openedAt = null;
    else m.openedAt ??= time;
    trades.push({ time, symbol, side, qty, price, realizedPnl: res.realizedPnl, reason });
  };

  for (const t of times) {
    const fresh = [];
    for (const h of series) {
      let i = cursor[h.symbol];
      while (i + 1 < h.candles.length && h.candles[i + 1].time <= t) i++;
      cursor[h.symbol] = i;
      if (i < 0) continue;
      lastPrice[h.symbol] = h.candles[i].close;
      if (benchShares[h.symbol] == null) {
        benchShares[h.symbol] = slice / h.candles[i].close;
        benchCash -= slice;
      }
      if (h.candles[i].time === t) fresh.push({ h, i });
    }

    if (marginCallNeeded(portfolio, lastPrice)) {
      for (const [symbol, pos] of Object.entries(portfolio.positions)) {
        if (pos.qty < 0) fill(symbol, 'cover', -pos.qty, lastPrice[symbol], t, 'Margin call');
      }
    }

    // Held stocks first so exits free up cash and position slots for entries.
    fresh.sort((a, b) => Number(Boolean(portfolio.positions[b.h.symbol])) - Number(Boolean(portfolio.positions[a.h.symbol])));

    for (const { h, i } of fresh) {
      const symbol = h.symbol;
      const held = portfolio.positions[symbol];
      const result = evaluateSymbol({
        config,
        symbol,
        candles: h.candles,
        end: i,
        fundamentals: h.fundamentals,
        position: held ? { qty: held.qty, avgCost: held.avgCost, openedAt: meta[symbol]?.openedAt } : { qty: 0, avgCost: 0, openedAt: null },
        lastTradeTime: meta[symbol]?.lastTrade ?? null,
        account: { ...accountSnapshot(portfolio, lastPrice), openPositions: Object.keys(portfolio.positions).length },
        barsPerYear: bpy,
        commission,
      });
      if (!result.intent) continue;
      try {
        fill(symbol, result.intent.side, result.intent.qty, h.candles[i].close, t, result.intent.reason);
      } catch {
        // e.g. buying power changed between sizing and fill; skip like a rejected order
      }
    }

    equity.push({ time: t, value: roundMoney(accountSnapshot(portfolio, lastPrice).equity) });
    let bench = benchCash;
    for (const [s, shares] of Object.entries(benchShares)) bench += shares * lastPrice[s];
    benchmark.push({ time: t, value: roundMoney(bench) });
  }

  const symbols = series.map((h) => {
    const own = trades.filter((t) => t.symbol === h.symbol);
    return {
      symbol: h.symbol,
      trades: own.length,
      realizedPnl: roundMoney(own.reduce((a, t) => a + t.realizedPnl, 0)),
      openQty: portfolio.positions[h.symbol]?.qty ?? 0,
      buyHoldPct: (h.candles.at(-1).close / h.candles[0].close - 1) * 100,
    };
  });

  return {
    trades,
    equity,
    benchmark,
    symbols,
    metrics: computeMetrics({ equity, benchmark, trades, startingCash, barsPerYear: bpy }),
  };
}

export function computeMetrics({ equity, benchmark, trades, startingCash, barsPerYear = 252 }) {
  const finalValue = equity.at(-1).value;
  const totalReturnPct = (finalValue / startingCash - 1) * 100;
  const benchmarkReturnPct = (benchmark.at(-1).value / startingCash - 1) * 100;

  let peak = -Infinity;
  let maxDrawdownPct = 0;
  for (const { value } of equity) {
    peak = Math.max(peak, value);
    maxDrawdownPct = Math.min(maxDrawdownPct, (value / peak - 1) * 100);
  }

  const returns = [];
  for (let i = 1; i < equity.length; i++) returns.push(equity[i].value / equity[i - 1].value - 1);
  const mean = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length || 1);
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(barsPerYear) : 0;

  const years = (equity.at(-1).time - equity[0].time) / (365.25 * 86400);
  const cagrPct = years > 0.05 && finalValue > 0 ? ((finalValue / startingCash) ** (1 / years) - 1) * 100 : null;

  const closed = trades.filter((t) => t.side === 'sell' || t.side === 'cover');
  const wins = closed.filter((t) => t.realizedPnl > 0).length;

  return {
    startingCash,
    finalValue,
    totalReturnPct,
    benchmarkReturnPct,
    cagrPct,
    maxDrawdownPct,
    sharpe,
    tradeCount: trades.length,
    closedTrades: closed.length,
    winRatePct: closed.length ? (wins / closed.length) * 100 : null,
  };
}

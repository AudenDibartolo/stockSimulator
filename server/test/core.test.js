import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smaAt, rsiAt, highestBefore, returnStdevAt } from '../src/indicators.js';
import { applyFill, newPortfolioState, accountSnapshot, marginCallNeeded } from '../src/accounting.js';
import { evaluateSymbol, evaluateCondition, sizeAction, checkSafetyExits } from '../src/rules/engine.js';
import { validateBotConfig } from '../src/rules/validate.js';
import { TEMPLATES, legacyBotToConfig } from '../src/rules/templates.js';
import { runBacktest } from '../src/backtest.js';
import { isTriggered } from '../src/broker.js';

const bars = (closes, start = 1_700_000_000) =>
  closes.map((close, i) => ({ time: start + i * 86400, open: close, high: close, low: close, close, volume: 1000 + i }));
const m = (metric, period) => ({ type: 'metric', metric, ...(period ? { period } : {}) });
const v = (value) => ({ type: 'value', value });
const FLAT = { left: m('position_qty'), op: 'eq', right: v(0) };
const LONG = { left: m('position_qty'), op: 'gt', right: v(0) };

function config(rules, extra = {}) {
  return validateBotConfig({ interval: '1d', universe: { source: 'list', symbols: ['AAA'] }, rules, ...extra });
}
const ctxFor = (closes, position = { qty: 0, avgCost: 0 }) => ({ candles: bars(closes), end: closes.length - 1, position, barsPerYear: 252 });
const account = { equity: 10_000, buyingPower: 10_000, openPositions: 0 };

// ---- indicators -------------------------------------------------------------

test('indicators evaluate at a bar index', () => {
  const c = bars([1, 2, 3, 4]);
  assert.equal(smaAt(c, 3, 2), 3.5);
  assert.equal(smaAt(c, 0, 2), null);
  assert.equal(highestBefore(bars([1, 5, 3, 10]), 3, 3), 5);
  assert.equal(rsiAt(bars(Array.from({ length: 30 }, (_, i) => 100 + i)), 29, 14), 100);
  assert.equal(returnStdevAt(bars([10, 10, 10, 10]), 3, 3), 0);
});

// ---- accounting -------------------------------------------------------------

test('long round trip tracks cash, average cost and realized P&L', () => {
  const p = newPortfolioState(1000);
  applyFill(p, { symbol: 'A', side: 'buy', qty: 2, price: 100 });
  applyFill(p, { symbol: 'A', side: 'buy', qty: 2, price: 200, commission: 1 });
  assert.equal(p.cash, 399);
  assert.equal(p.positions.A.avgCost, 150);
  const { realizedPnl } = applyFill(p, { symbol: 'A', side: 'sell', qty: 4, price: 160, commission: 1 });
  assert.equal(realizedPnl, 39);
  assert.equal(p.cash, 1038);
  assert.equal(p.positions.A, undefined);
});

test('short round trip: proceeds credited, profit when price falls', () => {
  const p = newPortfolioState(1000);
  applyFill(p, { symbol: 'S', side: 'short', qty: 10, price: 50 });
  assert.equal(p.positions.S.qty, -10);
  assert.equal(p.cash, 1500);
  const snap = accountSnapshot(p, { S: 40 });
  assert.equal(snap.equity, 1100);
  assert.equal(snap.buyingPower, 1500 - 1.5 * 400);
  const { realizedPnl } = applyFill(p, { symbol: 'S', side: 'cover', qty: 10, price: 40 });
  assert.equal(realizedPnl, 100);
  assert.equal(p.cash, 1100);
  assert.equal(p.positions.S, undefined);
});

test('shorting is limited by margin and blocks mixing directions', () => {
  const p = newPortfolioState(1000);
  assert.throws(() => applyFill(p, { symbol: 'S', side: 'short', qty: 41, price: 50 }), /buying power to short/);
  applyFill(p, { symbol: 'S', side: 'short', qty: 40, price: 50 }); // $2,000 short needs $1,000 margin
  assert.throws(() => applyFill(p, { symbol: 'S', side: 'buy', qty: 1, price: 50 }), /cover/);
  assert.throws(() => applyFill(p, { symbol: 'S', side: 'sell', qty: 1, price: 50 }), /Short/);
  assert.throws(() => applyFill(p, { symbol: 'B', side: 'buy', qty: 1, price: 10 }), /Insufficient buying power/);
});

test('margin call triggers when equity drops below 30% of shorts', () => {
  const p = newPortfolioState(1000);
  applyFill(p, { symbol: 'S', side: 'short', qty: 40, price: 50 }); // cash 3000
  assert.equal(marginCallNeeded(p, { S: 55 }), false); // equity 800 ≥ 0.3 × 2200
  assert.equal(marginCallNeeded(p, { S: 60 }), true); // equity 600 < 0.3 × 2400
});

test('fractional fills do not leave dust positions', () => {
  const p = newPortfolioState(1000);
  applyFill(p, { symbol: 'A', side: 'buy', qty: 0.1, price: 10 });
  applyFill(p, { symbol: 'A', side: 'buy', qty: 0.2, price: 10 });
  applyFill(p, { symbol: 'A', side: 'sell', qty: 0.3, price: 10 });
  assert.equal(p.positions.A, undefined);
});

test('limit and stop triggers treat cover like buy and short like sell', () => {
  assert.ok(isTriggered({ type: 'limit', side: 'buy', limitPrice: 10 }, 9.9));
  assert.ok(!isTriggered({ type: 'limit', side: 'buy', limitPrice: 10 }, 10.1));
  assert.ok(isTriggered({ type: 'stop', side: 'sell', stopPrice: 10 }, 9.5));
  assert.ok(isTriggered({ type: 'limit', side: 'short', limitPrice: 10 }, 10.5));
  assert.ok(isTriggered({ type: 'stop', side: 'cover', stopPrice: 10 }, 10.5));
});

// ---- validation & templates --------------------------------------------------

test('every template validates', () => {
  for (const t of TEMPLATES) assert.doesNotThrow(() => validateBotConfig(t.config), t.id);
});

test('validation fills defaults and reports helpful errors', () => {
  const c = config([{ when: { conditions: [{ left: m('rsi'), op: 'lt', right: v(30) }] }, action: { type: 'buy', sizing: 'dollars', amount: 100 } }]);
  assert.equal(c.rules[0].when.conditions[0].left.period, 14);
  assert.equal(c.rules[0].name, 'Rule 1');
  assert.equal(c.limits.maxPositions, 10);
  assert.throws(() => config([{ when: {}, action: { type: 'sell', sizing: 'dollars', amount: 5 } }]), /isn't valid for Sell/);
  assert.throws(() => config([{ when: { conditions: [{ left: m('nope'), op: 'gt', right: v(1) }] }, action: { type: 'buy', sizing: 'shares', amount: 1 } }]), /Rule 1, condition 1: unknown metric/);
  assert.throws(() => validateBotConfig({ universe: { source: 'list', symbols: [] }, rules: [] }), /at least one stock/);
});

test('legacy single-strategy bots convert to valid rule configs', () => {
  const cfg = validateBotConfig(legacyBotToConfig({ name: 'x', strategy: 'smaCrossover', symbol: 'AAPL', interval: '1d', params: { fast: 5, slow: 20 } }));
  assert.equal(cfg.rules[0].when.conditions[0].left.period, 5);
  assert.deepEqual(cfg.universe.symbols, ['AAPL']);
});

// ---- conditions & sizing -------------------------------------------------------

test('conditions compare metrics and detect crosses', () => {
  const ctx = ctxFor([10, 10, 10, 10, 13]);
  assert.equal(evaluateCondition({ left: m('price'), op: 'gt', right: v(12) }, ctx).pass, true);
  assert.equal(evaluateCondition({ left: m('change_pct', 1), op: 'gte', right: v(30) }, ctx).pass, true);
  assert.equal(evaluateCondition({ left: m('price'), op: 'crosses_above', right: m('sma', 3) }, ctx).pass, true);
  const later = ctxFor([10, 10, 10, 10, 13, 14]);
  assert.equal(evaluateCondition({ left: m('price'), op: 'crosses_above', right: m('sma', 3) }, later).pass, false);
  assert.match(evaluateCondition({ left: m('price'), op: 'gt', right: v(12) }, ctx).text, /Price: \$13\.00 > \$12\.00/);
});

test('missing data never passes a condition', () => {
  assert.equal(evaluateCondition({ left: m('sma', 50), op: 'gt', right: v(0) }, ctxFor([1, 2])).pass, false);
  assert.equal(evaluateCondition({ left: m('market_cap'), op: 'gt', right: v(0) }, ctxFor([1, 2])).pass, false);
});

test('sizing respects buying power, position caps and max positions', () => {
  const limits = { maxPositions: 2, maxPositionPct: 25 };
  const flat = { qty: 0, avgCost: 0 };
  assert.equal(sizeAction({ type: 'buy', sizing: 'pct_equity', amount: 50 }, { price: 10, position: flat, account, limits }).qty, 250);
  assert.equal(sizeAction({ type: 'buy', sizing: 'dollars', amount: 1000 }, { price: 10, position: flat, account: { ...account, buyingPower: 300 }, limits }).qty, 30);
  assert.match(sizeAction({ type: 'buy', sizing: 'shares', amount: 1 }, { price: 10, position: flat, account: { ...account, openPositions: 2 }, limits }).error, /maximum of 2/);
  assert.equal(sizeAction({ type: 'short', sizing: 'dollars', amount: 1000 }, { price: 10, position: flat, account: { ...account, buyingPower: 200 }, limits }).qty, 40);
  assert.equal(sizeAction({ type: 'sell', sizing: 'pct_position', amount: 50 }, { price: 10, position: { qty: 7, avgCost: 1 }, account, limits }).qty, 3.5);
  assert.match(sizeAction({ type: 'cover', sizing: 'all' }, { price: 10, position: { qty: 7, avgCost: 1 }, account, limits }).error, /No short/);
});

test('safety exits close longs and shorts', () => {
  const limits = { stopLossPct: 10, takeProfitPct: 20 };
  assert.equal(checkSafetyExits(limits, { qty: 5, avgCost: 100 }, 95), null);
  assert.equal(checkSafetyExits(limits, { qty: 5, avgCost: 100 }, 89).side, 'sell');
  assert.equal(checkSafetyExits(limits, { qty: -5, avgCost: 100 }, 112).side, 'cover');
  assert.match(checkSafetyExits(limits, { qty: -5, avgCost: 100 }, 80).reason, /Take-profit/);
});

test('evaluateSymbol: filters gate entries, first matching rule fires', () => {
  const cfg = config(
    [
      { name: 'Buy', when: { conditions: [{ left: m('price'), op: 'gt', right: v(5) }, FLAT] }, action: { type: 'buy', sizing: 'shares', amount: 2 } },
      { name: 'Also', when: { conditions: [] }, action: { type: 'buy', sizing: 'shares', amount: 1 } },
    ],
    { universe: { source: 'list', symbols: ['AAA'], filters: { conditions: [{ left: m('price'), op: 'lt', right: v(100) }] } } },
  );
  const r = evaluateSymbol({ config: cfg, symbol: 'AAA', candles: bars([10, 11]), account, barsPerYear: 252 });
  assert.deepEqual([r.intent.side, r.intent.qty, r.intent.ruleId], ['buy', 2, 'r1']);
  const blocked = evaluateSymbol({ config: cfg, symbol: 'AAA', candles: bars([150, 151]), account, barsPerYear: 252 });
  assert.equal(blocked.intent, null);
  assert.match(blocked.note, /filters/);
  const fired = evaluateSymbol({ config: cfg, symbol: 'AAA', candles: bars([10, 11]), account, barsPerYear: 252, firedRules: { r1: bars([10, 11])[1].time, r2: bars([10, 11])[1].time } });
  assert.equal(fired.intent, null);
});

// ---- backtests -------------------------------------------------------------------

test('backtest: DCA on schedule with bars_since_trade', () => {
  const cfg = config([{ when: { conditions: [{ left: m('bars_since_trade'), op: 'gte', right: v(2) }] }, action: { type: 'buy', sizing: 'dollars', amount: 100 } }]);
  const r = runBacktest({ config: cfg, histories: [{ symbol: 'AAA', candles: bars([10, 10, 10, 10, 20]) }], startingCash: 1000 });
  assert.equal(r.trades.length, 3); // bars 0, 2, 4
  assert.equal(r.metrics.finalValue, 700 + 25 * 20); // 10 + 10 + 5 shares
  assert.equal(r.metrics.benchmarkReturnPct, 100);
});

test('backtest: SMA crossover buys the golden cross and sells the death cross', () => {
  const cfg = config([
    { when: { conditions: [{ left: m('sma', 2), op: 'crosses_above', right: m('sma', 4) }, FLAT] }, action: { type: 'buy', sizing: 'pct_equity', amount: 100 } },
    { when: { conditions: [{ left: m('sma', 2), op: 'crosses_below', right: m('sma', 4) }, LONG] }, action: { type: 'sell', sizing: 'all' } },
  ]);
  const closes = [10, 10, 10, 10, 10, 12, 14, 16, 16, 12, 8, 6, 6];
  const r = runBacktest({ config: cfg, histories: [{ symbol: 'AAA', candles: bars(closes) }], startingCash: 1000 });
  assert.deepEqual(r.trades.map((t) => t.side), ['buy', 'sell']);
});

test('backtest: shorting a falling stock is profitable', () => {
  const cfg = config([
    { when: { conditions: [FLAT, { left: m('bars_since_trade'), op: 'gt', right: v(100) }] }, action: { type: 'short', sizing: 'dollars', amount: 500 } },
    { when: { conditions: [{ left: m('position_pnl_pct'), op: 'gte', right: v(40) }] }, action: { type: 'cover', sizing: 'all' } },
  ]);
  const r = runBacktest({ config: cfg, histories: [{ symbol: 'AAA', candles: bars([100, 90, 80, 70, 60]) }], startingCash: 1000 });
  assert.deepEqual(r.trades.map((t) => t.side), ['short', 'cover']);
  assert.ok(r.metrics.finalValue > 1000);
  assert.ok(r.metrics.benchmarkReturnPct < 0);
});

test('backtest: multiple stocks share cash and respect max positions', () => {
  const cfg = config([{ when: { conditions: [FLAT] }, action: { type: 'buy', sizing: 'dollars', amount: 100 } }], {
    universe: { source: 'list', symbols: ['AAA', 'BBB', 'CCC'] },
    limits: { maxPositions: 2 },
  });
  const r = runBacktest({
    config: cfg,
    histories: ['AAA', 'BBB', 'CCC'].map((symbol) => ({ symbol, candles: bars([10, 10, 10]) })),
    startingCash: 1000,
  });
  assert.equal(r.trades.length, 2);
  assert.deepEqual(r.symbols.map((s) => s.trades), [1, 1, 0]);
});

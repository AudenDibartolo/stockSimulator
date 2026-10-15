import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sma, rsi, highestBefore } from '../src/indicators.js';
import { applyFill, newPortfolioState } from '../src/accounting.js';
import { runStep, checkRisk } from '../src/engine.js';
import { resolveParams } from '../src/strategies.js';
import { runBacktest } from '../src/backtest.js';
import { isTriggered } from '../src/broker.js';

const bars = (closes) => closes.map((close, i) => ({ time: 1_700_000_000 + i * 86400, open: close, high: close, low: close, close, volume: 0 }));

test('sma aligns with input and fills nulls during warmup', () => {
  assert.deepEqual(sma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
});

test('rsi is 100 for a strictly rising series and low for a falling one', () => {
  const up = Array.from({ length: 30 }, (_, i) => 100 + i);
  assert.equal(rsi(up, 14).at(-1), 100);
  const down = up.slice().reverse();
  assert.ok(rsi(down, 14).at(-1) < 1);
});

test('highestBefore excludes the current bar', () => {
  assert.equal(highestBefore([1, 5, 3, 10], 3), 5);
});

test('applyFill tracks cash, average cost and realized P&L', () => {
  const p = newPortfolioState(1000);
  applyFill(p, { symbol: 'A', side: 'buy', qty: 2, price: 100 });
  applyFill(p, { symbol: 'A', side: 'buy', qty: 2, price: 200, commission: 1 });
  assert.equal(p.cash, 399);
  assert.equal(p.positions.A.qty, 4);
  assert.equal(p.positions.A.avgCost, 150);
  const { realizedPnl } = applyFill(p, { symbol: 'A', side: 'sell', qty: 4, price: 160, commission: 1 });
  assert.equal(realizedPnl, 39);
  assert.equal(p.cash, 1038);
  assert.equal(p.positions.A, undefined);
});

test('applyFill rejects overspending and short selling', () => {
  const p = newPortfolioState(100);
  assert.throws(() => applyFill(p, { symbol: 'A', side: 'buy', qty: 2, price: 51 }), /Insufficient cash/);
  assert.throws(() => applyFill(p, { symbol: 'A', side: 'sell', qty: 1, price: 50 }), /short selling/);
});

test('fractional fills do not leave dust positions', () => {
  const p = newPortfolioState(1000);
  applyFill(p, { symbol: 'A', side: 'buy', qty: 0.1, price: 10 });
  applyFill(p, { symbol: 'A', side: 'buy', qty: 0.2, price: 10 });
  applyFill(p, { symbol: 'A', side: 'sell', qty: 0.3, price: 10 });
  assert.equal(p.positions.A, undefined);
});

test('limit and stop triggers', () => {
  assert.ok(isTriggered({ type: 'limit', side: 'buy', limitPrice: 10 }, 9.9));
  assert.ok(!isTriggered({ type: 'limit', side: 'buy', limitPrice: 10 }, 10.1));
  assert.ok(isTriggered({ type: 'limit', side: 'sell', limitPrice: 10 }, 10));
  assert.ok(isTriggered({ type: 'stop', side: 'sell', stopPrice: 10 }, 9.5));
  assert.ok(!isTriggered({ type: 'stop', side: 'sell', stopPrice: 10 }, 10.5));
  assert.ok(isTriggered({ type: 'stop', side: 'buy', stopPrice: 10 }, 10.5));
});

test('resolveParams applies defaults and validates', () => {
  const p = resolveParams('smaCrossover', { fast: '5' });
  assert.equal(p.fast, 5);
  assert.equal(p.slow, 30);
  assert.equal(p.stopLossPct, 0);
  assert.throws(() => resolveParams('smaCrossover', { fast: 40, slow: 30 }), /shorter/);
  assert.throws(() => resolveParams('nope'), /Unknown strategy/);
});

test('checkRisk fires stop-loss and take-profit', () => {
  const params = { stopLossPct: 10, takeProfitPct: 20 };
  assert.equal(checkRisk(params, { qty: 1, avgCost: 100 }, 95), null);
  assert.match(checkRisk(params, { qty: 1, avgCost: 100 }, 89).reason, /Stop-loss/);
  assert.match(checkRisk(params, { qty: 1, avgCost: 100 }, 121).reason, /Take-profit/);
});

test('runStep sizes buys from allocation and never exceeds cash', () => {
  const params = resolveParams('dca', { amount: 1000, everyBars: 1 });
  const intent = runStep({
    strategyId: 'dca', params, state: {}, candles: bars([50]), price: 50,
    position: { qty: 0, avgCost: 0 }, cash: 300, commission: 0,
  });
  assert.equal(intent.side, 'buy');
  assert.equal(intent.qty, 6);
});

test('SMA crossover buys on golden cross and sells on death cross', () => {
  const params = resolveParams('smaCrossover', { fast: 2, slow: 4 });
  const closes = [10, 10, 10, 10, 10, 12, 14, 16, 16, 12, 8, 6, 6];
  const result = runBacktest({ candles: bars(closes), strategyId: 'smaCrossover', params, startingCash: 1000 });
  assert.deepEqual(result.trades.map((t) => t.side), ['buy', 'sell']);
  assert.equal(result.equity.length, closes.length);
});

test('backtest DCA spends on schedule and reports metrics', () => {
  const params = resolveParams('dca', { amount: 100, everyBars: 2 });
  const result = runBacktest({ candles: bars([10, 10, 10, 10, 20]), strategyId: 'dca', params, startingCash: 1000 });
  assert.equal(result.trades.length, 3); // bars 0, 2, 4
  assert.equal(result.metrics.finalValue, 700 + 25 * 20); // 10 + 10 + 5 shares
  assert.equal(result.metrics.benchmarkReturnPct, 100);
  assert.ok(result.metrics.maxDrawdownPct <= 0);
});

test('RSI strategy round trip with stop-loss overlay', () => {
  const params = resolveParams('rsiReversion', { period: 3, oversold: 30, overbought: 70, stopLossPct: 5 });
  const closes = [100, 99, 98, 97, 96, 90, 85, 80];
  const result = runBacktest({ candles: bars(closes), strategyId: 'rsiReversion', params, startingCash: 1000 });
  assert.equal(result.trades[0].side, 'buy');
  assert.ok(result.trades.some((t) => /Stop-loss/.test(t.reason)));
});

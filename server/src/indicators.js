// Technical indicators evaluated at a single bar index (`end`, inclusive) of a
// candle array. Each looks back only as far as it needs, so evaluating many
// bars in a backtest stays fast. Return null when there isn't enough history.

const close = (c) => c.close;

export function smaAt(candles, end, period, field = close) {
  if (end - period + 1 < 0) return null;
  let sum = 0;
  for (let i = end - period + 1; i <= end; i++) sum += field(candles[i]);
  return sum / period;
}

// EMA seeded with an SMA a few periods back; converges to the full-history value.
export function emaAt(candles, end, period) {
  const start = Math.max(0, end - period * 5);
  if (end - start + 1 < period) return null;
  let value = smaAt(candles, start + period - 1, period);
  const k = 2 / (period + 1);
  for (let i = start + period; i <= end; i++) value = candles[i].close * k + value * (1 - k);
  return value;
}

// RSI with Wilder's smoothing over a bounded warm-up window.
export function rsiAt(candles, end, period = 14) {
  const start = Math.max(0, end - Math.max(period * 10, 100));
  if (end - start < period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = start + 1; i <= start + period; i++) {
    const d = candles[i].close - candles[i - 1].close;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  for (let i = start + period + 1; i <= end; i++) {
    const d = candles[i].close - candles[i - 1].close;
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}

// Highest high / lowest low of the `period` bars *before* `end`.
export function highestBefore(candles, end, period) {
  if (end - period < 0) return null;
  let max = -Infinity;
  for (let i = end - period; i < end; i++) max = Math.max(max, candles[i].high);
  return max;
}

export function lowestBefore(candles, end, period) {
  if (end - period < 0) return null;
  let min = Infinity;
  for (let i = end - period; i < end; i++) min = Math.min(min, candles[i].low);
  return min;
}

// Standard deviation of bar-to-bar % returns over the last `period` bars.
export function returnStdevAt(candles, end, period) {
  if (end - period < 0) return null;
  const rets = [];
  for (let i = end - period + 1; i <= end; i++) rets.push(candles[i].close / candles[i - 1].close - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  return Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / rets.length);
}

// Average true range over the last `period` bars.
export function atrAt(candles, end, period) {
  if (end - period < 0) return null;
  let sum = 0;
  for (let i = end - period + 1; i <= end; i++) {
    const c = candles[i];
    const prev = candles[i - 1].close;
    sum += Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev));
  }
  return sum / period;
}

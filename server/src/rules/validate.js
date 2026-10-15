// Validates and normalizes a bot configuration coming from the client.

import { METRICS, OPERATORS } from './metrics.js';
import { BOT_INTERVALS } from './intervals.js';
import { SCREENERS, normalizeSymbol } from '../marketData.js';

export const MAX_UNIVERSE = 30;

export const ACTIONS = {
  buy: { label: 'Buy', sizings: ['shares', 'dollars', 'pct_cash', 'pct_equity'] },
  sell: { label: 'Sell', sizings: ['all', 'pct_position', 'shares'] },
  short: { label: 'Short', sizings: ['shares', 'dollars', 'pct_equity'] },
  cover: { label: 'Cover', sizings: ['all', 'pct_position', 'shares'] },
};

export const SIZINGS = {
  shares: 'shares',
  dollars: 'dollars',
  pct_cash: '% of buying power',
  pct_equity: '% of portfolio value',
  pct_position: '% of position',
  all: 'entire position',
};

export const UNIVERSE_SOURCES = {
  list: 'Specific stocks',
  screener: 'Live screener',
  watchlist: 'My watchlist',
  holdings: "Portfolio's current holdings",
};

export const DEFAULT_LIMITS = { stopLossPct: 0, takeProfitPct: 0, maxPositions: 10, maxPositionPct: 100, cooldownBars: 0 };

const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

function num(value, label, { min, max, integer = false, fallback } = {}) {
  const n = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isFinite(n)) throw bad(`${label} must be a number`);
  if (integer && !Number.isInteger(n)) throw bad(`${label} must be a whole number`);
  if (min != null && n < min) throw bad(`${label} must be at least ${min}`);
  if (max != null && n > max) throw bad(`${label} must be at most ${max}`);
  return n;
}

function operand(input, where) {
  if (input?.type === 'value') return { type: 'value', value: num(input.value, `${where}: value`) };
  if (input?.type === 'metric') {
    const metric = METRICS[input.metric];
    if (!metric) throw bad(`${where}: unknown metric "${input.metric}"`);
    const out = { type: 'metric', metric: input.metric };
    for (const p of metric.params) {
      out[p.key] = num(input[p.key], `${where}: ${metric.label} ${p.label.toLowerCase()}`, {
        min: p.min,
        max: p.max,
        integer: true,
        fallback: p.default,
      });
    }
    return out;
  }
  throw bad(`${where}: choose a metric or a number`);
}

function group(input, where) {
  const mode = input?.mode === 'any' ? 'any' : 'all';
  const list = input?.conditions ?? [];
  if (!Array.isArray(list)) throw bad(`${where}: conditions must be a list`);
  if (list.length > 10) throw bad(`${where}: at most 10 conditions`);
  return {
    mode,
    conditions: list.map((c, i) => {
      const at = `${where}, condition ${i + 1}`;
      if (!OPERATORS[c?.op]) throw bad(`${at}: unknown comparison "${c?.op}"`);
      const cond = { left: operand(c.left, at), op: c.op, right: operand(c.right, at) };
      if (cond.left.type === 'value' && cond.right.type === 'value') throw bad(`${at}: compare at least one metric`);
      return cond;
    }),
  };
}

function action(input, where) {
  const def = ACTIONS[input?.type];
  if (!def) throw bad(`${where}: action must be buy, sell, short or cover`);
  const sizing = input.sizing ?? def.sizings[0];
  if (!def.sizings.includes(sizing)) throw bad(`${where}: "${SIZINGS[sizing] ?? sizing}" isn't valid for ${def.label}`);
  if (sizing === 'all') return { type: input.type, sizing, amount: 0 };
  const isPct = sizing.startsWith('pct_');
  const amount = num(input.amount, `${where}: amount`, { min: 0.0001, max: isPct ? 100 : 1e9 });
  return { type: input.type, sizing, amount };
}

export function validateBotConfig(input = {}) {
  const interval = input.interval ?? '1d';
  if (!BOT_INTERVALS[interval]) throw bad(`Bar size must be one of ${Object.keys(BOT_INTERVALS).join(', ')}`);

  const u = input.universe ?? {};
  if (!UNIVERSE_SOURCES[u.source]) throw bad('Choose which stocks the bot trades');
  const universe = { source: u.source, filters: group(u.filters, 'Stock filters') };
  if (u.source === 'list') {
    const symbols = [...new Set((u.symbols ?? []).map(normalizeSymbol))];
    if (!symbols.length) throw bad('Add at least one stock for the bot to trade');
    if (symbols.length > MAX_UNIVERSE) throw bad(`A bot can follow at most ${MAX_UNIVERSE} stocks`);
    universe.symbols = symbols;
  }
  if (u.source === 'screener') {
    if (!SCREENERS[u.screener]) throw bad('Choose a screener');
    universe.screener = u.screener;
    universe.count = num(u.count, 'Screener size', { min: 1, max: MAX_UNIVERSE, integer: true, fallback: 15 });
  }

  const rulesIn = input.rules ?? [];
  if (!Array.isArray(rulesIn) || !rulesIn.length) throw bad('Add at least one rule');
  if (rulesIn.length > 20) throw bad('A bot can have at most 20 rules');
  const rules = rulesIn.map((r, i) => {
    const where = `Rule ${i + 1}`;
    return {
      id: String(r.id || `r${i + 1}`).slice(0, 20),
      name: String(r.name || where).slice(0, 60),
      when: group(r.when, where),
      action: action(r.action, where),
    };
  });
  if (new Set(rules.map((r) => r.id)).size !== rules.length) rules.forEach((r, i) => (r.id = `r${i + 1}`));

  const l = { ...DEFAULT_LIMITS, ...input.limits };
  const limits = {
    stopLossPct: num(l.stopLossPct, 'Stop-loss %', { min: 0, max: 99 }),
    takeProfitPct: num(l.takeProfitPct, 'Take-profit %', { min: 0, max: 10000 }),
    maxPositions: num(l.maxPositions, 'Max open positions', { min: 1, max: 50, integer: true }),
    maxPositionPct: num(l.maxPositionPct, 'Max position size %', { min: 1, max: 100 }),
    cooldownBars: num(l.cooldownBars, 'Cooldown bars', { min: 0, max: 1000, integer: true }),
  };

  return { name: String(input.name ?? '').trim().slice(0, 60), interval, universe, rules, limits };
}

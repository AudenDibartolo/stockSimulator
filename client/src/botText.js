// Plain-English descriptions of bot configs, built from the server's catalog.
import { useEffect, useState } from 'react';
import { api } from './api.js';

let catalogPromise = null;

// The bot-builder catalog (metrics, templates, …) rarely changes; fetch it once.
export function useCatalog() {
  const [state, setState] = useState({ data: null, error: null });
  useEffect(() => {
    catalogPromise ??= api.get('/api/bot-builder').catch((e) => {
      catalogPromise = null;
      throw e;
    });
    catalogPromise.then((data) => setState({ data, error: null })).catch((error) => setState({ data: null, error }));
  }, []);
  return state;
}

export const metricById = (catalog, id) => catalog.metrics.find((m) => m.id === id);

export function operandText(catalog, operand, unitMetric) {
  if (operand.type === 'value') {
    const unit = unitMetric ? metricById(catalog, unitMetric)?.unit : '';
    const v = Number(operand.value);
    if (unit === '$') return `$${v}`;
    if (unit === '%') return `${v}%`;
    if (unit === '$B') return `$${v}B`;
    if (unit === 'x') return `${v}x`;
    if (unit === 'shares' && Math.abs(v) >= 1000) return v.toLocaleString('en-US');
    return String(v);
  }
  const m = metricById(catalog, operand.metric);
  if (!m) return operand.metric;
  const name = m.short ?? m.label;
  return m.params.length ? `${name}(${operand.period ?? m.params[0].default})` : name;
}

export function conditionText(catalog, c) {
  const unitMetric = c.left.type === 'metric' ? c.left.metric : c.right.metric;
  const op = catalog.operators.find((o) => o.id === c.op)?.label ?? c.op;
  return `${operandText(catalog, c.left, unitMetric)} ${op} ${operandText(catalog, c.right, unitMetric)}`;
}

export function groupText(catalog, group, emptyText) {
  if (!group?.conditions?.length) return emptyText;
  return group.conditions.map((c) => conditionText(catalog, c)).join(group.mode === 'any' ? ' OR ' : ' AND ');
}

const money = (n) => `$${Number(n).toLocaleString('en-US')}`;

export function actionText(action) {
  const verb = { buy: 'Buy', sell: 'Sell', short: 'Short', cover: 'Cover' }[action.type];
  const a = action.amount;
  switch (action.sizing) {
    case 'shares':
      return `${verb} ${a} shares`;
    case 'dollars':
      return `${verb} ${money(a)}`;
    case 'pct_cash':
      return `${verb} using ${a}% of buying power`;
    case 'pct_equity':
      return `${verb} ${a}% of portfolio value`;
    case 'pct_position':
      return `${verb} ${a}% of the position`;
    case 'all':
      return action.type === 'cover' ? 'Cover the entire short' : `${verb} the entire position`;
    default:
      return verb;
  }
}

export function universeText(catalog, u) {
  if (u.source === 'list') {
    const s = u.symbols ?? [];
    if (!s.length) return 'no stocks yet';
    return s.length <= 4 ? s.join(', ') : `${s.slice(0, 3).join(', ')} and ${s.length - 3} more`;
  }
  if (u.source === 'screener') return `the top ${u.count ?? 15} stocks on the live "${catalog.screeners[u.screener] ?? u.screener}" screener`;
  if (u.source === 'watchlist') return 'the stocks on your watchlist';
  return 'every stock currently held in the portfolio';
}

export function describeConfig(catalog, config) {
  const lines = [];
  lines.push(`Checks ${universeText(catalog, config.universe)} using ${catalog.intervals[config.interval]?.toLowerCase() ?? config.interval} bars.`);
  if (config.universe.filters?.conditions?.length) {
    lines.push(`Only considers stocks where ${groupText(catalog, config.universe.filters)}.`);
  }
  config.rules.forEach((r, i) => {
    lines.push(`Rule ${i + 1} (${r.name}): when ${groupText(catalog, r.when, 'on every bar')} → ${actionText(r.action)}.`);
  });
  const l = config.limits;
  const safety = [
    l.stopLossPct > 0 && `stop-loss at −${l.stopLossPct}%`,
    l.takeProfitPct > 0 && `take-profit at +${l.takeProfitPct}%`,
    `at most ${l.maxPositions} positions`,
    l.maxPositionPct < 100 && `each at most ${l.maxPositionPct}% of the portfolio`,
    l.cooldownBars > 0 && `waits ${l.cooldownBars} bars between trades in a stock`,
  ].filter(Boolean);
  lines.push(`Limits: ${safety.join(', ')}.`);
  return lines;
}

let ruleCounter = 0;
export const newRuleId = () => `r${Date.now().toString(36)}${(ruleCounter++).toString(36)}`;

export function blankConfig(catalog) {
  return {
    name: '',
    interval: '1d',
    universe: { source: 'list', symbols: [], screener: 'day_gainers', count: 15, filters: { mode: 'all', conditions: [] } },
    rules: [newRule()],
    limits: { ...catalog.defaultLimits },
  };
}

export function newRule(n = 1) {
  return {
    id: newRuleId(),
    name: n === 1 ? 'Entry' : `Rule ${n}`,
    when: { mode: 'all', conditions: [newCondition()] },
    action: { type: 'buy', sizing: 'pct_equity', amount: 10 },
  };
}

export function newCondition() {
  return { left: { type: 'metric', metric: 'price' }, op: 'gt', right: { type: 'value', value: 100 } };
}

// Templates come from the server; give their rules fresh ids so edits never collide.
export function configFromTemplate(template) {
  const config = structuredClone(template.config);
  config.name = template.name;
  config.universe = { screener: 'day_gainers', count: 15, symbols: [], ...config.universe };
  return config;
}

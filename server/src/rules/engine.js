// Evaluates a rule-based bot against one stock at one bar and decides what (if
// anything) to do. Shared by live bots, the preview scan and the backtester.

import { METRICS, OPERATORS, evaluateOperand, operandLabel, formatValue } from './metrics.js';
import { roundQty, SHORT_MARGIN } from '../accounting.js';

function describeOperand(operand, value, unitMetric) {
  if (operand.type === 'value') return formatValue(unitMetric, operand.value);
  return `${operandLabel(operand)}: ${formatValue(operand.metric, value)}`;
}

export function evaluateCondition(cond, ctx) {
  const op = OPERATORS[cond.op];
  const a = evaluateOperand(cond.left, ctx, ctx.end);
  const b = evaluateOperand(cond.right, ctx, ctx.end);
  let pass = false;
  if (a != null && b != null) {
    if (op.cross) {
      const a0 = evaluateOperand(cond.left, ctx, ctx.end - 1);
      const b0 = evaluateOperand(cond.right, ctx, ctx.end - 1);
      if (a0 != null && b0 != null) {
        pass = cond.op === 'crosses_above' ? a0 <= b0 && a > b : a0 >= b0 && a < b;
      }
    } else {
      pass = op.test(a, b);
    }
  }
  const unitMetric = cond.left.type === 'metric' ? cond.left.metric : cond.right.metric;
  const left = describeOperand(cond.left, a, unitMetric);
  const right = describeOperand(cond.right, b, unitMetric);
  return { pass, text: `${left} ${op.label} ${right}` };
}

export function evaluateGroup(group, ctx) {
  const results = (group?.conditions ?? []).map((c) => evaluateCondition(c, ctx));
  const pass = results.length === 0 ? true : group.mode === 'any' ? results.some((r) => r.pass) : results.every((r) => r.pass);
  return { pass, results };
}

export function positionPnlPct(position, price) {
  const { qty, avgCost } = position;
  if (!qty || !avgCost) return null;
  return qty > 0 ? (price / avgCost - 1) * 100 : (avgCost / price - 1) * 100;
}

// Built-in stop-loss / take-profit, applied before any rule.
export function checkSafetyExits(limits, position, price) {
  const pnl = positionPnlPct(position, price);
  if (pnl == null) return null;
  const side = position.qty > 0 ? 'sell' : 'cover';
  const qty = Math.abs(position.qty);
  if (limits.stopLossPct > 0 && pnl <= -limits.stopLossPct) {
    return { side, qty, reason: `Stop-loss: position ${pnl.toFixed(2)}% (limit -${limits.stopLossPct}%)` };
  }
  if (limits.takeProfitPct > 0 && pnl >= limits.takeProfitPct) {
    return { side, qty, reason: `Take-profit: position +${pnl.toFixed(2)}% (target ${limits.takeProfitPct}%)` };
  }
  return null;
}

/**
 * Turn an action into a share quantity, respecting position direction, the
 * bot's limits and the account's buying power.
 * account = { equity, buyingPower, openPositions }
 */
export function sizeAction(action, { price, position, account, limits, commission = 0 }) {
  const { type, sizing, amount } = action;
  const q = position.qty;
  if (type === 'buy' && q < 0) return { error: 'Bot is short this stock — cover first' };
  if (type === 'short' && q > 0) return { error: 'Bot is long this stock — sell first' };
  if (type === 'sell' && !(q > 0)) return { error: 'No long position to sell' };
  if (type === 'cover' && !(q < 0)) return { error: 'No short position to cover' };

  if (type === 'sell' || type === 'cover') {
    const held = Math.abs(q);
    const want = sizing === 'all' ? held : sizing === 'pct_position' ? (held * amount) / 100 : amount;
    const qty = roundQty(Math.min(want, held));
    return qty > 0 ? { qty } : { error: 'Order size rounds to zero shares' };
  }

  if (q === 0 && account.openPositions >= limits.maxPositions) {
    return { error: `Already holding the maximum of ${limits.maxPositions} positions` };
  }
  const roomInPosition = (account.equity * limits.maxPositionPct) / 100 - Math.abs(q) * price;
  if (roomInPosition <= 0) return { error: `Position already at the ${limits.maxPositionPct}%-of-equity limit` };
  const affordable = type === 'buy' ? account.buyingPower - commission : (account.buyingPower - commission) / SHORT_MARGIN;
  if (affordable <= 0) return { error: 'Not enough buying power' };
  const capQty = Math.min(roomInPosition, affordable) / price;

  let qty;
  if (sizing === 'shares') qty = amount;
  else if (sizing === 'dollars') qty = amount / price;
  else if (sizing === 'pct_cash') qty = (Math.max(0, account.buyingPower) * amount) / 100 / price;
  else qty = (account.equity * amount) / 100 / price; // pct_equity
  qty = roundQty(Math.min(qty, capQty));
  return qty > 0 ? { qty } : { error: 'Order size rounds to zero shares' };
}

/**
 * Evaluate one stock for one bot at bar `end` and return a full breakdown plus
 * the order to place (intent), if any.
 */
export function evaluateSymbol({
  config,
  symbol,
  candles,
  end = candles.length - 1,
  fundamentals,
  position = { qty: 0, avgCost: 0, openedAt: null },
  lastTradeTime = null,
  firedRules = {},
  account,
  barsPerYear,
  commission = 0,
}) {
  const ctx = { candles, end, fundamentals, position, lastTradeTime, barsPerYear };
  const price = candles[end].close;
  const barTime = candles[end].time;
  const out = { symbol, price, held: position.qty, filters: null, rules: [], intent: null, note: null };

  const safety = checkSafetyExits(config.limits, position, price);
  if (safety) {
    out.intent = safety;
    out.note = safety.reason;
    return out;
  }

  // Stocks the bot already holds skip the universe filters so their exit rules always run.
  if (position.qty === 0 && config.universe.filters?.conditions?.length) {
    out.filters = evaluateGroup(config.universe.filters, ctx);
    if (!out.filters.pass) {
      out.note = 'Excluded by stock filters';
      return out;
    }
  }

  const cooldown = config.limits.cooldownBars;
  const cooling = cooldown > 0 && METRICS.bars_since_trade.fn(ctx, end) < cooldown;

  for (const rule of config.rules) {
    const res = evaluateGroup(rule.when, ctx);
    const entry = { id: rule.id, name: rule.name, pass: res.pass, conditions: res.results, skipped: null, fired: false };
    out.rules.push(entry);
    if (!res.pass || out.intent) continue; // keep evaluating so the UI can show every rule's state
    if (cooling) {
      entry.skipped = `Cooling down (${cooldown} bars after each trade)`;
      continue;
    }
    if (firedRules[rule.id] === barTime) {
      entry.skipped = 'Already acted on this bar';
      continue;
    }
    const sized = sizeAction(rule.action, { price, position, account, limits: config.limits, commission });
    if (sized.error) {
      entry.skipped = sized.error;
      continue;
    }
    const why = res.results.filter((r) => r.pass).map((r) => r.text).join(', ');
    out.intent = { side: rule.action.type, qty: sized.qty, reason: `${rule.name}${why ? ` (${why})` : ''}`, ruleId: rule.id };
    entry.fired = true;
  }
  if (!out.intent && !out.note) out.note = out.rules.some((r) => r.skipped) ? 'Rule matched but was skipped' : 'Waiting: no rule conditions met';
  return out;
}

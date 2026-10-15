// Turns a strategy decision into a concrete order (quantity), applying the shared
// risk overlay (stop-loss / take-profit) and position sizing.

import { STRATEGIES } from './strategies.js';
import { roundQty } from './accounting.js';

// Returns a sell intent if the stop-loss or take-profit level has been reached.
export function checkRisk(params, position, price) {
  if (!(position.qty > 0) || !(position.avgCost > 0)) return null;
  const movePct = ((price - position.avgCost) / position.avgCost) * 100;
  if (params.stopLossPct > 0 && movePct <= -params.stopLossPct) {
    return { side: 'sell', qty: position.qty, reason: `Stop-loss: ${movePct.toFixed(2)}% from entry` };
  }
  if (params.takeProfitPct > 0 && movePct >= params.takeProfitPct) {
    return { side: 'sell', qty: position.qty, reason: `Take-profit: +${movePct.toFixed(2)}% from entry` };
  }
  return null;
}

/**
 * Run one strategy step.
 * @param {object} args
 * @param {string} args.strategyId
 * @param {object} args.params    resolved params (see resolveParams)
 * @param {object} args.state     mutable per-bot state persisted between steps
 * @param {Array}  args.candles   completed bars, oldest first
 * @param {number} args.price     price the order would execute at
 * @param {{qty:number, avgCost:number}} args.position  the strategy's own position
 * @param {number} args.cash      cash available to buy with
 * @param {number} [args.commission]
 * @returns {{side, qty, reason} | null}
 */
export function runStep({ strategyId, params, state, candles, price, position, cash, commission = 0 }) {
  const risk = checkRisk(params, position, price);
  if (risk) return risk;

  const strategy = STRATEGIES[strategyId];
  const decision = strategy.decide({
    candles,
    closes: candles.map((c) => c.close),
    price,
    position,
    cash,
    params,
    state,
  });
  if (!decision) return null;

  if (decision.side === 'buy') {
    const budget = decision.dollars ?? (cash * params.allocationPct) / 100;
    const spend = Math.min(budget, cash - commission);
    const qty = roundQty(spend / price);
    if (!(qty > 0)) return null; // not enough cash
    return { side: 'buy', qty, reason: decision.reason };
  }

  if (decision.side === 'sell') {
    const qty = roundQty(Math.min(decision.qty ?? position.qty, position.qty));
    if (!(qty > 0)) return null;
    return { side: 'sell', qty, reason: decision.reason };
  }
  return null;
}

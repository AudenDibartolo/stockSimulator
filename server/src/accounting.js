// Pure portfolio bookkeeping, shared by the live broker and the backtester.
//
// Positions use signed quantities: qty > 0 is long, qty < 0 is short. Short
// sales credit the proceeds to cash, but follow Reg-T style margin rules:
//   - initial margin: proceeds plus 50% of the short's value are locked up,
//     so buying power = cash − 1.5 × (market value of shorts)
//   - maintenance: if equity falls below 30% of the shorts' value, they are
//     force-covered (a margin call).

export const roundQty = (q) => Math.floor(q * 1e4 + 1e-6) / 1e4; // 4 decimal places, never rounds up
export const roundMoney = (m) => Math.round(m * 100) / 100;

export const SHORT_MARGIN = 0.5; // extra collateral required on top of short proceeds
export const SHORT_MAINTENANCE = 0.3;

export class TradeError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

export function newPortfolioState(startingCash) {
  return { cash: startingCash, positions: {}, realizedPnl: 0 };
}

const priceOf = (portfolio, prices, symbol) => prices?.[symbol] ?? portfolio.positions[symbol]?.avgCost ?? 0;

export function accountSnapshot(portfolio, prices = {}) {
  let longValue = 0;
  let shortValue = 0;
  for (const [symbol, pos] of Object.entries(portfolio.positions)) {
    const v = pos.qty * priceOf(portfolio, prices, symbol);
    if (v >= 0) longValue += v;
    else shortValue -= v;
  }
  const equity = portfolio.cash + longValue - shortValue;
  return {
    cash: portfolio.cash,
    longValue,
    shortValue,
    equity,
    buyingPower: portfolio.cash - (1 + SHORT_MARGIN) * shortValue,
  };
}

export function marketValue(portfolio, prices) {
  return accountSnapshot(portfolio, prices).equity;
}

export function marginCallNeeded(portfolio, prices) {
  const { shortValue, equity } = accountSnapshot(portfolio, prices);
  return shortValue > 0 && equity < SHORT_MAINTENANCE * shortValue;
}

/**
 * Mutates `portfolio` ({ cash, positions, realizedPnl }) to reflect a fill.
 * side: 'buy' | 'sell' (long positions) or 'short' | 'cover' (short positions).
 * `prices` (symbol -> price) is used to value other short positions for the
 * buying-power check; it defaults to average cost.
 */
export function applyFill(portfolio, { symbol, side, qty, price, commission = 0, prices }) {
  if (!(qty > 0)) throw new TradeError('Quantity must be greater than zero');
  if (!(price > 0)) throw new TradeError('Invalid price');
  const pos = portfolio.positions[symbol] ?? { qty: 0, avgCost: 0 };
  const gross = roundMoney(qty * price);
  const valuation = { ...prices, [symbol]: price };
  let realizedPnl = 0;

  if (side === 'buy' || side === 'short') {
    if (side === 'buy' && pos.qty < 0) throw new TradeError(`You are short ${symbol}; cover the short before buying`);
    if (side === 'short' && pos.qty > 0) throw new TradeError(`You own ${symbol}; sell it before shorting`);
    const { buyingPower } = accountSnapshot(portfolio, valuation);
    if (side === 'buy' && gross + commission > buyingPower + 1e-6) {
      throw new TradeError(`Insufficient buying power: need $${(gross + commission).toFixed(2)}, have $${Math.max(0, buyingPower).toFixed(2)}`);
    }
    if (side === 'short' && SHORT_MARGIN * gross + commission > buyingPower + 1e-6) {
      throw new TradeError(
        `Insufficient buying power to short: need $${(SHORT_MARGIN * gross + commission).toFixed(2)} margin, have $${Math.max(0, buyingPower).toFixed(2)}`,
      );
    }
    const held = Math.abs(pos.qty);
    pos.avgCost = (held * pos.avgCost + gross) / (held + qty);
    pos.qty = side === 'buy' ? roundQty(pos.qty + qty) : -roundQty(held + qty);
    portfolio.positions[symbol] = pos;
    portfolio.cash = roundMoney(portfolio.cash + (side === 'buy' ? -gross : gross) - commission);
  } else if (side === 'sell' || side === 'cover') {
    const isSell = side === 'sell';
    const held = isSell ? Math.max(pos.qty, 0) : Math.max(-pos.qty, 0);
    if (held === 0) {
      throw new TradeError(isSell ? `No ${symbol} shares to sell (use Short to sell shares you don't own)` : `No short position in ${symbol} to cover`);
    }
    if (qty > held + 1e-9) throw new TradeError(`Cannot ${side} ${qty} ${symbol}: position is only ${held} shares`);
    realizedPnl = roundMoney((isSell ? price - pos.avgCost : pos.avgCost - price) * qty - commission);
    const remaining = roundQty(held - qty);
    if (remaining <= 0) delete portfolio.positions[symbol];
    else portfolio.positions[symbol] = { ...pos, qty: isSell ? remaining : -remaining };
    portfolio.cash = roundMoney(portfolio.cash + (isSell ? gross : -gross) - commission);
    portfolio.realizedPnl = roundMoney((portfolio.realizedPnl ?? 0) + realizedPnl);
  } else {
    throw new TradeError(`Invalid side "${side}"`);
  }
  return { gross, commission, realizedPnl };
}

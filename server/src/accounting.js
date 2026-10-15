// Pure portfolio bookkeeping, shared by the live broker and the backtester.

export const roundQty = (q) => Math.floor(q * 1e4 + 1e-6) / 1e4; // 4 decimal places, never rounds up
export const roundMoney = (m) => Math.round(m * 100) / 100;

export class TradeError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

export function newPortfolioState(startingCash) {
  return { cash: startingCash, positions: {}, realizedPnl: 0 };
}

// Mutates `portfolio` ({ cash, positions, realizedPnl }) to reflect a fill.
export function applyFill(portfolio, { symbol, side, qty, price, commission = 0 }) {
  if (!(qty > 0)) throw new TradeError('Quantity must be greater than zero');
  if (!(price > 0)) throw new TradeError('Invalid price');
  const pos = portfolio.positions[symbol] ?? { qty: 0, avgCost: 0 };
  const gross = roundMoney(qty * price);

  if (side === 'buy') {
    const cost = gross + commission;
    if (cost > portfolio.cash + 1e-6) {
      throw new TradeError(`Insufficient cash: need $${cost.toFixed(2)}, have $${portfolio.cash.toFixed(2)}`);
    }
    pos.avgCost = (pos.qty * pos.avgCost + gross) / (pos.qty + qty);
    pos.qty = roundQty(pos.qty + qty);
    portfolio.positions[symbol] = pos;
    portfolio.cash = roundMoney(portfolio.cash - cost);
    return { gross, commission, realizedPnl: 0 };
  }

  if (side === 'sell') {
    if (qty > pos.qty + 1e-9) {
      throw new TradeError(`Cannot sell ${qty} ${symbol}: only ${pos.qty} held (short selling is not supported)`);
    }
    const realizedPnl = roundMoney((price - pos.avgCost) * qty - commission);
    pos.qty = roundQty(pos.qty - qty);
    if (pos.qty <= 0) delete portfolio.positions[symbol];
    else portfolio.positions[symbol] = pos;
    portfolio.cash = roundMoney(portfolio.cash + gross - commission);
    portfolio.realizedPnl = roundMoney((portfolio.realizedPnl ?? 0) + realizedPnl);
    return { gross, commission, realizedPnl };
  }

  throw new TradeError(`Invalid side "${side}"`);
}

export function marketValue(portfolio, prices) {
  let value = portfolio.cash;
  for (const [symbol, pos] of Object.entries(portfolio.positions)) {
    value += pos.qty * (prices[symbol] ?? pos.avgCost);
  }
  return value;
}

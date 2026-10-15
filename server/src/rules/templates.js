// Ready-made bots. Each one is an ordinary rule-based config, so users can load
// a template into the builder, read how it works, and change anything.

const m = (metric, p) => ({ type: 'metric', metric, ...(p != null ? { period: p } : {}) });
const v = (value) => ({ type: 'value', value });
const c = (left, op, right) => ({ left, op, right });
const all = (...conditions) => ({ mode: 'all', conditions });
const rule = (id, name, when, action) => ({ id, name, when, action });
const FLAT = c(m('position_qty'), 'eq', v(0));
const LONG = c(m('position_qty'), 'gt', v(0));
const SHORT = c(m('position_qty'), 'lt', v(0));
const SELL_ALL = { type: 'sell', sizing: 'all', amount: 0 };
const COVER_ALL = { type: 'cover', sizing: 'all', amount: 0 };

export const SYMBOL_LISTS = [
  { id: 'megacap', name: 'Mega-cap tech', symbols: ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AVGO'] },
  {
    id: 'dow30',
    name: 'Dow Jones 30',
    symbols: [
      'AAPL', 'AMGN', 'AMZN', 'AXP', 'BA', 'CAT', 'CRM', 'CSCO', 'CVX', 'DIS', 'GS', 'HD', 'HON', 'IBM', 'JNJ',
      'JPM', 'KO', 'MCD', 'MMM', 'MRK', 'MSFT', 'NKE', 'NVDA', 'PG', 'SHW', 'TRV', 'UNH', 'V', 'VZ', 'WMT',
    ],
  },
  { id: 'sectors', name: 'S&P sector ETFs', symbols: ['XLK', 'XLF', 'XLE', 'XLV', 'XLY', 'XLP', 'XLI', 'XLB', 'XLU', 'XLRE', 'XLC'] },
  { id: 'indexes', name: 'Index ETFs', symbols: ['SPY', 'QQQ', 'DIA', 'IWM', 'VTI'] },
  { id: 'dividend', name: 'Dividend stalwarts', symbols: ['KO', 'PEP', 'PG', 'JNJ', 'MCD', 'XOM', 'CVX', 'VZ', 'ABBV', 'MMM', 'T', 'IBM'] },
];

const list = (id) => SYMBOL_LISTS.find((l) => l.id === id).symbols;

export const TEMPLATES = [
  {
    id: 'dca',
    name: 'Dollar-cost averaging',
    category: 'Long-term investing',
    summary: 'Invest a fixed dollar amount on a regular schedule, no matter what the price is.',
    howItWorks:
      'Every N bars the bot buys a fixed dollar amount of each stock. When prices are low your money buys more shares, and when they are high it buys fewer, so your average cost smooths out over time. It never sells on its own.',
    goodFor: 'Building a long-term position in a broad index fund without trying to time the market.',
    watchOutFor:
      'It keeps buying all the way down in a long bear market, and it will run out of cash eventually. Make sure the amount × frequency fits your portfolio size.',
    tips: 'Use 1-day bars and a broad ETF like SPY or VTI. "Bars since last trade ≥ 5" means about once a week.',
    config: {
      interval: '1d',
      universe: { source: 'list', symbols: ['SPY'], filters: all() },
      rules: [rule('buy', 'Scheduled buy', all(c(m('bars_since_trade'), 'gte', v(5))), { type: 'buy', sizing: 'dollars', amount: 500 })],
      limits: { stopLossPct: 0, takeProfitPct: 0, maxPositions: 10, maxPositionPct: 100, cooldownBars: 0 },
    },
  },
  {
    id: 'sma',
    name: 'Moving-average crossover',
    category: 'Trend following',
    summary: 'Buy when a short-term average rises above a long-term one (a "golden cross"), and sell when it falls back below.',
    howItWorks:
      'A moving average smooths out daily noise. When the fast 10-bar average crosses above the slow 30-bar average, recent prices are outpacing the longer trend, which suggests an uptrend is starting, so the bot buys. When the fast average crosses back below the slow one, the trend has weakened and the bot sells.',
    goodFor: 'Markets with long, sustained trends. It catches most of a big move and avoids much of a long decline.',
    watchOutFor:
      'Choppy, sideways markets cause "whipsaws": repeated buy-then-sell-at-a-loss signals. Crossovers also lag, so you always enter after the move has started and exit after it has turned.',
    tips: 'Longer periods (e.g. 50/200) trade less and whipsaw less but react more slowly. Each position is capped at 20% of the portfolio so the bot can hold up to 5 stocks.',
    config: {
      interval: '1d',
      universe: { source: 'list', symbols: list('megacap'), filters: all() },
      rules: [
        rule('enter', 'Golden cross: buy', all(c(m('sma', 10), 'crosses_above', m('sma', 30)), FLAT), { type: 'buy', sizing: 'pct_equity', amount: 20 }),
        rule('exit', 'Death cross: sell', all(c(m('sma', 10), 'crosses_below', m('sma', 30)), LONG), SELL_ALL),
      ],
      limits: { stopLossPct: 0, takeProfitPct: 0, maxPositions: 5, maxPositionPct: 20, cooldownBars: 0 },
    },
  },
  {
    id: 'rsi',
    name: 'RSI mean reversion',
    category: 'Mean reversion',
    summary: 'Buy quality stocks after a sharp short-term drop, and sell once they bounce.',
    howItWorks:
      'RSI (Relative Strength Index) measures how fast price has moved recently on a 0–100 scale. Below 30 means the stock has fallen unusually fast ("oversold"), and such drops often partly reverse. The stock filter only allows stocks trading above their 200-day average, so the bot buys dips in uptrends rather than catching falling knives. It sells when RSI recovers above 65, or after 20 bars if the bounce never comes.',
    goodFor: 'Large, stable companies that tend to recover from short-term selloffs. It usually has a high win rate with modest gains per trade.',
    watchOutFor:
      'A stock that is falling for a real reason (bad earnings, fraud) can keep going down. The 8% stop-loss limits the damage, but losses can be larger than the typical gain.',
    tips: 'Stricter entry levels (e.g. RSI < 25) give fewer but stronger signals. Try backtesting on the Dow 30 over 5 years.',
    config: {
      interval: '1d',
      universe: { source: 'list', symbols: list('dow30'), filters: all(c(m('price_vs_sma_pct', 200), 'gt', v(0))) },
      rules: [
        rule('enter', 'Oversold: buy', all(c(m('rsi', 14), 'lt', v(30)), FLAT), { type: 'buy', sizing: 'pct_equity', amount: 10 }),
        rule('exit', 'Recovered: sell', all(c(m('rsi', 14), 'gt', v(65)), LONG), SELL_ALL),
        rule('time', 'Time stop: sell', all(c(m('bars_held'), 'gte', v(20))), SELL_ALL),
      ],
      limits: { stopLossPct: 8, takeProfitPct: 0, maxPositions: 10, maxPositionPct: 10, cooldownBars: 0 },
    },
  },
  {
    id: 'breakout',
    name: 'Channel breakout ("turtle")',
    category: 'Momentum',
    summary: 'Buy when price breaks above its recent range, and sell when it breaks below a shorter-term low.',
    howItWorks:
      'The bot tracks the highest high of the last 20 bars. When price closes above it, the stock is breaking out of its range, and breakouts often continue, so the bot buys. It exits when price drops below the lowest low of the last 10 bars. This is the core of the famous 1980s "Turtle Traders" system.',
    goodFor: 'Catching big trends early, for example in sector rotation, commodities or strong-momentum stocks.',
    watchOutFor: 'Many breakouts fail ("false breakouts"), so expect a low win rate. The strategy depends on a few big winners paying for many small losses.',
    tips: 'Applied to sector ETFs, it naturally rotates into whichever sectors are leading.',
    config: {
      interval: '1d',
      universe: { source: 'list', symbols: list('sectors'), filters: all() },
      rules: [
        rule('enter', 'Breakout: buy', all(c(m('price'), 'gt', m('high_n', 20)), FLAT), { type: 'buy', sizing: 'pct_equity', amount: 15 }),
        rule('exit', 'Breakdown: sell', all(c(m('price'), 'lt', m('low_n', 10)), LONG), SELL_ALL),
      ],
      limits: { stopLossPct: 0, takeProfitPct: 0, maxPositions: 6, maxPositionPct: 15, cooldownBars: 0 },
    },
  },
  {
    id: 'screener-momentum',
    name: 'Screener momentum (day trading)',
    category: 'Momentum',
    summary: "Scan today's top gainers for stocks that are still accelerating on heavy volume, ride the move, and get out the same day.",
    howItWorks:
      'Every 15 minutes the bot pulls Yahoo\'s live "Day Gainers" screener. The filters drop penny stocks, illiquid names and tiny companies. It buys a stock that rose more than 2% in the last hour on at least 1.5× normal volume, which is a sign that buyers are still piling in. It sells when price crosses below its 20-bar EMA (momentum fading), after about one trading day, or at the +8% take-profit or −4% stop-loss.',
    goodFor: 'Showing how dynamic stock selection works: the stocks the bot considers change throughout the day.',
    watchOutFor:
      'Top gainers are very volatile and can reverse sharply. Backtests of screener sources use today\'s screener list, which biases them toward stocks that already went up, so treat those results with skepticism.',
    tips: 'Run it during market hours and watch the preview scan to see each candidate evaluated.',
    config: {
      interval: '15m',
      universe: {
        source: 'screener',
        screener: 'day_gainers',
        count: 25,
        filters: all(c(m('price'), 'gte', v(5)), c(m('avg_volume', 20), 'gte', v(50000)), c(m('market_cap'), 'gte', v(2))),
      },
      rules: [
        rule('enter', 'Accelerating: buy', all(c(m('change_pct', 4), 'gt', v(2)), c(m('rel_volume', 20), 'gt', v(1.5)), FLAT), {
          type: 'buy',
          sizing: 'pct_equity',
          amount: 10,
        }),
        rule('fade', 'Momentum fading: sell', all(c(m('price'), 'crosses_below', m('ema', 20)), LONG), SELL_ALL),
        rule('time', 'End of day: sell', all(c(m('bars_held'), 'gte', v(26))), SELL_ALL),
      ],
      limits: { stopLossPct: 4, takeProfitPct: 8, maxPositions: 5, maxPositionPct: 15, cooldownBars: 4 },
    },
  },
  {
    id: 'short-spikes',
    name: 'Short overbought spikes',
    category: 'Short selling',
    summary: 'Bet against stocks that have run up too far, too fast, and cover when they cool off.',
    howItWorks:
      'Shorting means borrowing shares and selling them now, hoping to buy them back ("cover") cheaper later. The bot shorts when RSI is above 75 and price is more than 8% above its 20-bar average, a sign the stock is stretched. It covers when RSI falls back below 50, or after 15 bars.',
    goodFor: 'Making money in falling or overextended markets, and learning how shorting and margin work.',
    watchOutFor:
      'A short has unlimited loss potential because a stock can keep rising. Strong stocks can stay "overbought" for a long time. The simulator requires 150% collateral and force-covers shorts if your equity falls below 30% of their value (a margin call). Keep the stop-loss on.',
    tips: 'Pair it with a long strategy in a separate portfolio to compare results on the Leaderboard.',
    config: {
      interval: '1d',
      universe: { source: 'list', symbols: list('megacap'), filters: all() },
      rules: [
        rule('enter', 'Overextended: short', all(c(m('rsi', 14), 'gt', v(75)), c(m('price_vs_sma_pct', 20), 'gt', v(8)), FLAT), {
          type: 'short',
          sizing: 'pct_equity',
          amount: 10,
        }),
        rule('exit', 'Cooled off: cover', all(c(m('rsi', 14), 'lt', v(50)), SHORT), COVER_ALL),
        rule('time', 'Time stop: cover', all(c(m('bars_held'), 'gte', v(15)), SHORT), COVER_ALL),
      ],
      limits: { stopLossPct: 10, takeProfitPct: 0, maxPositions: 4, maxPositionPct: 10, cooldownBars: 0 },
    },
  },
  {
    id: 'calm-dips',
    name: 'Buy dips in calm stocks',
    category: 'Volatility',
    summary: 'Use the volatility score to find steady stocks, then buy them when they have an unusually large drop.',
    howItWorks:
      'The filter keeps only stocks whose annualized volatility over the last 60 days is below 25%, meaning they normally move very little. For a stock like that, a 4% drop in a week is unusual and often temporary, so the bot buys. It sells at a 4% profit, or after 20 bars, with an 8% stop-loss as a safety net.',
    goodFor: 'Conservative, dividend-paying companies. It shows how a volatility score can decide which stocks are eligible.',
    watchOutFor: 'Sometimes a calm stock drops because something fundamental changed. The trade-off of this strategy is a high win rate with small wins.',
    tips: 'Raise the volatility cap to include more stocks, or lower the dip threshold to trade more often.',
    config: {
      interval: '1d',
      universe: { source: 'list', symbols: list('dividend'), filters: all(c(m('volatility', 60), 'lt', v(25))) },
      rules: [
        rule('enter', 'Unusual dip: buy', all(c(m('change_pct', 5), 'lt', v(-4)), FLAT), { type: 'buy', sizing: 'pct_equity', amount: 10 }),
        rule('profit', 'Bounce: sell', all(c(m('position_pnl_pct'), 'gte', v(4))), SELL_ALL),
        rule('time', 'Time stop: sell', all(c(m('bars_held'), 'gte', v(20))), SELL_ALL),
      ],
      limits: { stopLossPct: 8, takeProfitPct: 0, maxPositions: 8, maxPositionPct: 12, cooldownBars: 0 },
    },
  },
];

// Bots created before the rule engine existed stored { strategy, symbol, params }.
export function legacyBotToConfig(bot) {
  const p = bot.params ?? {};
  const size = { type: 'buy', sizing: 'pct_cash', amount: p.allocationPct ?? 100 };
  const rulesByStrategy = {
    dca: [rule('buy', 'Scheduled buy', all(c(m('bars_since_trade'), 'gte', v(p.everyBars ?? 5))), { type: 'buy', sizing: 'dollars', amount: p.amount ?? 500 })],
    smaCrossover: [
      rule('enter', 'Golden cross: buy', all(c(m('sma', p.fast ?? 10), 'crosses_above', m('sma', p.slow ?? 30)), FLAT), size),
      rule('exit', 'Death cross: sell', all(c(m('sma', p.fast ?? 10), 'crosses_below', m('sma', p.slow ?? 30)), LONG), SELL_ALL),
    ],
    rsiReversion: [
      rule('enter', 'Oversold: buy', all(c(m('rsi', p.period ?? 14), 'lt', v(p.oversold ?? 30)), FLAT), size),
      rule('exit', 'Overbought: sell', all(c(m('rsi', p.period ?? 14), 'gt', v(p.overbought ?? 70)), LONG), SELL_ALL),
    ],
    breakout: [
      rule('enter', 'Breakout: buy', all(c(m('price'), 'gt', m('high_n', p.entryBars ?? 20)), FLAT), size),
      rule('exit', 'Breakdown: sell', all(c(m('price'), 'lt', m('low_n', p.exitBars ?? 10)), LONG), SELL_ALL),
    ],
  };
  return {
    name: bot.name,
    interval: bot.interval,
    universe: { source: 'list', symbols: [bot.symbol], filters: all() },
    rules: rulesByStrategy[bot.strategy] ?? rulesByStrategy.dca,
    limits: { stopLossPct: p.stopLossPct ?? 0, takeProfitPct: p.takeProfitPct ?? 0, maxPositions: 1, maxPositionPct: 100, cooldownBars: 0 },
  };
}


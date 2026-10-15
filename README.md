# StockSim

A paper-trading stock simulator that uses real, live market data. You trade with virtual money, either by hand or with automated strategy bots, and you can backtest strategies on historical prices before deploying them.

## Features

- **Live quotes** for any stock, ETF or index on Yahoo Finance, streamed to the browser every 10 seconds over Server-Sent Events. No API key is needed.
- **Trading**: buy, sell, **short** and **cover**, with market, limit and stop orders. Buy by share count or dollar amount (fractional shares), with an optional per-trade commission. Shorts follow Reg-T style margin: 150% collateral, with a forced cover if equity falls below 30% of the shorts' value.
- **Multiple portfolios**, each with its own starting cash. Portfolios can be reset or deleted.
- **Rule-based bots** that you build in three steps:
  1. **Which stocks**: a hand-picked list (or ready-made lists such as the Dow 30 or sector ETFs), a live Yahoo screener (Day Gainers, Most Active, Undervalued Large Caps, …), your watchlist, or the portfolio's current holdings. Optional filters narrow this down by characteristics such as price, volatility, volume, market cap or P/E.
  2. **When**: conditions that compare metrics with numbers or with each other (`>`, `<`, `=`, `crosses above/below`), combined with all/any. Metrics include price, % change over N bars, today's change, SMA/EMA, N-bar highs and lows, RSI, an annualized volatility score, ATR %, volume and relative volume, fundamentals, and the bot's own position (shares held, profit %, bars held, bars since last trade).
  3. **What**: buy, sell, short or cover, sized by shares, dollars, % of buying power, % of portfolio value or % of the position.

  Safety limits apply on top: stop-loss, take-profit, maximum open positions, maximum position size and a cooldown between trades. Bots check their rules every 30 seconds against live prices, and each rule acts at most once per bar per stock.
- **Templates**: seven ready-made bots, each with a full explanation (how it works, what it's good for, what to watch out for). They are dollar-cost averaging, moving-average crossover, RSI mean reversion, channel breakout, screener momentum, shorting overbought spikes, and buying dips in low-volatility stocks. Every template opens in the builder so you can change it.
- **Preview (dry run)**: runs a bot once against live data without trading. For each stock it shows which filters and conditions passed, with the actual values.
- **Backtester**: replays any bot over real history for every stock in its universe, sharing one cash balance. It reports CAGR, max drawdown, Sharpe ratio and win rate, compares against an equal-weight buy & hold, breaks results down per stock, and marks trades on a price chart. You can deploy a backtested bot live in one click.
- **Leaderboard** that compares your portfolios. Give each strategy its own portfolio to see which one performs best.

## Running it

Requires Node 18+.

```bash
npm install
npm run dev        # API on :3001, UI on http://localhost:5173
```

Production build (the API server also serves the UI):

```bash
npm run build
npm start          # http://localhost:3001
```

Tests: `npm test`

Data is stored in `server/data/db.json`. Set `DATA_FILE` to change the location and `PORT` to change the API port. For testing outside market hours, `FORCE_MARKET_OPEN=1 npm run dev` lets bots trade at the last price.

## Project layout

```
server/src/
  index.js        Express routes, SSE stream, background loops
  marketData.js   Yahoo Finance quotes/history/search with caching
  broker.js       Order placement, pending limit/stop orders, margin calls, valuation
  accounting.js   Pure fill/cash/P&L/margin bookkeeping (shared with the backtester)
  botRunner.js    Resolves each bot's stocks, loads live data, runs rules, places orders
  backtest.js     Multi-stock historical simulation and metrics
  rules/
    metrics.js    Every metric a condition can use
    engine.js     Evaluates filters/rules for one stock and sizes the resulting order
    validate.js   Validates bot configs from the client
    templates.js  Ready-made bots with explanations
    intervals.js  Bar sizes and history ranges
  store.js        JSON-file persistence
client/src/       React (Vite) UI; charts use TradingView lightweight-charts
```

## Extending the bot builder

- **New metric**: add an entry to `METRICS` in `server/src/rules/metrics.js` with a label, group, unit, params and a `fn(ctx, end, params)` that returns a number, or `null` when there isn't enough data. It appears in the builder automatically.
- **New template**: add a config to `TEMPLATES` in `server/src/rules/templates.js`. The test suite checks that every template validates.

## Notes and limitations

- Market data comes from Yahoo Finance's unofficial public API and may be delayed. If that API changes, only `marketData.js` needs updating.
- When the market is closed, manual market orders fill at the last price. Bots wait for the market to open.
- Screener backtests use today's screener members for the whole period, which biases them toward recent winners. The app shows a warning when this applies.
- Options are not supported. There is no borrow fee on shorts.
- This is a single-user app with no authentication.

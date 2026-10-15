# StockSim

A paper-trading stock simulator that uses real, live market data. You trade with virtual money, either by hand or with automated strategy bots, and you can backtest strategies on historical prices before deploying them.

## Features

- **Live quotes** for any stock, ETF or index on Yahoo Finance, streamed to the browser every 10 seconds over Server-Sent Events. No API key is needed.
- **Trading**: market, limit and stop orders; buy by share count or dollar amount (fractional shares); optional per-trade commission.
- **Multiple portfolios**, each with its own starting cash. Portfolios can be reset or deleted.
- **Strategy bots** that trade live while the market is open, using 5m, 15m, 1h or 1d bars:
  - Dollar-cost averaging
  - Moving-average crossover (trend following)
  - RSI mean reversion
  - Channel breakout (Donchian/"turtle" momentum)
  - Optional stop-loss, take-profit and position sizing for every strategy
- **Backtester** that replays the same strategy code over up to 10 years of history. It reports CAGR, max drawdown, Sharpe ratio and win rate, and compares the strategy with buy & hold. You can deploy a backtested strategy as a live bot in one click.
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

Data is stored in `server/data/db.json`. Set `DATA_FILE` to change the location and `PORT` to change the API port.

## Project layout

```
server/src/
  index.js        Express routes, SSE stream, background loops
  marketData.js   Yahoo Finance quotes/history/search with caching
  broker.js       Order placement, pending limit/stop orders, valuation
  accounting.js   Pure fill/cash/P&L bookkeeping (shared with the backtester)
  strategies.js   Strategy definitions and parameter validation
  engine.js       Turns strategy signals into sized orders; stop-loss/take-profit
  botRunner.js    Runs active bots on live data
  backtest.js     Historical simulation and metrics
  store.js        JSON-file persistence
client/src/       React (Vite) UI; charts use TradingView lightweight-charts
```

## Adding a strategy

Add an entry to `STRATEGIES` in `server/src/strategies.js` that has `params` and a `decide()` function. `decide()` receives the completed bars, the bot's current position and a persistent `state` object. It returns `{ side: 'buy' }`, `{ side: 'sell' }` or `null`. The UI, live bots and backtester pick up the new strategy automatically.

## Notes and limitations

- Market data comes from Yahoo Finance's unofficial public API and may be delayed. If that API changes, only `marketData.js` needs updating.
- When the market is closed, manual market orders fill at the last price. Bots wait for the market to open.
- Short selling and options are not supported.
- This is a single-user app with no authentication.

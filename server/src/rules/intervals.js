// Bar sizes bots and backtests can run on, with how much history to load for
// indicators and how many bars make up a trading year (for annualizing).
export const BOT_INTERVALS = {
  '5m': { label: '5-minute', range: '1mo', seconds: 300, barsPerYear: 252 * 78 },
  '15m': { label: '15-minute', range: '1mo', seconds: 900, barsPerYear: 252 * 26 },
  '1h': { label: 'Hourly', range: '6mo', seconds: 3600, barsPerYear: 252 * 7 },
  '1d': { label: 'Daily', range: '2y', seconds: 86400, barsPerYear: 252 },
};

// Historical periods available per bar size (limited by Yahoo's intraday history).
export const BACKTEST_RANGES = {
  '5m': ['5d', '1mo'],
  '15m': ['5d', '1mo'],
  '1h': ['1mo', '6mo', '1y', '2y'],
  '1d': ['6mo', '1y', '2y', '5y', '10y'],
};

export const barsPerYear = (interval) => BOT_INTERVALS[interval]?.barsPerYear ?? 252;

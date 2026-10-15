// Live market data from Yahoo Finance's public chart/search endpoints (no API key needed).
// Responses are cached briefly so many clients/bots don't hammer the upstream API.

const BASE = 'https://query1.finance.yahoo.com';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (StockSimulator)' };

const QUOTE_TTL_MS = 10_000;
const cache = new Map(); // key -> { expires, promise }

function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.promise;
  const promise = fn().catch((err) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, { expires: Date.now() + ttlMs, promise });
  return promise;
}

export class MarketDataError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

async function fetchJson(url) {
  let res;
  try {
    res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    throw new MarketDataError(`Market data request failed: ${err.message}`);
  }
  if (res.status === 404) throw new MarketDataError('Unknown symbol', 404);
  if (!res.ok) throw new MarketDataError(`Market data provider returned ${res.status}`);
  return res.json();
}

export function normalizeSymbol(symbol) {
  const s = String(symbol ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9.\-^=]{1,15}$/.test(s)) throw new MarketDataError(`Invalid symbol "${symbol}"`, 400);
  return s;
}

async function fetchChart(symbol, range, interval) {
  const url = `${BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;
  const json = await fetchJson(url);
  const result = json?.chart?.result?.[0];
  if (!result) {
    const msg = json?.chart?.error?.description || 'No data for symbol';
    throw new MarketDataError(msg, 404);
  }
  return result;
}

function toCandles(result) {
  const ts = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const candles = [];
  for (let i = 0; i < ts.length; i++) {
    const close = q.close?.[i];
    if (close == null) continue; // Yahoo pads gaps with nulls
    candles.push({
      time: ts[i],
      open: q.open?.[i] ?? close,
      high: q.high?.[i] ?? close,
      low: q.low?.[i] ?? close,
      close,
      volume: q.volume?.[i] ?? 0,
    });
  }
  return candles;
}

export function isMarketOpen(meta, nowSec = Date.now() / 1000) {
  const regular = meta?.currentTradingPeriod?.regular;
  return Boolean(regular && nowSec >= regular.start && nowSec < regular.end);
}

export function getQuote(symbol) {
  const sym = normalizeSymbol(symbol);
  return cached(`quote:${sym}`, QUOTE_TTL_MS, async () => {
    const result = await fetchChart(sym, '1d', '2m');
    const meta = result.meta;
    const price = meta.regularMarketPrice;
    if (price == null) throw new MarketDataError(`No price available for ${sym}`, 404);
    const previousClose = meta.previousClose ?? meta.chartPreviousClose ?? price;
    const change = price - previousClose;
    return {
      symbol: meta.symbol ?? sym,
      name: meta.longName || meta.shortName || sym,
      exchange: meta.fullExchangeName || meta.exchangeName,
      currency: meta.currency || 'USD',
      type: meta.instrumentType,
      price,
      previousClose,
      change,
      changePercent: previousClose ? (change / previousClose) * 100 : 0,
      dayHigh: meta.regularMarketDayHigh,
      dayLow: meta.regularMarketDayLow,
      volume: meta.regularMarketVolume,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
      marketTime: meta.regularMarketTime,
      marketOpen: isMarketOpen(meta),
      fetchedAt: Date.now(),
    };
  });
}

export async function getQuotes(symbols) {
  const unique = [...new Set(symbols.map(normalizeSymbol))];
  const settled = await Promise.allSettled(unique.map((s) => getQuote(s)));
  const quotes = {};
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') quotes[unique[i]] = r.value;
  });
  return quotes;
}

// Valid Yahoo range/interval combinations used by the app.
export const HISTORY_PRESETS = {
  '1d': { range: '1d', interval: '2m' },
  '5d': { range: '5d', interval: '15m' },
  '1mo': { range: '1mo', interval: '1h' },
  '6mo': { range: '6mo', interval: '1d' },
  '1y': { range: '1y', interval: '1d' },
  '5y': { range: '5y', interval: '1wk' },
};

const VALID_RANGES = new Set(['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max']);
const VALID_INTERVALS = new Set(['1m', '2m', '5m', '15m', '30m', '60m', '1h', '1d', '1wk', '1mo']);

export function getHistory(symbol, range = '1y', interval = '1d') {
  const sym = normalizeSymbol(symbol);
  if (!VALID_RANGES.has(range)) throw new MarketDataError(`Invalid range "${range}"`, 400);
  if (!VALID_INTERVALS.has(interval)) throw new MarketDataError(`Invalid interval "${interval}"`, 400);
  const intraday = /m$|h$/.test(interval);
  return cached(`hist:${sym}:${range}:${interval}`, intraday ? 30_000 : 10 * 60_000, async () => {
    const result = await fetchChart(sym, range, interval);
    return { symbol: sym, range, interval, candles: toCandles(result) };
  });
}

export function search(query) {
  const q = String(query ?? '').trim();
  if (!q) return Promise.resolve([]);
  return cached(`search:${q.toLowerCase()}`, 5 * 60_000, async () => {
    const url = `${BASE}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`;
    const json = await fetchJson(url);
    return (json.quotes ?? [])
      .filter((r) => ['EQUITY', 'ETF', 'INDEX', 'MUTUALFUND'].includes(r.quoteType))
      .map((r) => ({
        symbol: r.symbol,
        name: r.longname || r.shortname || r.symbol,
        exchange: r.exchDisp,
        type: r.typeDisp,
      }));
  });
}

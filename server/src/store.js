// Tiny JSON-file persistence layer. The whole database lives in memory and is
// written atomically (tmp file + rename) shortly after each change.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'db.json');

export const newId = () => crypto.randomUUID().slice(0, 8);

export function createPortfolio({ name, startingCash = 100_000, commission = 0 }) {
  return {
    id: newId(),
    name,
    startingCash,
    commission,
    cash: startingCash,
    realizedPnl: 0,
    positions: {}, // symbol -> { qty, avgCost }
    orders: [], // pending + historical limit/stop orders
    transactions: [],
    equityHistory: [], // { time, value } snapshots
    createdAt: Date.now(),
  };
}

function defaultDb() {
  return {
    portfolios: [createPortfolio({ name: 'Main' })],
    bots: [],
    watchlist: ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'SPY'],
  };
}

let db;
let saveTimer = null;

export function load() {
  try {
    db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`Could not read ${DATA_FILE}, starting fresh:`, err.message);
    db = defaultDb();
    flush();
  }
  return db;
}

export function getDb() {
  return db ?? load();
}

export function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(flush, 250);
}

export function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DATA_FILE);
}

export function findPortfolio(id) {
  const p = getDb().portfolios.find((x) => x.id === id);
  if (!p) throw Object.assign(new Error('Portfolio not found'), { status: 404 });
  return p;
}

export function findBot(id) {
  const b = getDb().bots.find((x) => x.id === id);
  if (!b) throw Object.assign(new Error('Bot not found'), { status: 404 });
  return b;
}

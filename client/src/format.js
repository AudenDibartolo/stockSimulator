const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });

export const money = (n) => (n == null || Number.isNaN(n) ? '—' : usd.format(n));
export const signedMoney = (n) => (n == null ? '—' : `${n >= 0 ? '+' : '−'}${usd.format(Math.abs(n))}`);
export const pct = (n, digits = 2) => (n == null || Number.isNaN(n) ? '—' : `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(digits)}%`);
export const qty = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 4 }));
export const big = (n) => (n == null ? '—' : compact.format(n));
export const tone = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : '');
export const dateTime = (ms) => new Date(ms).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
export const date = (sec) => new Date(sec * 1000).toLocaleDateString();

// Small SVG chart toolkit for the guide's illustrations. Everything is drawn
// from deterministic sample data so figures look the same on every visit.

export const C = {
  text: 'var(--text)',
  muted: 'var(--muted)',
  grid: 'var(--border)',
  panel: 'var(--panel-2)',
  up: 'var(--up)',
  down: 'var(--down)',
  accent: 'var(--accent)',
  amber: '#f59e0b',
  violet: '#a78bfa',
};

// ---- Sample data -------------------------------------------------------------

function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand) {
  let u = 0;
  let v = 0;
  while (!u) u = rand();
  while (!v) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Random-walk prices. `trend(t)` (t from 0 to 1) adds a % drift per bar to shape the path. */
export function walk(n, { seed = 1, start = 100, vol = 1, trend = () => 0 } = {}) {
  const rand = mulberry32(seed);
  const out = [start];
  for (let i = 1; i < n; i++) out.push(out[i - 1] * (1 + (trend(i / n) + vol * gaussian(rand)) / 100));
  return out;
}

/** OHLC bars built from a random walk. */
export function candles(n, opts = {}) {
  const rand = mulberry32((opts.seed ?? 1) + 99);
  const closes = walk(n + 1, opts);
  const range = opts.range ?? 1;
  return closes.slice(1).map((close, i) => {
    const open = closes[i];
    const spread = Math.abs(close - open) + (0.3 + rand()) * range;
    return {
      open,
      close,
      high: Math.max(open, close) + rand() * spread * 0.6,
      low: Math.min(open, close) - rand() * spread * 0.6,
    };
  });
}

export function sma(values, period) {
  return values.map((_, i) => (i < period - 1 ? null : values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period));
}

export function ema(values, period) {
  const k = 2 / (period + 1);
  let prev = null;
  return values.map((v, i) => {
    if (i < period - 1) return null;
    prev = prev == null ? values.slice(0, period).reduce((a, b) => a + b, 0) / period : v * k + prev * (1 - k);
    return prev;
  });
}

export function rsi(values, period = 14) {
  const out = values.map(() => null);
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    if (i <= period) {
      gain += Math.max(d, 0) / period;
      loss += Math.max(-d, 0) / period;
      if (i < period) continue;
    } else {
      gain = (gain * (period - 1) + Math.max(d, 0)) / period;
      loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    }
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function annualVol(values, barsPerYear = 252) {
  const r = values.slice(1).map((v, i) => v / values[i] - 1);
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  return Math.sqrt(r.reduce((a, x) => a + (x - mean) ** 2, 0) / r.length) * Math.sqrt(barsPerYear) * 100;
}

/** Indexes where series `a` crosses above (dir 1) or below (dir -1) series `b`. */
export function crossings(a, b, dir) {
  const out = [];
  for (let i = 1; i < a.length; i++) {
    if ([a[i], b[i], a[i - 1], b[i - 1]].some((v) => v == null)) continue;
    if (dir > 0 && a[i - 1] <= b[i - 1] && a[i] > b[i]) out.push(i);
    if (dir < 0 && a[i - 1] >= b[i - 1] && a[i] < b[i]) out.push(i);
  }
  return out;
}

// ---- Primitives --------------------------------------------------------------

export function Figure({ caption, children }) {
  return (
    <figure className="doc-fig">
      {children}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

const fmt = (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, ''));

function linePath(data, X, Y) {
  let d = '';
  let pen = false;
  data.forEach((v, i) => {
    if (v == null) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}

/**
 * Index-based line/bar chart.
 * series:  [{ data, color, label, width, dash, type: 'line'|'bars'|'step', fill, highlight: Set<index> }]
 * hlines:  [{ y, label, color }]          horizontal reference lines
 * hbands:  [{ from, to, color, label }]   shaded value ranges
 * vbands:  [{ from, to, color, label }]   shaded index ranges
 * markers: [{ i, y, shape: 'up'|'down'|'dot', color, label }]
 * notes:   [{ i, y, text, anchor, dx, dy, color }]
 */
export function LineChart({
  series = [],
  width = 640,
  height = 220,
  hlines = [],
  hbands = [],
  vbands = [],
  markers = [],
  notes = [],
  yDomain,
  yTicks = 4,
  yFormat = fmt,
  legend = true,
  xTitle,
}) {
  const pad = { l: 42, r: 16, t: legend ? 28 : 12, b: xTitle ? 26 : 12 };
  const n = Math.max(...series.map((s) => s.data.length));
  const hasBars = series.some((s) => s.type === 'bars');
  let lo;
  let hi;
  if (yDomain) [lo, hi] = yDomain;
  else {
    const vals = [
      ...series.flatMap((s) => s.data.filter((v) => v != null)),
      ...hlines.map((h) => h.y),
      ...markers.map((m) => m.y),
      ...hbands.flatMap((b) => [b.from, b.to]),
    ];
    lo = hasBars ? 0 : Math.min(...vals);
    hi = Math.max(...vals);
    const span = hi - lo || 1;
    if (!hasBars) lo -= span * 0.1;
    hi += span * 0.12;
  }
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const slot = plotW / n;
  const X = (i) => pad.l + slot * (i + 0.5);
  const Y = (v) => pad.t + ((hi - v) * plotH) / (hi - lo);
  const ticks = Array.from({ length: yTicks + 1 }, (_, k) => lo + ((hi - lo) * k) / yTicks);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="doc-svg" role="img">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={width - pad.r} y1={Y(t)} y2={Y(t)} stroke={C.grid} strokeWidth="1" />
          <text x={pad.l - 6} y={Y(t) + 3.5} textAnchor="end" className="axis">
            {yFormat(t)}
          </text>
        </g>
      ))}
      {hbands.map((b, k) => (
        <g key={`hb${k}`}>
          <rect x={pad.l} width={plotW} y={Y(Math.max(b.from, b.to))} height={Math.abs(Y(b.from) - Y(b.to))} fill={b.color} opacity="0.13" />
          {b.label && (
            <text x={width - pad.r - 4} y={Y(Math.max(b.from, b.to)) + 13} textAnchor="end" className="note" fill={b.color}>
              {b.label}
            </text>
          )}
        </g>
      ))}
      {vbands.map((b, k) => (
        <g key={`vb${k}`}>
          <rect x={X(b.from) - slot / 2} width={slot * (b.to - b.from + 1)} y={pad.t} height={plotH} fill={b.color ?? C.accent} opacity="0.13" />
          {b.label && (
            <text x={X((b.from + b.to) / 2)} y={pad.t + 12} textAnchor="middle" className="note" fill={b.color ?? C.accent}>
              {b.label}
            </text>
          )}
        </g>
      ))}
      {series.map((s, k) => {
        if (s.type === 'bars') {
          return (
            <g key={k}>
              {s.data.map((v, i) =>
                v == null ? null : (
                  <rect key={i} x={X(i) - slot * 0.35} width={slot * 0.7} y={Y(v)} height={Y(lo) - Y(v)} fill={s.highlight?.has(i) ? s.highlightColor ?? C.amber : s.color} opacity={s.highlight?.has(i) ? 1 : 0.6} />
                ),
              )}
            </g>
          );
        }
        let d = linePath(s.data, X, Y);
        if (s.type === 'step') {
          d = '';
          let pen = false;
          s.data.forEach((v, i) => {
            if (v == null) return void (pen = false);
            d += `${pen ? 'L' : 'M'}${(X(i) - slot / 2).toFixed(1)},${Y(v).toFixed(1)}L${(X(i) + slot / 2).toFixed(1)},${Y(v).toFixed(1)}`;
            pen = true;
          });
        }
        return (
          <g key={k}>
            {s.fill && <path d={`${d}L${X(s.data.length - 1)},${Y(lo)}L${X(s.data.findIndex((v) => v != null))},${Y(lo)}Z`} fill={s.color} opacity="0.12" />}
            <path d={d} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeDasharray={s.dash} strokeLinejoin="round" />
          </g>
        );
      })}
      {hlines.map((h, k) => (
        <g key={`hl${k}`}>
          <line x1={pad.l} x2={width - pad.r} y1={Y(h.y)} y2={Y(h.y)} stroke={h.color ?? C.muted} strokeWidth="1.5" strokeDasharray="5 4" />
          {h.label && (
            <text x={width - pad.r - 4} y={Y(h.y) - 5} textAnchor="end" className="note" fill={h.color ?? C.muted}>
              {h.label}
            </text>
          )}
        </g>
      ))}
      {markers.map((m, k) => {
        const x = X(m.i);
        const y = Y(m.y);
        const color = m.color ?? (m.shape === 'down' ? C.down : C.up);
        const shape =
          m.shape === 'up' ? (
            <path d={`M${x},${y + 6} l-6,11 h12 z`} fill={color} />
          ) : m.shape === 'down' ? (
            <path d={`M${x},${y - 6} l-6,-11 h12 z`} fill={color} />
          ) : (
            <circle cx={x} cy={y} r="5" fill={color} stroke="var(--panel)" strokeWidth="2" />
          );
        const ly = m.shape === 'up' ? y + 30 : m.shape === 'down' ? y - 22 : y - 10;
        const anchor = x > width - pad.r - 50 ? 'end' : x < pad.l + 40 ? 'start' : 'middle';
        const lx = anchor === 'end' ? x + 6 : anchor === 'start' ? x - 6 : x;
        return (
          <g key={`m${k}`}>
            {shape}
            {m.label && (
              <text x={lx} y={ly} textAnchor={anchor} className="note strong" fill={color}>
                {m.label}
              </text>
            )}
          </g>
        );
      })}
      {notes.map((t, k) => (
        <text key={`n${k}`} x={X(t.i) + (t.dx ?? 0)} y={Y(t.y) + (t.dy ?? 0)} textAnchor={t.anchor ?? 'middle'} className="note" fill={t.color ?? C.text}>
          {t.text}
        </text>
      ))}
      {legend && (
        <g>
          {series
            .filter((s) => s.label)
            .map((s, k, arr) => {
              const x = pad.l + arr.slice(0, k).reduce((a, p) => a + 40 + p.label.length * 7.2, 0);
              return (
                <g key={k} transform={`translate(${x},12)`}>
                  {s.type === 'bars' ? (
                    <rect x="0" y="-5" width="20" height="10" fill={s.color} opacity="0.6" />
                  ) : (
                    <line x1="0" x2="20" y1="0" y2="0" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash} />
                  )}
                  <text x="26" y="4" className="legend">
                    {s.label}
                  </text>
                </g>
              );
            })}
        </g>
      )}
      {xTitle && (
        <text x={pad.l + plotW / 2} y={height - 6} textAnchor="middle" className="axis">
          {xTitle}
        </text>
      )}
    </svg>
  );
}

/** Candlestick chart; `labels` annotate individual candles. */
export function CandleChart({ data, width = 640, height = 220, labels = [], rangeBars = false, yFormat = fmt }) {
  const pad = { l: 42, r: 16, t: 14, b: 14 };
  const lo = Math.min(...data.map((d) => d.low));
  const hi = Math.max(...data.map((d) => d.high));
  const span = hi - lo || 1;
  const yl = lo - span * 0.08;
  const yh = hi + span * 0.18;
  const plotW = width - pad.l - pad.r;
  const slot = plotW / data.length;
  const X = (i) => pad.l + slot * (i + 0.5);
  const Y = (v) => pad.t + ((yh - v) * (height - pad.t - pad.b)) / (yh - yl);
  const ticks = [0, 1, 2, 3].map((k) => yl + ((yh - yl) * k) / 3);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="doc-svg" role="img">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={width - pad.r} y1={Y(t)} y2={Y(t)} stroke={C.grid} />
          <text x={pad.l - 6} y={Y(t) + 3.5} textAnchor="end" className="axis">
            {yFormat(t)}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        if (d.hidden) return null; // spacer
        const color = d.close >= d.open ? C.up : C.down;
        const bw = Math.min(slot * 0.6, 26);
        return (
          <g key={i}>
            <line x1={X(i)} x2={X(i)} y1={Y(d.high)} y2={Y(d.low)} stroke={color} strokeWidth="1.5" />
            <rect x={X(i) - bw / 2} width={bw} y={Y(Math.max(d.open, d.close))} height={Math.max(1.5, Math.abs(Y(d.open) - Y(d.close)))} fill={color} />
            {rangeBars && (
              <line x1={X(i) + bw / 2 + 3} x2={X(i) + bw / 2 + 3} y1={Y(d.high)} y2={Y(d.low)} stroke={C.amber} strokeWidth="2" />
            )}
          </g>
        );
      })}
      {labels.map((l, k) => (
        <text key={k} x={X(l.i) + (l.dx ?? 0)} y={Y(l.y) + (l.dy ?? 0)} textAnchor={l.anchor ?? 'start'} className={`note ${l.strong ? 'strong' : ''}`} fill={l.color ?? C.text}>
          {l.text}
        </text>
      ))}
    </svg>
  );
}

/** Boxes connected by arrows, laid out left to right (wrapping is handled by the viewBox). */
export function Flow({ steps, width = 640, height = 120, loopLabel }) {
  const gap = 26;
  const boxW = (width - 20 - gap * (steps.length - 1)) / steps.length;
  const boxH = 62;
  const y = 18;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="doc-svg" role="img">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--muted)" />
        </marker>
      </defs>
      {steps.map((s, i) => {
        const x = 10 + i * (boxW + gap);
        return (
          <g key={i}>
            <rect x={x} y={y} width={boxW} height={boxH} rx="8" fill={C.panel} stroke={s.color ?? C.grid} strokeWidth="1.5" />
            <text x={x + boxW / 2} y={y + 26} textAnchor="middle" className="box-title" fill={s.color ?? C.text}>
              {s.title}
            </text>
            <text x={x + boxW / 2} y={y + 44} textAnchor="middle" className="box-sub">
              {s.sub}
            </text>
            {i < steps.length - 1 && (
              <line x1={x + boxW + 3} x2={x + boxW + gap - 3} y1={y + boxH / 2} y2={y + boxH / 2} stroke="var(--muted)" strokeWidth="1.5" markerEnd="url(#arrow)" />
            )}
          </g>
        );
      })}
      {loopLabel && (
        <g>
          <path
            d={`M${width - 10 - boxW / 2},${y + boxH + 2} V${height - 14} H${10 + boxW / 2} V${y + boxH + 4}`}
            fill="none"
            stroke="var(--muted)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            markerEnd="url(#arrow)"
          />
          <rect x={width / 2 - 92} y={height - 24} width="184" height="18" fill="var(--panel)" />
          <text x={width / 2} y={height - 11} textAnchor="middle" className="note">
            {loopLabel}
          </text>
        </g>
      )}
    </svg>
  );
}

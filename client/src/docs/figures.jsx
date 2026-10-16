// The guide's illustrations. Each is a small component built from charts.jsx.
import { C, walk, candles, sma, ema, rsi, annualVol, crossings, Figure, LineChart, CandleChart, Flow } from './charts.jsx';

const pctLabel = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`;
const dollars = (v) => `$${v.toFixed(0)}`;

// ---- Getting started ------------------------------------------------------------

export function BotLoopFig() {
  return (
    <Figure caption="Every 30 seconds, the bot repeats the same four steps for each stock on its list.">
      <Flow
        height={130}
        steps={[
          { title: '1. Which stocks?', sub: 'list, screener, …' },
          { title: '2. Filters', sub: 'skip stocks that fail' },
          { title: '3. Rules', sub: 'checked top to bottom' },
          { title: '4. Act', sub: 'buy, sell, short, cover', color: C.up },
        ]}
        loopLabel="repeat every 30 seconds"
      />
    </Figure>
  );
}

export function CandleAnatomyFig() {
  const data = [
    { open: 100, close: 108, high: 111, low: 97 },
    { open: 108, close: 103, high: 110, low: 101 },
  ];
  return (
    <Figure caption="Each bar (or 'candle') sums up the price over one period: where it started, where it ended, and its highest and lowest points.">
      <CandleChart
        data={data}
        width={520}
        height={210}
        yFormat={dollars}
        labels={[
          { i: 0, y: 111, text: '← High', dx: 8, dy: 4 },
          { i: 0, y: 108, text: '← Close (end price)', dx: 18, dy: 4 },
          { i: 0, y: 100, text: '← Open (start price)', dx: 18, dy: 4 },
          { i: 0, y: 97, text: '← Low', dx: 8, dy: 4 },
          { i: 0, y: 113.5, text: 'Green: price went up', anchor: 'middle', color: C.up, strong: true },
          { i: 1, y: 113.5, text: 'Red: price went down', anchor: 'middle', color: C.down, strong: true },
        ]}
      />
    </Figure>
  );
}

export function BarSizesFig() {
  const hourly = candles(7, { seed: 7, vol: 0.6, range: 0.4, trend: () => 0.15 });
  const day = {
    open: hourly[0].open,
    close: hourly.at(-1).close,
    high: Math.max(...hourly.map((c) => c.high)),
    low: Math.min(...hourly.map((c) => c.low)),
  };
  return (
    <Figure caption="One trading day seen as 7 hourly bars (left) and as a single daily bar (right). Bigger bars show the bigger picture; smaller bars react faster.">
      <CandleChart
        data={[...hourly, { open: day.open, close: day.open, high: day.open, low: day.open, hidden: true }, day]}
        width={560}
        height={200}
        yFormat={dollars}
        labels={[
          { i: 3, y: day.high, text: '7 hourly bars', anchor: 'middle', dy: -8, color: C.muted },
          { i: 8, y: day.high, text: '1 daily bar', anchor: 'middle', dy: -8, color: C.muted },
        ]}
      />
    </Figure>
  );
}

// ---- Choosing stocks -------------------------------------------------------------

export function FilterFunnelFig() {
  const rows = [
    { label: '30 stocks on the list', w: 1, color: C.muted },
    { label: 'Price ≥ $10  →  24 left', w: 0.8, color: C.accent },
    { label: 'Volatility score < 30%  →  12 left', w: 0.55, color: C.accent },
    { label: '12 stocks go on to the rules', w: 0.4, color: C.up },
  ];
  return (
    <Figure caption="Filters work like a funnel: only stocks that pass every filter move on to your rules.">
      <svg viewBox="0 0 560 190" className="doc-svg" role="img">
        {rows.map((r, k) => {
          const w = 520 * r.w;
          return (
            <g key={k}>
              <rect x={280 - w / 2} y={10 + k * 44} width={w} height={34} rx="6" fill={r.color} opacity={k === rows.length - 1 ? 0.3 : 0.18} stroke={r.color} />
              <text x="280" y={32 + k * 44} textAnchor="middle" className="box-title" fill={C.text}>
                {r.label}
              </text>
            </g>
          );
        })}
      </svg>
    </Figure>
  );
}

// ---- Rules & conditions -------------------------------------------------------------

export function RuleOrderFig() {
  const rows = [
    { name: 'Rule 1 · Stop-loss exit', state: '✗ conditions not met', color: C.muted },
    { name: 'Rule 2 · Buy the dip', state: '✓ conditions met → BUY', color: C.up },
    { name: 'Rule 3 · Take profits', state: 'not checked: a rule already acted', color: C.muted, faded: true },
  ];
  return (
    <Figure caption="For each stock, rules are checked from top to bottom. The first rule whose conditions are all met acts, and the rest wait for the next check.">
      <svg viewBox="0 0 560 170" className="doc-svg" role="img">
        {rows.map((r, k) => (
          <g key={k} opacity={r.faded ? 0.45 : 1}>
            <rect x="10" y={10 + k * 52} width="540" height="40" rx="7" fill={C.panel} stroke={r.color === C.up ? C.up : C.grid} strokeWidth="1.5" />
            <text x="26" y={35 + k * 52} className="box-title" fill={C.text}>
              {r.name}
            </text>
            <text x="534" y={35 + k * 52} textAnchor="end" className="box-sub" fill={r.color}>
              {r.state}
            </text>
          </g>
        ))}
      </svg>
    </Figure>
  );
}

export function AllAnyFig() {
  const panel = (x, title, checks, result, ok) => (
    <g transform={`translate(${x},0)`}>
      <text x="125" y="20" textAnchor="middle" className="box-title" fill={C.text}>
        {title}
      </text>
      {checks.map((c, k) => (
        <g key={k}>
          <rect x="10" y={32 + k * 34} width="230" height="28" rx="6" fill={C.panel} stroke={C.grid} />
          <text x="22" y={51 + k * 34} className="box-sub" fill={C.text}>
            {c.text}
          </text>
          <text x="228" y={51 + k * 34} textAnchor="end" className="box-title" fill={c.ok ? C.up : C.down}>
            {c.ok ? '✓' : '✗'}
          </text>
        </g>
      ))}
      <text x="125" y="152" textAnchor="middle" className="box-title" fill={ok ? C.up : C.down}>
        {result}
      </text>
    </g>
  );
  const checks = [
    { text: 'RSI(14) < 30', ok: true },
    { text: 'Price > SMA(200)', ok: true },
    { text: 'Relative volume > 2x', ok: false },
  ];
  return (
    <Figure caption="The same three conditions. With “all”, one failure blocks the rule. With “any”, one success is enough.">
      <svg viewBox="0 0 560 165" className="doc-svg" role="img">
        {panel(15, 'ALL must be true', checks, '→ rule does NOT act', false)}
        {panel(295, 'ANY can be true', checks, '→ rule acts', true)}
      </svg>
    </Figure>
  );
}

export function CompareVsCrossFig() {
  const n = 60;
  const price = walk(n, { seed: 21, vol: 0.7, trend: (t) => (t < 0.35 ? -0.25 : 0.45) });
  const level = price[Math.round(n * 0.55)] - 0.4;
  const above = price.map((p) => p > level);
  const first = above.findIndex((v, i) => v && i > 0 && !above[i - 1]);
  const last = above.lastIndexOf(false) + 1;
  return (
    <Figure caption="“Price > 100” is true on every bar in the shaded area. “Price crosses above 100” is only true on the single bar where it moves from below to above (marked).">
      <LineChart
        height={210}
        yFormat={dollars}
        series={[{ data: price, color: C.text, label: 'Price' }]}
        hlines={[{ y: level, label: 'Level you compare against', color: C.amber }]}
        vbands={[{ from: last, to: n - 1, color: C.accent, label: '“>” is true here' }]}
        markers={[{ i: first, y: price[first], shape: 'dot', color: C.up, label: 'crosses above' }]}
      />
    </Figure>
  );
}

// ---- Metrics: price & trend --------------------------------------------------------------

export function PriceLevelFig() {
  const price = walk(50, { seed: 3, vol: 1.1, trend: () => 0.15 });
  const level = Math.round([...price].sort((a, b) => a - b)[Math.floor(price.length * 0.6)]);
  const above = price.map((p, i) => (p > level ? i : null)).filter((i) => i != null);
  return (
    <Figure caption={`A simple price condition: “Price > $${level}” is true whenever the line is above the dashed level (shaded).`}>
      <LineChart
        height={200}
        yFormat={dollars}
        series={[{ data: price, color: C.text, label: 'Price' }]}
        hlines={[{ y: level, label: `$${level}`, color: C.amber }]}
        vbands={above.map((i) => ({ from: i, to: i, color: C.up }))}
      />
    </Figure>
  );
}

export function ChangePctFig() {
  const price = walk(40, { seed: 11, vol: 0.9, trend: (t) => (t > 0.7 ? 1.2 : 0) });
  const end = 39;
  const start = end - 10;
  const change = (price[end] / price[start] - 1) * 100;
  return (
    <Figure caption={`Change %(10) compares today's price with the price 10 bars ago. Here it is ${pctLabel(change)}.`}>
      <LineChart
        height={200}
        yFormat={dollars}
        series={[{ data: price, color: C.text, label: 'Price' }]}
        vbands={[{ from: start, to: end, color: C.accent, label: 'last 10 bars' }]}
        markers={[
          { i: start, y: price[start], shape: 'dot', color: C.muted, label: '10 bars ago' },
          { i: end, y: price[end], shape: 'dot', color: C.up, label: pctLabel(change) },
        ]}
      />
    </Figure>
  );
}

export function DayChangeFig() {
  const yesterday = walk(26, { seed: 5, vol: 0.35 });
  const today = walk(26, { seed: 6, vol: 0.35, start: yesterday.at(-1) * 1.004, trend: () => 0.07 });
  const data = [...yesterday, ...today];
  const close = yesterday.at(-1);
  const chg = (today.at(-1) / close - 1) * 100;
  return (
    <Figure caption="Today's change % measures how far the price has moved since yesterday's closing price.">
      <LineChart
        height={200}
        yFormat={(v) => `$${v.toFixed(1)}`}
        series={[{ data, color: C.text, label: 'Price over two days' }]}
        vbands={[{ from: 26, to: 51, color: C.accent, label: 'today' }]}
        hlines={[{ y: close, label: "yesterday's close", color: C.amber }]}
        markers={[{ i: 51, y: today.at(-1), shape: 'dot', color: C.up, label: pctLabel(chg) }]}
      />
    </Figure>
  );
}

export function SmaFig() {
  const price = walk(90, { seed: 8, vol: 1.3, trend: (t) => (t < 0.5 ? 0.25 : -0.2) });
  return (
    <Figure caption="The moving average (blue) smooths out the day-to-day zig-zag of the price (white), making the overall direction easier to see.">
      <LineChart
        height={210}
        yFormat={dollars}
        series={[
          { data: price, color: C.text, label: 'Price', width: 1.5 },
          { data: sma(price, 20), color: C.accent, label: 'SMA(20)', width: 2.5 },
        ]}
      />
    </Figure>
  );
}

export function EmaFig() {
  const base = walk(70, { seed: 14, vol: 0.5 });
  const price = base.map((v, i) => (i >= 40 ? v * 1.12 : v));
  return (
    <Figure caption="After a sudden jump, the EMA (purple) catches up faster than the SMA (blue) because it gives more weight to recent bars.">
      <LineChart
        height={210}
        yFormat={dollars}
        series={[
          { data: price, color: C.text, label: 'Price', width: 1.5 },
          { data: sma(price, 15), color: C.accent, label: 'SMA(15)' },
          { data: ema(price, 15), color: C.violet, label: 'EMA(15)' },
        ]}
        notes={[{ i: 40, y: price[39], text: 'sudden jump →', anchor: 'end', dx: -8, dy: -14 }]}
      />
    </Figure>
  );
}

export function CrossoverFig() {
  const price = walk(120, { seed: 4, vol: 0.9, trend: (t) => (t < 0.15 ? -0.3 : t < 0.6 ? 0.45 : -0.5) });
  const fast = sma(price, 10);
  const slow = sma(price, 30);
  const ups = crossings(fast, slow, 1);
  const downs = crossings(fast, slow, -1);
  return (
    <Figure caption="Moving-average crossover: when the fast average crosses above the slow one (“golden cross”) an uptrend may be starting. Crossing back below (“death cross”) suggests it is ending.">
      <LineChart
        height={230}
        yFormat={dollars}
        series={[
          { data: price, color: C.muted, label: 'Price', width: 1.2 },
          { data: fast, color: C.amber, label: 'SMA(10) fast' },
          { data: slow, color: C.accent, label: 'SMA(30) slow' },
        ]}
        markers={[
          ...ups.map((i) => ({ i, y: fast[i], shape: 'up', label: 'buy' })),
          ...downs.map((i) => ({ i, y: fast[i], shape: 'down', label: 'sell' })),
        ]}
      />
    </Figure>
  );
}

export function ChannelFig() {
  const price = walk(80, { seed: 31, vol: 0.8, trend: (t) => (t > 0.62 ? 0.9 : 0) });
  const hiN = price.map((_, i) => (i < 20 ? null : Math.max(...price.slice(i - 20, i))));
  const loN = price.map((_, i) => (i < 10 ? null : Math.min(...price.slice(i - 10, i))));
  const breakout = price.findIndex((p, i) => hiN[i] != null && i > 45 && p > hiN[i]);
  return (
    <Figure caption="N-bar high (green) is the highest price of the previous N bars, and N-bar low (red) is the lowest. When the price closes above the recent high, it has “broken out”.">
      <LineChart
        height={220}
        yFormat={dollars}
        series={[
          { data: price, color: C.text, label: 'Price' },
          { data: hiN, color: C.up, label: '20-bar high', type: 'step', dash: '5 3' },
          { data: loN, color: C.down, label: '10-bar low', type: 'step', dash: '5 3' },
        ]}
        markers={breakout > 0 ? [{ i: breakout, y: price[breakout], shape: 'up', label: 'breakout' }] : []}
      />
    </Figure>
  );
}

export function PctFromHighFig() {
  const price = walk(70, { seed: 17, vol: 0.8, trend: (t) => (t < 0.55 ? 0.35 : -0.55) });
  const peak = Math.max(...price);
  const peakAt = price.indexOf(peak);
  const end = price.length - 1;
  const pct = (price[end] / peak - 1) * 100;
  return (
    <Figure caption={`% below N-bar high measures how far the price has dropped from its recent peak: here ${pctLabel(pct)}.`}>
      <LineChart
        height={210}
        yFormat={dollars}
        series={[{ data: price, color: C.text, label: 'Price' }]}
        hlines={[{ y: peak, label: 'highest point', color: C.amber }]}
        markers={[
          { i: peakAt, y: peak, shape: 'dot', color: C.amber },
          { i: end, y: price[end], shape: 'dot', color: C.down, label: pctLabel(pct) },
        ]}
      />
    </Figure>
  );
}

export function PriceVsSmaFig() {
  const price = walk(80, { seed: 23, vol: 0.8, trend: (t) => (t > 0.8 ? 1.4 : 0.05) });
  const avg = sma(price, 30);
  const end = price.length - 1;
  const pct = (price[end] / avg[end] - 1) * 100;
  return (
    <Figure caption={`% above SMA shows how stretched the price is from its average. At the end it is ${pctLabel(pct)} above. Big gaps tend to shrink again.`}>
      <LineChart
        height={210}
        yFormat={dollars}
        series={[
          { data: price, color: C.text, label: 'Price' },
          { data: avg, color: C.accent, label: 'SMA(30)' },
        ]}
        markers={[
          { i: end, y: avg[end], shape: 'dot', color: C.accent },
          { i: end, y: price[end], shape: 'dot', color: C.amber, label: `${pctLabel(pct)} above` },
        ]}
      />
    </Figure>
  );
}

// ---- Momentum & volatility ---------------------------------------------------------

export function RsiFig() {
  const price = walk(110, { seed: 41, vol: 1.1, trend: (t) => (t < 0.3 ? 0.6 : t < 0.6 ? -0.9 : 0.5) });
  const r = rsi(price, 14);
  const low = r.findIndex((v, i) => v != null && v < 30 && r[i - 1] >= 30);
  const high = r.findIndex((v, i) => v != null && v > 70 && r[i - 1] <= 70);
  const marks = [];
  if (high > 0) marks.push({ i: high, y: r[high], shape: 'down', color: C.text, label: 'overbought' });
  if (low > 0) marks.push({ i: low, y: r[low], shape: 'up', color: C.text, label: 'oversold' });
  return (
    <Figure caption="Top: the price. Bottom: its RSI. When the price falls sharply, RSI drops below 30 (“oversold”). After a sharp rise it climbs above 70 (“overbought”).">
      <LineChart height={160} yFormat={dollars} series={[{ data: price, color: C.text, label: 'Price' }]} />
      <LineChart
        height={150}
        legend={false}
        yDomain={[0, 100]}
        series={[{ data: r, color: C.violet }]}
        hbands={[
          { from: 70, to: 100, color: C.down, label: 'above 70: overbought' },
          { from: 0, to: 30, color: C.up, label: 'below 30: oversold' },
        ]}
        markers={marks}
      />
    </Figure>
  );
}

export function VolatilityFig() {
  const calm = walk(80, { seed: 51, vol: 0.6, start: 100 });
  const wild = walk(80, { seed: 52, vol: 3.2, start: 100 });
  return (
    <Figure
      caption={`Two stocks that both start at $100. The calm one has a volatility score around ${annualVol(calm).toFixed(0)}%, and the wild one around ${annualVol(wild).toFixed(0)}%. Higher scores mean bigger, less predictable swings.`}
    >
      <LineChart
        height={210}
        yFormat={dollars}
        series={[
          { data: calm, color: C.accent, label: `Calm stock (≈${annualVol(calm).toFixed(0)}%)` },
          { data: wild, color: C.amber, label: `Wild stock (≈${annualVol(wild).toFixed(0)}%)` },
        ]}
      />
    </Figure>
  );
}

export function AtrFig() {
  const quiet = candles(9, { seed: 61, vol: 0.4, range: 0.5 });
  const busy = candles(9, { seed: 62, vol: 1.6, range: 2.2, start: quiet.at(-1).close });
  return (
    <Figure caption="Average true range measures the typical height of a bar (orange lines). The left side moves about 1% per bar and the right side about 3%. Gaps between bars count too.">
      <CandleChart
        data={[...quiet, ...busy]}
        width={600}
        height={200}
        rangeBars
        yFormat={dollars}
        labels={[
          { i: 4, y: Math.max(...quiet.map((c) => c.high)), text: 'small range: low ATR %', anchor: 'middle', dy: -8, color: C.muted },
          { i: 13, y: Math.max(...busy.map((c) => c.high)), text: 'big range: high ATR %', anchor: 'middle', dy: -8, color: C.amber },
        ]}
      />
    </Figure>
  );
}

// ---- Volume -----------------------------------------------------------------------------

export function VolumeFig() {
  const vol = walk(30, { seed: 71, vol: 12, start: 1_000_000 }).map((v) => Math.max(300_000, v));
  vol[24] = 3_100_000;
  const avg = vol.map((_, i) => (i < 20 ? null : vol.slice(i - 20, i).reduce((a, b) => a + b, 0) / 20));
  return (
    <Figure caption={`Each bar is the number of shares traded. The line is the average of the previous 20 bars. The orange bar traded ${(vol[24] / avg[24]).toFixed(1)}× its average, a relative volume spike.`}>
      <LineChart
        height={200}
        yFormat={(v) => `${(v / 1e6).toFixed(1)}M`}
        series={[
          { data: vol, color: C.accent, label: 'Volume', type: 'bars', highlight: new Set([24]) },
          { data: avg, color: C.amber, label: 'Average volume(20)' },
        ]}
        notes={[{ i: 24, y: vol[24], dy: -8, text: `${(vol[24] / avg[24]).toFixed(1)}× normal`, color: C.amber }]}
      />
    </Figure>
  );
}

// ---- Bot's position ----------------------------------------------------------------------

export function PositionPnlFig() {
  const price = walk(40, { seed: 81, vol: 0.8, trend: () => 0.3 });
  const entryAt = 12;
  const entry = price[entryAt];
  const end = price.length - 1;
  const pct = (price[end] / entry - 1) * 100;
  return (
    <Figure caption={`The bot bought at the green dot. Position profit % compares the current price with that entry price: here ${pctLabel(pct)}.`}>
      <LineChart
        height={200}
        yFormat={dollars}
        series={[{ data: price, color: C.text, label: 'Price' }]}
        hlines={[{ y: entry, label: 'average entry price', color: C.amber }]}
        markers={[
          { i: entryAt, y: entry, shape: 'up', label: 'bought' },
          { i: end, y: price[end], shape: 'dot', color: pct >= 0 ? C.up : C.down, label: pctLabel(pct) },
        ]}
      />
    </Figure>
  );
}

export function BarsTimelineFig() {
  const cells = 12;
  const buyAt = 3;
  const sellAt = 6;
  const reBuy = 8;
  const now = 11;
  const box = (i) => 20 + i * 44;
  return (
    <Figure caption="A timeline of 12 bars. Bars held counts from the current position's entry (bar 8) to now. Bars since last trade counts from the most recent trade of any kind.">
      <svg viewBox="0 0 560 150" className="doc-svg" role="img">
        {Array.from({ length: cells }, (_, i) => (
          <g key={i}>
            <rect x={box(i)} y="40" width="38" height="30" rx="5" fill={i === now ? C.accent : C.panel} opacity={i === now ? 0.35 : 1} stroke={C.grid} />
            <text x={box(i) + 19} y="60" textAnchor="middle" className="box-sub">
              {i}
            </text>
          </g>
        ))}
        {[
          [buyAt, 'buy', C.up],
          [sellAt, 'sell', C.down],
          [reBuy, 'buy', C.up],
        ].map(([i, label, color]) => (
          <text key={i} x={box(i) + 19} y="30" textAnchor="middle" className="box-title" fill={color}>
            {label}
          </text>
        ))}
        <text x={box(now) + 19} y="30" textAnchor="middle" className="box-title" fill={C.accent}>
          now
        </text>
        <path d={`M${box(reBuy) + 19},80 v8 H${box(now) + 19} v-8`} fill="none" stroke={C.amber} strokeWidth="1.5" />
        <text x={box(now) + 38} y="106" textAnchor="end" className="note" fill={C.amber}>
          Bars held = 3 · Bars since last trade = 3
        </text>
        <text x="20" y="132" className="note" fill={C.muted}>
          If it had sold at bar 8 instead: Bars held = empty, Bars since last trade = 3.
        </text>
      </svg>
    </Figure>
  );
}

// ---- Actions & sizing ------------------------------------------------------------------------

export function LongShortFig() {
  const moves = Array.from({ length: 21 }, (_, i) => -50 + i * 5);
  return (
    <Figure caption="Profit or loss on a $1,000 trade as the stock moves. Buying (green) gains when the price rises. Shorting (red) gains when it falls, and its losses keep growing if the price keeps rising.">
      <LineChart
        height={220}
        yDomain={[-600, 600]}
        yFormat={(v) => `${v < 0 ? '−' : v > 0 ? '+' : ''}$${Math.abs(v).toFixed(0)}`}
        series={[
          { data: moves.map((m) => m * 10), color: C.up, label: 'Buy (long)' },
          { data: moves.map((m) => -m * 10), color: C.down, label: 'Short' },
        ]}
        hlines={[{ y: 0, label: 'break-even', color: C.muted }]}
        xTitle="← stock falls 50%          price change after you trade          stock rises 50% →"
      />
    </Figure>
  );
}

export function SizingFig() {
  const total = 100_000;
  const cash = 60_000;
  const W = 500;
  const x0 = 30;
  const sx = (v) => (v / total) * W;
  return (
    <Figure caption="A $100,000 portfolio with $60,000 in cash. The same “10%” means a different amount depending on what it is 10% of.">
      <svg viewBox="0 0 560 175" className="doc-svg" role="img">
        <rect x={x0} y="16" width={sx(cash)} height="30" fill={C.accent} opacity="0.35" />
        <rect x={x0 + sx(cash)} y="16" width={sx(total - cash)} height="30" fill={C.violet} opacity="0.35" />
        <text x={x0 + sx(cash) / 2} y="36" textAnchor="middle" className="box-sub" fill={C.text}>
          Cash (buying power) $60,000
        </text>
        <text x={x0 + sx(cash) + sx(total - cash) / 2} y="36" textAnchor="middle" className="box-sub" fill={C.text}>
          Stocks $40,000
        </text>
        <text x={x0 + W / 2} y="64" textAnchor="middle" className="note" fill={C.muted}>
          Portfolio value = $100,000
        </text>
        {[
          ['10% of portfolio value', 10_000, C.up],
          ['10% of buying power', 6_000, C.amber],
          ['$2,000 worth', 2_000, C.text],
        ].map(([label, v, color], k) => (
          <g key={k}>
            <rect x={x0} y={82 + k * 30} width={sx(v)} height="20" fill={color} opacity="0.7" />
            <text x={x0 + sx(v) + 8} y={97 + k * 30} className="box-sub" fill={C.text}>
              {label} = ${v.toLocaleString('en-US')}
            </text>
          </g>
        ))}
      </svg>
    </Figure>
  );
}

// ---- Safety limits ----------------------------------------------------------------------------

export function StopTakeFig() {
  const price = walk(45, { seed: 91, vol: 0.9, trend: (t) => (t > 0.3 ? 0.5 : 0) });
  const entryAt = 8;
  const entry = price[entryAt];
  const tp = entry * 1.1;
  const sl = entry * 0.95;
  const hit = price.findIndex((p, i) => i > entryAt && (p >= tp || p <= sl));
  const shown = hit > 0 ? price.map((p, i) => (i > hit ? null : p)) : price;
  return (
    <Figure caption="After buying, a 5% stop-loss and a 10% take-profit create two exit levels. Whichever price is reached first closes the position automatically.">
      <LineChart
        height={220}
        yFormat={dollars}
        series={[{ data: shown, color: C.text, label: 'Price' }]}
        hbands={[
          { from: tp, to: tp * 1.04, color: C.up, label: 'take-profit zone (+10%)' },
          { from: sl * 0.96, to: sl, color: C.down, label: 'stop-loss zone (−5%)' },
        ]}
        hlines={[{ y: entry, label: 'entry', color: C.amber }]}
        markers={[
          { i: entryAt, y: entry, shape: 'up', label: 'buy' },
          ...(hit > 0 ? [{ i: hit, y: price[hit], shape: 'down', color: price[hit] >= tp ? C.up : C.down, label: 'auto-sell' }] : []),
        ]}
      />
    </Figure>
  );
}

export function MaxPositionsFig() {
  const held = ['AAPL', 'MSFT', 'NVDA', 'KO', 'XOM'];
  return (
    <Figure caption="With a limit of 5 positions, the bot already holds 5 stocks, so a new buy signal for AMZN is skipped. Selling one stock frees up a slot.">
      <svg viewBox="0 0 560 110" className="doc-svg" role="img">
        {held.map((s, i) => (
          <g key={s}>
            <rect x={14 + i * 84} y="30" width="76" height="44" rx="7" fill={C.up} opacity="0.2" stroke={C.up} />
            <text x={52 + i * 84} y="57" textAnchor="middle" className="box-title" fill={C.text}>
              {s}
            </text>
          </g>
        ))}
        <rect x={14 + 5 * 84 + 20} y="30" width="96" height="44" rx="7" fill="none" stroke={C.down} strokeDasharray="5 4" />
        <text x={14 + 5 * 84 + 68} y="50" textAnchor="middle" className="box-title" fill={C.down}>
          AMZN
        </text>
        <text x={14 + 5 * 84 + 68} y="66" textAnchor="middle" className="box-sub" fill={C.down}>
          skipped
        </text>
        <text x="220" y="18" textAnchor="middle" className="note" fill={C.muted}>
          5 of 5 slots used
        </text>
      </svg>
    </Figure>
  );
}

export function MaxPositionSizeFig() {
  return (
    <Figure caption="With a 20% limit on a $100,000 portfolio, no stock can grow past $20,000. A rule asking to buy $30,000 is trimmed to $20,000, and if the stock already makes up $15,000, only $5,000 more can be bought.">
      <svg viewBox="0 0 560 130" className="doc-svg" role="img">
        <line x1="30" x2="530" y1="104" y2="104" stroke={C.grid} />
        {[
          ['Rule wants', 30, C.muted],
          ['Bot buys', 20, C.up],
        ].map(([label, v, color], k) => (
          <g key={k}>
            <rect x={60 + k * 160} y={104 - v * 2.8} width="90" height={v * 2.8} fill={color} opacity="0.5" />
            <text x={105 + k * 160} y={98 - v * 2.8} textAnchor="middle" className="box-sub" fill={C.text}>
              {label} ${v}k
            </text>
          </g>
        ))}
        <line x1="30" x2="530" y1={104 - 20 * 2.8} y2={104 - 20 * 2.8} stroke={C.amber} strokeDasharray="6 4" strokeWidth="1.5" />
        <text x="525" y={98 - 20 * 2.8} textAnchor="end" className="note" fill={C.amber}>
          20% limit = $20k
        </text>
      </svg>
    </Figure>
  );
}

export function CooldownFig() {
  const box = (i) => 20 + i * 44;
  return (
    <Figure caption="With a 3-bar cooldown, after trading a stock at bar 2 the bot ignores its rules for that stock during bars 2–4. They can act again from bar 5.">
      <svg viewBox="0 0 560 110" className="doc-svg" role="img">
        <rect x={box(2) - 3} y="34" width={44 * 3 + 2} height="38" rx="6" fill={C.amber} opacity="0.15" />
        <text x={box(2) + 64} y="92" textAnchor="middle" className="note" fill={C.amber}>
          cooldown: rules wait
        </text>
        {Array.from({ length: 12 }, (_, i) => (
          <g key={i}>
            <rect x={box(i)} y="38" width="38" height="30" rx="5" fill={C.panel} stroke={C.grid} />
            <text x={box(i) + 19} y="58" textAnchor="middle" className="box-sub">
              {i}
            </text>
          </g>
        ))}
        <text x={box(2) + 19} y="26" textAnchor="middle" className="box-title" fill={C.up}>
          trade
        </text>
        <text x={box(5) + 19} y="26" textAnchor="middle" className="box-title" fill={C.accent}>
          free again
        </text>
      </svg>
    </Figure>
  );
}

export function MarginFig() {
  const s = 3.2;
  const bw = 150;
  const bar = (x, label, parts) => {
    let y = 120;
    return (
      <g>
        {parts.map(([v, color, text], k) => {
          y -= v * s;
          return (
            <g key={k}>
              <rect x={x} y={y} width={bw} height={v * s} fill={color} opacity="0.4" stroke={color} />
              <text x={x + bw / 2} y={y + (v * s) / 2 + 4} textAnchor="middle" className="box-sub" fill={C.text}>
                {text}
              </text>
            </g>
          );
        })}
        <text x={x + bw / 2} y="138" textAnchor="middle" className="box-title" fill={C.text}>
          {label}
        </text>
      </g>
    );
  };
  return (
    <Figure caption="Shorting $10,000 of stock with $20,000 cash. The $10,000 you receive and $5,000 more of your own cash are set aside as collateral, so your buying power drops by $5,000.">
      <svg viewBox="0 0 560 150" className="doc-svg" role="img">
        {bar(20, 'Before', [[20, C.accent, 'Cash $20k, all usable']])}
        {bar(200, 'After shorting $10k', [
          [15, C.accent, 'Usable $15k'],
          [5, C.amber, 'Your $5k locked'],
          [10, C.down, 'Sale $10k locked'],
        ])}
        {['Buying power =', 'cash − 1.5 × shorts', '= $30k − $15k', '= $15k'].map((t, k) => (
          <text key={k} x="380" y={40 + k * 18} className="note" fill={k === 3 ? C.accent : C.muted}>
            {t}
          </text>
        ))}
      </svg>
    </Figure>
  );
}

// ---- Testing --------------------------------------------------------------------------------

export function BacktestFig() {
  const bench = walk(150, { seed: 101, vol: 1.1, trend: (t) => (t < 0.4 ? 0.25 : t < 0.65 ? -0.6 : 0.4), start: 10000 });
  const bot = bench.map((v, i) => (i < 60 ? v : bench[59] * (1 + (bench[i] / bench[59] - 1) * 0.45 + (i - 60) * 0.0012)));
  let peak = 0;
  let worst = 0;
  let worstAt = 0;
  bench.forEach((v, i) => {
    peak = Math.max(peak, v);
    if (v / peak - 1 < worst) [worst, worstAt] = [v / peak - 1, i];
  });
  const peakAt = bench.slice(0, worstAt + 1).indexOf(Math.max(...bench.slice(0, worstAt + 1)));
  return (
    <Figure caption="A backtest compares your bot (blue) with simply buying and holding (grey). The shaded stretch is buy & hold's maximum drawdown, its worst drop from a peak.">
      <LineChart
        height={230}
        yFormat={(v) => `$${(v / 1000).toFixed(1)}k`}
        series={[
          { data: bench, color: C.muted, label: 'Buy & hold' },
          { data: bot, color: C.accent, label: 'Your bot' },
        ]}
        vbands={[{ from: peakAt, to: worstAt, color: C.down, label: `drawdown ${pctLabel(worst * 100)}` }]}
      />
    </Figure>
  );
}

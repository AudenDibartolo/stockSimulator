import { useEffect, useRef } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';

const TZ_SHIFT = -new Date().getTimezoneOffset() * 60; // show times in the viewer's local zone

const COLORS = {
  text: '#8b95a7',
  grid: '#1c2330',
  up: '#22c55e',
  down: '#ef4444',
};

function prepare(data) {
  // lightweight-charts requires strictly ascending, unique times.
  const out = [];
  let last = -Infinity;
  for (const d of data) {
    const time = d.time + TZ_SHIFT;
    if (time <= last) continue;
    last = time;
    out.push({ ...d, time });
  }
  return out;
}

/**
 * series: [{ type: 'area'|'line'|'candles', data, color?, title?, markers? }]
 * data items: { time (unix seconds), value } or OHLC for candles.
 */
export default function TimeChart({ series, height = 320, intraday = false }) {
  const ref = useRef(null);

  useEffect(() => {
    const chart = createChart(ref.current, {
      height,
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: COLORS.text, fontFamily: 'inherit' },
      grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: intraday, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
    });

    for (const s of series) {
      if (!s.data?.length) continue;
      let api;
      if (s.type === 'candles') {
        api = chart.addCandlestickSeries({
          upColor: COLORS.up,
          downColor: COLORS.down,
          wickUpColor: COLORS.up,
          wickDownColor: COLORS.down,
          borderVisible: false,
        });
        api.setData(prepare(s.data));
      } else if (s.type === 'area') {
        const color = s.color ?? COLORS.up;
        api = chart.addAreaSeries({
          lineColor: color,
          topColor: `${color}55`,
          bottomColor: `${color}00`,
          lineWidth: 2,
          title: s.title,
          priceLineVisible: false,
        });
        api.setData(prepare(s.data));
      } else {
        api = chart.addLineSeries({ color: s.color ?? '#60a5fa', lineWidth: 2, title: s.title, priceLineVisible: false });
        api.setData(prepare(s.data));
      }
      if (s.markers?.length) {
        api.setMarkers(prepare(s.markers).map(({ time, side, text }) => ({
          time,
          position: side === 'buy' ? 'belowBar' : 'aboveBar',
          color: side === 'buy' ? COLORS.up : COLORS.down,
          shape: side === 'buy' ? 'arrowUp' : 'arrowDown',
          text,
        })));
      }
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [series, height, intraday]);

  return <div ref={ref} className="chart" style={{ height }} />;
}

import { Fragment, useState } from 'react';
import { money, qty, dateTime } from '../format.js';

const SIDE_VERB = { buy: 'Buy', sell: 'Sell', short: 'Short', cover: 'Cover' };

function status(r, dryRun) {
  if (r.error) return { text: r.error, cls: 'down' };
  if (r.intent) {
    const what = `${SIDE_VERB[r.intent.side]} ${qty(r.intent.qty)}`;
    if (r.executed) return { text: `${what} — done`, cls: r.intent.side === 'buy' || r.intent.side === 'cover' ? 'up' : 'down' };
    if (r.blocked) return { text: `${what} — ${r.blocked}`, cls: 'warn' };
    return { text: dryRun ? `Would ${what.toLowerCase()}` : what, cls: 'accent' };
  }
  return { text: r.note, cls: 'muted' };
}

// Per-stock breakdown of a bot scan: filters, each rule's conditions, and the outcome.
export default function ScanResults({ scan, dryRun = false }) {
  const [open, setOpen] = useState(() => new Set());
  if (!scan) return null;
  const toggle = (s) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  const acting = scan.results.filter((r) => r.intent).length;

  return (
    <div className="scan">
      <p className="muted small">
        {dryRun ? 'Preview' : 'Last check'} at {dateTime(scan.time)} · {scan.results.length} stocks evaluated · {acting} would act
        {dryRun && ' · nothing was traded'}. Click a row for details.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Stock</th>
              <th className="num">Price</th>
              <th className="num">Bot holds</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {scan.results.map((r) => {
              const s = status(r, dryRun);
              const isOpen = open.has(r.symbol);
              return (
                <Fragment key={r.symbol}>
                  <tr className="clickable" onClick={() => toggle(r.symbol)}>
                    <td>
                      <span className="caret">{isOpen ? '▾' : '▸'}</span> <b>{r.symbol}</b>
                      {r.heldOnly && <span className="tag">held</span>}
                      <div className="muted small ellipsis">{r.name}</div>
                    </td>
                    <td className="num">{r.price != null ? money(r.price) : '—'}</td>
                    <td className="num">{r.held ? qty(r.held) : '—'}</td>
                    <td className={s.cls}>{s.text}</td>
                  </tr>
                  {isOpen && (
                    <tr className="details-row">
                      <td colSpan={4}>
                        <ScanDetail r={r} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Check({ pass }) {
  return <span className={pass ? 'up' : 'down'}>{pass ? '✓' : '✗'}</span>;
}

function ScanDetail({ r }) {
  if (r.error) return <p className="down">{r.error}</p>;
  return (
    <div className="scan-detail">
      {r.intent?.reason && (
        <p>
          <b>Action:</b> {r.intent.reason}
        </p>
      )}
      {r.filters && (
        <div>
          <b>Stock filters</b> <Check pass={r.filters.pass} />
          <ul>
            {r.filters.results.map((c, i) => (
              <li key={i}>
                <Check pass={c.pass} /> {c.text}
              </li>
            ))}
          </ul>
        </div>
      )}
      {r.rules.map((rule) => (
        <div key={rule.id}>
          <b>{rule.name}</b> <Check pass={rule.pass} />
          {rule.fired && <span className="tag">fired</span>}
          {rule.skipped && <span className="muted small"> skipped: {rule.skipped}</span>}
          <ul>
            {rule.conditions.map((c, i) => (
              <li key={i}>
                <Check pass={c.pass} /> {c.text}
              </li>
            ))}
            {!rule.conditions.length && <li className="muted">no conditions (always true)</li>}
          </ul>
        </div>
      ))}
      {!r.rules.length && !r.filters && <p className="muted">{r.note}</p>}
    </div>
  );
}

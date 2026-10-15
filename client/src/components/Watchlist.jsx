import { useLive } from '../live.jsx';
import { money, pct, tone } from '../format.js';
import SymbolSearch from './SymbolSearch.jsx';

export default function Watchlist({ symbols, onChange, current }) {
  const { quotes } = useLive();
  return (
    <aside className="watchlist card">
      <h3>Watchlist</h3>
      <SymbolSearch placeholder="Add symbol…" onSelect={(s) => !symbols.includes(s) && onChange([...symbols, s])} />
      <ul>
        {symbols.map((s) => {
          const q = quotes[s];
          return (
            <li key={s} className={s === current ? 'active' : ''}>
              <a href={`#/stock/${s}`}>
                <span className="sym">{s}</span>
                <span className="price">{q ? money(q.price) : '…'}</span>
                <span className={`chg ${tone(q?.change)}`}>{q ? pct(q.changePercent) : ''}</span>
              </a>
              <button className="icon" title="Remove" onClick={() => onChange(symbols.filter((x) => x !== s))}>
                ×
              </button>
            </li>
          );
        })}
        {!symbols.length && <li className="muted empty">Search above to add symbols.</li>}
      </ul>
    </aside>
  );
}

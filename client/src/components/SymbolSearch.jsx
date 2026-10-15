import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Type-ahead search over real tickers. Calls onSelect(symbol) on pick or Enter.
export default function SymbolSearch({ onSelect, placeholder = 'Search stocks & ETFs…', autoFocus }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!q.trim()) return setResults([]);
    const t = setTimeout(() => {
      api.get(`/api/search?q=${encodeURIComponent(q)}`).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const pick = (symbol) => {
    onSelect(symbol.toUpperCase());
    setQ('');
    setOpen(false);
  };

  return (
    <div className="search">
      <input
        value={q}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && q.trim()) pick(results[0]?.symbol ?? q.trim());
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && results.length > 0 && (
        <ul className="search-results">
          {results.map((r) => (
            <li key={r.symbol} onMouseDown={() => pick(r.symbol)}>
              <b>{r.symbol}</b>
              <span className="muted">{r.name}</span>
              <span className="tag">{r.exchange}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

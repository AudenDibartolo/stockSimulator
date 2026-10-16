import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { LiveProvider, useLive, useFetch } from './live.jsx';
import Watchlist from './components/Watchlist.jsx';
import SymbolSearch from './components/SymbolSearch.jsx';
import Dashboard from './pages/Dashboard.jsx';
import StockPage from './pages/StockPage.jsx';
import Bots from './pages/Bots.jsx';
import Backtest from './pages/Backtest.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import Docs from './pages/Docs.jsx';

function useHashRoute() {
  const read = () => window.location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const onChange = () => setParts(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return parts;
}

const navigate = (path) => {
  window.location.hash = path;
};

const storage = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      // ignore (private mode etc.)
    }
  },
};

export default function App() {
  const [watchlist, setWatchlist] = useState([]);
  const [extraSymbols, setExtraSymbols] = useState([]);
  const route = useHashRoute();
  const stockSymbol = route[0] === 'stock' ? decodeURIComponent(route[1] ?? '').toUpperCase() : null;

  useEffect(() => {
    api.get('/api/watchlist').then(setWatchlist).catch(() => {});
  }, []);

  const updateWatchlist = (list) => {
    setWatchlist(list);
    api.put('/api/watchlist', list).then(setWatchlist).catch((e) => alert(e.message));
  };

  const symbols = useMemo(
    () => [...watchlist, ...extraSymbols, ...(stockSymbol ? [stockSymbol] : [])],
    [watchlist, extraSymbols, stockSymbol],
  );

  return (
    <LiveProvider symbols={symbols}>
      <Shell
        route={route}
        stockSymbol={stockSymbol}
        watchlist={watchlist}
        onWatchlistChange={updateWatchlist}
        onHeldSymbols={setExtraSymbols}
      />
    </LiveProvider>
  );
}

function Shell({ route, stockSymbol, watchlist, onWatchlistChange, onHeldSymbols }) {
  const { connected, portfolioVersion } = useLive();
  const portfolios = useFetch('/api/portfolios', [portfolioVersion]);
  const [selectedId, setSelectedId] = useState(() => storage.get('portfolioId'));
  const [botDraft, setBotDraft] = useState(null); // backtest → "Deploy as live bot"
  const [backtestDraft, setBacktestDraft] = useState(null); // bot editor → "Backtest"

  const list = portfolios.data ?? [];
  const portfolioId = list.some((p) => p.id === selectedId) ? selectedId : list[0]?.id;

  const heldKey = list.flatMap((p) => p.positions.map((x) => x.symbol)).sort().join(',');
  useEffect(() => {
    onHeldSymbols(heldKey ? [...new Set(heldKey.split(','))] : []);
  }, [heldKey, onHeldSymbols]);

  const selectPortfolio = (id) => {
    setSelectedId(id);
    storage.set('portfolioId', id);
  };

  const page = route[0] || 'dashboard';
  const shared = { portfolios: list, portfolioId, selectPortfolio, reloadPortfolios: portfolios.reload };

  let content;
  if (!portfolioId && page !== 'docs') content = <div className="card muted">{portfolios.error?.message ?? 'Loading…'}</div>;
  else if (page === 'stock' && stockSymbol) {
    content = (
      <StockPage
        key={stockSymbol}
        symbol={stockSymbol}
        {...shared}
        inWatchlist={watchlist.includes(stockSymbol)}
        toggleWatch={() =>
          onWatchlistChange(
            watchlist.includes(stockSymbol) ? watchlist.filter((s) => s !== stockSymbol) : [...watchlist, stockSymbol],
          )
        }
      />
    );
  } else if (page === 'bots') {
    content = (
      <Bots
        route={route}
        {...shared}
        draft={botDraft}
        clearDraft={() => setBotDraft(null)}
        onBacktest={(draft) => {
          setBacktestDraft(draft);
          navigate('/backtest');
        }}
      />
    );
  }
  else if (page === 'backtest') {
    content = (
      <Backtest
        initialSymbol={route[1]}
        draft={backtestDraft}
        clearDraft={() => setBacktestDraft(null)}
        onDeploy={(draft) => {
          setBotDraft(draft);
          navigate('/bots/new');
        }}
      />
    );
  } else if (page === 'leaderboard') content = <Leaderboard {...shared} />;
  else if (page === 'docs') content = <Docs topicId={route[1]} />;
  else content = <Dashboard {...shared} />;

  const nav = [
    ['dashboard', 'Portfolio'],
    ['bots', 'Bots'],
    ['backtest', 'Backtest'],
    ['leaderboard', 'Leaderboard'],
    ['docs', 'Guide'],
  ];

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/">
          <span className="logo">▲</span> StockSim
        </a>
        <nav>
          {nav.map(([id, label]) => (
            <a key={id} href={`#/${id}`} className={page === id || (id === 'dashboard' && page === '') ? 'active' : ''}>
              {label}
            </a>
          ))}
        </nav>
        <div className="topbar-search">
          <SymbolSearch onSelect={(s) => navigate(`/stock/${s}`)} />
        </div>
        {list.length > 0 && (
          <select value={portfolioId} onChange={(e) => selectPortfolio(e.target.value)} title="Active portfolio">
            {list.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <span className={`live-dot ${connected ? 'on' : ''}`} title={connected ? 'Live data connected' : 'Reconnecting…'}>
          {connected ? 'LIVE' : 'OFFLINE'}
        </span>
      </header>
      <div className={`layout ${page === 'docs' ? 'full' : ''}`}>
        <main>{content}</main>
        {page !== 'docs' && <Watchlist symbols={watchlist} onChange={onWatchlistChange} current={stockSymbol} />}
      </div>
      <footer className="muted">
        Simulated trading with virtual money. Market data from Yahoo Finance, may be delayed. Not investment advice.
      </footer>
    </div>
  );
}

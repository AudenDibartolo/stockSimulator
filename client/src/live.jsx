import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';

const LiveContext = createContext(null);

// Holds one Server-Sent Events connection that streams quotes for every symbol
// the UI currently cares about, plus "something changed" signals for portfolios/bots.
export function LiveProvider({ symbols, children }) {
  const [quotes, setQuotes] = useState({});
  const [connected, setConnected] = useState(false);
  const [portfolioVersion, setPortfolioVersion] = useState(0);
  const [botVersion, setBotVersion] = useState(0);
  const key = [...new Set(symbols)].sort().join(',');

  useEffect(() => {
    const es = new EventSource(`/api/stream?symbols=${encodeURIComponent(key)}`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.addEventListener('quotes', (e) => {
      const data = JSON.parse(e.data);
      setQuotes((prev) => ({ ...prev, ...data }));
    });
    es.addEventListener('portfolio', () => setPortfolioVersion((v) => v + 1));
    es.addEventListener('bot', () => setBotVersion((v) => v + 1));
    return () => es.close();
  }, [key]);

  // After reconnecting, refresh anything that may have changed while offline.
  useEffect(() => {
    const refresh = () => {
      setPortfolioVersion((v) => v + 1);
      setBotVersion((v) => v + 1);
    };
    window.addEventListener('online', refresh);
    return () => window.removeEventListener('online', refresh);
  }, []);

  const value = useMemo(
    () => ({ quotes, connected, portfolioVersion, botVersion }),
    [quotes, connected, portfolioVersion, botVersion],
  );
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export const useLive = () => useContext(LiveContext);

// Whether the browser thinks it has a network connection.
export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

// Fetch JSON from the API, re-fetching whenever `url` or any of `deps` change.
export function useFetch(url, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(url) });
  const reqId = useRef(0);

  const reload = useCallback(() => {
    if (!url) return;
    const id = ++reqId.current;
    setState((s) => ({ ...s, loading: true }));
    api
      .get(url)
      .then((data) => id === reqId.current && setState({ data, error: null, loading: false }))
      .catch((error) => id === reqId.current && setState((s) => ({ ...s, error, loading: false })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  useEffect(reload, [reload]);
  return { ...state, reload };
}

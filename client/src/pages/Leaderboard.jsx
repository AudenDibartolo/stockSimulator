import { useLive } from '../live.jsx';
import { money, signedMoney, pct, tone } from '../format.js';
import { withLiveQuotes } from './Dashboard.jsx';

export default function Leaderboard({ portfolios, selectPortfolio }) {
  const { quotes } = useLive();
  const ranked = portfolios.map((p) => withLiveQuotes(p, quotes)).sort((a, b) => b.totalPnlPct - a.totalPnlPct);

  return (
    <section className="card">
      <h2>Leaderboard</h2>
      <p className="muted small">
        Compare your portfolios side by side. Run each strategy in its own portfolio to see which one wins on live data.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Portfolio</th>
              <th className="num">Value</th>
              <th className="num">Return</th>
              <th className="num">Today</th>
              <th className="num">Cash</th>
              <th className="num">Positions</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((p, i) => (
              <tr
                key={p.id}
                className="clickable"
                onClick={() => {
                  selectPortfolio(p.id);
                  window.location.hash = '/dashboard';
                }}
              >
                <td>{i + 1}</td>
                <td>
                  <b>{p.name}</b>
                  <div className="muted small">started with {money(p.startingCash)}</div>
                </td>
                <td className="num">{money(p.totalValue)}</td>
                <td className={`num ${tone(p.totalPnl)}`}>
                  {signedMoney(p.totalPnl)}
                  <div className="small">{pct(p.totalPnlPct)}</div>
                </td>
                <td className={`num ${tone(p.dayChange)}`}>{signedMoney(p.dayChange)}</td>
                <td className="num">{money(p.cash)}</td>
                <td className="num">{p.positions.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

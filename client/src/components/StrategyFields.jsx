// Strategy picker + its parameter inputs, driven by the server's strategy definitions.
export function defaultParams(strategy) {
  return Object.fromEntries((strategy?.params ?? []).map((p) => [p.key, p.default]));
}

export default function StrategyFields({ strategies, strategyId, params, onChange }) {
  const strategy = strategies.find((s) => s.id === strategyId);
  return (
    <>
      <label>
        Strategy
        <select value={strategyId} onChange={(e) => onChange(e.target.value, defaultParams(strategies.find((s) => s.id === e.target.value)))}>
          {strategies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {strategy && <span className="hint">{strategy.description}</span>}
      </label>
      <div className="param-grid">
        {strategy?.params.map((p) => (
          <label key={p.key}>
            {p.label}
            <input
              type="number"
              step={p.step ?? 'any'}
              min={p.min}
              max={p.max}
              value={params[p.key] ?? ''}
              onChange={(e) => onChange(strategyId, { ...params, [p.key]: e.target.value })}
            />
          </label>
        ))}
      </div>
    </>
  );
}

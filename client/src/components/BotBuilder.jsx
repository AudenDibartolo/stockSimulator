// Visual editor for rule-based bots: which stocks → when → what to do → limits.
import SymbolSearch from './SymbolSearch.jsx';
import HelpLink from './HelpLink.jsx';
import { metricById, newCondition, newRule, describeConfig } from '../botText.js';

const set = (obj, patch) => ({ ...obj, ...patch });

export default function BotBuilder({ catalog, config, onChange, showName = true }) {
  const update = (patch) => onChange(set(config, patch));
  const updateUniverse = (patch) => update({ universe: set(config.universe, patch) });
  const updateRule = (i, rule) => update({ rules: config.rules.map((r, j) => (j === i ? rule : r)) });
  const moveRule = (i, dir) => {
    const rules = [...config.rules];
    [rules[i], rules[i + dir]] = [rules[i + dir], rules[i]];
    update({ rules });
  };

  return (
    <div className="builder">
      <div className="form-grid">
        {showName && (
          <label>
            Bot name
            <input value={config.name} placeholder="e.g. Tech momentum" onChange={(e) => update({ name: e.target.value })} />
          </label>
        )}
        <label>
          <span>
            Bar size <HelpLink topic="bars" label="bar size" />
          </span>
          <select value={config.interval} onChange={(e) => update({ interval: e.target.value })}>
            {Object.entries(catalog.intervals).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <span className="hint">Indicators are calculated on bars of this size. "N bars" in rules means N of these.</span>
        </label>
      </div>

      <Step n={1} title="Which stocks" subtitle="Where the bot looks for opportunities." help={`source-${config.universe.source}`}>
        <UniverseEditor catalog={catalog} universe={config.universe} onChange={updateUniverse} />
        <h5>
          Stock filters (optional) <HelpLink topic="filters" label="stock filters" />
        </h5>
        <p className="hint">
          Narrow the list down by characteristics like price, volatility or volume. Stocks the bot already holds always stay in so
          their exit rules keep running.
        </p>
        <GroupEditor
          catalog={catalog}
          group={config.universe.filters}
          onChange={(filters) => updateUniverse({ filters })}
          lead="Only include stocks where"
          empty="No filters: every stock in the list is eligible."
        />
      </Step>

      <Step n={2} title="When and what to do" subtitle="Rules are checked in order for each stock, and the first rule that matches acts." help="rules">
        {config.rules.map((rule, i) => (
          <RuleEditor
            key={rule.id}
            index={i}
            count={config.rules.length}
            catalog={catalog}
            rule={rule}
            onChange={(r) => updateRule(i, r)}
            onMove={(dir) => moveRule(i, dir)}
            onRemove={() => update({ rules: config.rules.filter((_, j) => j !== i) })}
          />
        ))}
        <button type="button" onClick={() => update({ rules: [...config.rules, newRule(config.rules.length + 1)] })}>
          + Add rule
        </button>
      </Step>

      <Step n={3} title="Safety limits" subtitle="Applied to every rule. Stop-loss and take-profit are checked before any rule." help="limit-stopLossPct">
        <LimitsEditor limits={config.limits} onChange={(limits) => update({ limits })} />
      </Step>

      <div className="summary-box">
        <h5>In plain English</h5>
        <ul>
          {describeConfig(catalog, config).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Step({ n, title, subtitle, help, children }) {
  return (
    <section className="step">
      <h4>
        <span className="step-n">{n}</span> {title} {help && <HelpLink topic={help} label={title} />}
      </h4>
      {subtitle && <p className="hint">{subtitle}</p>}
      {children}
    </section>
  );
}

function UniverseEditor({ catalog, universe, onChange }) {
  const symbols = universe.symbols ?? [];
  const add = (list) => onChange({ symbols: [...new Set([...symbols, ...list])].slice(0, catalog.maxUniverse) });
  return (
    <div className="universe">
      <div className="seg">
        {Object.entries(catalog.sources).map(([id, label]) => (
          <button type="button" key={id} className={universe.source === id ? 'on' : ''} onClick={() => onChange({ source: id })}>
            {label}
          </button>
        ))}
      </div>{' '}
      <HelpLink topic={`source-${universe.source}`} label={catalog.sources[universe.source]} />

      {universe.source === 'list' && (
        <>
          <div className="chips">
            {symbols.map((s) => (
              <span key={s} className="chip">
                {s}
                <button type="button" onClick={() => onChange({ symbols: symbols.filter((x) => x !== s) })} title="Remove">
                  ×
                </button>
              </span>
            ))}
            {!symbols.length && <span className="muted small">No stocks yet. Search below or add a ready-made list.</span>}
          </div>
          <div className="row gap wrap-top">
            <div className="grow">
              <SymbolSearch placeholder="Add a stock…" onSelect={(s) => add([s])} />
            </div>
            <HelpLink topic="source-list" label="ready-made lists" />
            <select value="" onChange={(e) => e.target.value && add(catalog.symbolLists.find((l) => l.id === e.target.value).symbols)}>
              <option value="">Add a list…</option>
              {catalog.symbolLists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.symbols.length})
                </option>
              ))}
            </select>
            {symbols.length > 0 && (
              <button type="button" className="ghost small" onClick={() => onChange({ symbols: [] })}>
                Clear
              </button>
            )}
          </div>
          <p className="hint">Up to {catalog.maxUniverse} stocks. The list is fixed until you edit the bot.</p>
        </>
      )}

      {universe.source === 'screener' && (
        <>
          <div className="form-grid">
            <label>
              <span>
                Screener <HelpLink topic="source-screener" label="screeners" />
              </span>
              <select value={universe.screener} onChange={(e) => onChange({ screener: e.target.value })}>
                {Object.entries(catalog.screeners).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              How many stocks
              <input type="number" min="1" max={catalog.maxUniverse} value={universe.count} onChange={(e) => onChange({ count: e.target.value })} />
            </label>
          </div>
          <p className="hint">
            Dynamic: the bot re-reads this live Yahoo Finance screener every few minutes, so the stocks it considers change during the
            day. Screener stocks also include fundamentals (market cap, P/E, dividend yield) you can filter on.
          </p>
        </>
      )}

      {universe.source === 'watchlist' && (
        <p className="hint">Dynamic: the bot follows whatever is on your watchlist (the sidebar) at the time it checks.</p>
      )}
      {universe.source === 'holdings' && (
        <p className="hint">
          The bot manages every position in its portfolio, including ones you opened manually. Use it for automatic exits, such as a
          trailing profit-taker or a stop-loss across everything you own.
        </p>
      )}
    </div>
  );
}

function RuleEditor({ index, count, catalog, rule, onChange, onMove, onRemove }) {
  return (
    <div className="rule">
      <div className="rule-head">
        <span className="rule-n">Rule {index + 1}</span>
        <input className="rule-name" value={rule.name} onChange={(e) => onChange({ ...rule, name: e.target.value })} />
        <HelpLink topic="rules" label="rules" />
        <button type="button" className="icon-btn" disabled={index === 0} onClick={() => onMove(-1)} title="Move up">
          ↑
        </button>
        <button type="button" className="icon-btn" disabled={index === count - 1} onClick={() => onMove(1)} title="Move down">
          ↓
        </button>
        <button type="button" className="icon-btn danger" disabled={count === 1} onClick={onRemove} title="Delete rule">
          ×
        </button>
      </div>
      <GroupEditor
        catalog={catalog}
        group={rule.when}
        onChange={(when) => onChange({ ...rule, when })}
        lead="When"
        empty="No conditions: this rule acts on every bar (combine with a cooldown or position check)."
      />
      <ActionEditor catalog={catalog} action={rule.action} onChange={(action) => onChange({ ...rule, action })} />
    </div>
  );
}

export function GroupEditor({ catalog, group, onChange, lead, empty }) {
  const conditions = group?.conditions ?? [];
  const mode = group?.mode ?? 'all';
  const setConditions = (list) => onChange({ mode, conditions: list });
  return (
    <div className="group">
      {conditions.length > 0 && (
        <div className="group-lead">
          {lead}{' '}
          <select className="inline" value={mode} onChange={(e) => onChange({ mode: e.target.value, conditions })}>
            <option value="all">all</option>
            <option value="any">any</option>
          </select>{' '}
          of these are true: <HelpLink topic="all-any" label="all vs. any" />
        </div>
      )}
      {conditions.map((c, i) => (
        <ConditionRow
          key={i}
          catalog={catalog}
          condition={c}
          onChange={(nc) => setConditions(conditions.map((x, j) => (j === i ? nc : x)))}
          onRemove={() => setConditions(conditions.filter((_, j) => j !== i))}
        />
      ))}
      {!conditions.length && <p className="muted small">{empty}</p>}
      <button type="button" className="ghost small" onClick={() => setConditions([...conditions, newCondition()])}>
        + Add condition
      </button>
    </div>
  );
}

function ConditionRow({ catalog, condition, onChange, onRemove }) {
  const leftMetric = condition.left.type === 'metric' ? metricById(catalog, condition.left.metric) : null;
  const rightMetric = condition.right.type === 'metric' ? metricById(catalog, condition.right.metric) : null;
  const help = [leftMetric, rightMetric].filter(Boolean);
  return (
    <div className="condition">
      <div className="condition-row">
        <OperandEditor catalog={catalog} operand={condition.left} onChange={(left) => onChange({ ...condition, left })} />
        <select className="op" value={condition.op} onChange={(e) => onChange({ ...condition, op: e.target.value })}>
          {catalog.operators.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <HelpLink topic={condition.op.startsWith('crosses') ? 'op-crosses' : 'op-compare'} label="comparisons" />
        <OperandEditor catalog={catalog} operand={condition.right} onChange={(right) => onChange({ ...condition, right })} allowNumber unit={leftMetric?.unit} />
        <button type="button" className="icon-btn danger" onClick={onRemove} title="Remove condition">
          ×
        </button>
      </div>
      {help.map((m) => (
        <span key={m.id} className="hint">
          <b>{m.label}:</b> {m.description}{' '}
          <a href={`#/docs/metric-${m.id}`} target="_blank" rel="noopener noreferrer" className="learn-more">
            Learn more →
          </a>
        </span>
      ))}
    </div>
  );
}

const UNIT_PREFIX = { $: '$', $B: '$' };
const UNIT_SUFFIX = { '%': '%', $B: 'B', x: '×', bars: 'bars', shares: 'shares' };

function OperandEditor({ catalog, operand, onChange, unit }) {
  const groups = [...new Set(catalog.metrics.map((m) => m.group))];
  const metric = operand.type === 'metric' ? metricById(catalog, operand.metric) : null;
  const choose = (value) => {
    if (value === '__value') return onChange({ type: 'value', value: 0 });
    const m = metricById(catalog, value);
    const next = { type: 'metric', metric: value };
    for (const p of m.params) next[p.key] = operand[p.key] ?? p.default;
    onChange(next);
  };
  return (
    <span className="operand">
      <select value={operand.type === 'value' ? '__value' : operand.metric} onChange={(e) => choose(e.target.value)}>
        <option value="__value">A number…</option>
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {catalog.metrics
              .filter((m) => m.group === g)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      {operand.type === 'value' && (
        <span className="with-unit">
          {UNIT_PREFIX[unit] && <span className="unit">{UNIT_PREFIX[unit]}</span>}
          <input type="number" step="any" value={operand.value} onChange={(e) => onChange({ type: 'value', value: e.target.value })} />
          {UNIT_SUFFIX[unit] && <span className="unit">{UNIT_SUFFIX[unit]}</span>}
        </span>
      )}
      {metric?.params.map((p) => (
        <span key={p.key} className="with-unit period">
          <input
            type="number"
            min={p.min}
            max={p.max}
            step="1"
            value={operand[p.key]}
            title={`${metric.label}: number of bars`}
            onChange={(e) => onChange({ ...operand, [p.key]: e.target.value })}
          />
          <span className="unit">bars</span>
        </span>
      ))}
    </span>
  );
}

function ActionEditor({ catalog, action, onChange }) {
  const def = catalog.actions.find((a) => a.id === action.type);
  const isPct = action.sizing?.startsWith('pct_');
  return (
    <div className="action-row">
      <span className="then">Then</span>
      <select
        className={`action-type ${action.type}`}
        value={action.type}
        onChange={(e) => {
          const next = catalog.actions.find((a) => a.id === e.target.value);
          const sizing = next.sizings.includes(action.sizing) ? action.sizing : next.sizings[0];
          onChange({ type: next.id, sizing, amount: action.amount || 10 });
        }}
      >
        {catalog.actions.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </select>
      <HelpLink topic={`action-${action.type}`} label={def.label} />
      {action.sizing !== 'all' && (
        <span className="with-unit">
          {action.sizing === 'dollars' && <span className="unit">$</span>}
          <input type="number" min="0" step="any" value={action.amount} onChange={(e) => onChange({ ...action, amount: e.target.value })} />
          {isPct && <span className="unit">%</span>}
        </span>
      )}
      <select value={action.sizing} onChange={(e) => onChange({ ...action, sizing: e.target.value })}>
        {def.sizings.map((s) => (
          <option key={s} value={s}>
            {s === 'shares' ? 'shares' : s === 'dollars' ? 'worth' : catalog.sizings[s]}
          </option>
        ))}
      </select>
      <HelpLink topic="sizing" label="order size" />
      {action.type === 'short' && <span className="hint">Short = sell borrowed shares, profit if the price falls. Needs 50% margin.</span>}
    </div>
  );
}

function LimitsEditor({ limits, onChange }) {
  const field = (key, label, hint, props = {}) => (
    <label>
      <span>
        {label} <HelpLink topic={`limit-${key}`} label={label} />
      </span>
      <input type="number" step="any" min="0" value={limits[key]} onChange={(e) => onChange({ ...limits, [key]: e.target.value })} {...props} />
      <span className="hint">{hint}</span>
    </label>
  );
  return (
    <div className="form-grid">
      {field('stopLossPct', 'Stop-loss %', 'Close a position once it loses this much (0 = off).')}
      {field('takeProfitPct', 'Take-profit %', 'Close a position once it gains this much (0 = off).')}
      {field('maxPositions', 'Max open positions', 'New entries are skipped once the bot holds this many stocks.', { step: 1, min: 1 })}
      {field('maxPositionPct', 'Max position size %', 'No single stock may exceed this % of portfolio value.', { min: 1, max: 100 })}
      {field('cooldownBars', 'Cooldown (bars)', 'After trading a stock, wait this many bars before trading it again.', { step: 1 })}
    </div>
  );
}

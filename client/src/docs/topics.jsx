// Content of the bot guide. Each topic explains one option of the bot builder.
// Topic ids are referenced by the "?" help links in the builder, so keep them stable:
//   metric-<metric id>, op-compare / op-crosses, action-<type>, source-<source>,
//   limit-<limits key>, sizing, rules, all-any, filters, bars, preview, backtest, …
import * as F from './figures.jsx';

const Ex = ({ children }) => (
  <div className="doc-callout example">
    <b>Example</b> {children}
  </div>
);
const Tip = ({ children }) => (
  <div className="doc-callout tip">
    <b>Tip</b> {children}
  </div>
);
const Warn = ({ children }) => (
  <div className="doc-callout warn">
    <b>Watch out</b> {children}
  </div>
);
const L = ({ to, children }) => <a href={`#/docs/${to}`}>{children}</a>;
const Values = ({ rows }) => (
  <table className="doc-table">
    <tbody>
      {rows.map(([a, b]) => (
        <tr key={a}>
          <td>{a}</td>
          <td>{b}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

export const CATEGORIES = [
  'Getting started',
  'Choosing stocks',
  'Rules and conditions',
  'Metrics: price and trend',
  'Metrics: momentum and volatility',
  'Metrics: volume',
  'Metrics: company fundamentals',
  "Metrics: the bot's own position",
  'Actions',
  'Order size',
  'Safety limits',
  'Testing your bot',
  'Help',
];

const STEP1 = 'Bot builder → Step 1: Which stocks';
const STEP2 = 'Bot builder → Step 2: a rule';
const COND = 'Bot builder → Step 2: a condition';
const STEP3 = 'Bot builder → Step 3: Safety limits';

export const TOPICS = [
  // ---- Getting started ------------------------------------------------------------
  {
    id: 'what-is-a-bot',
    category: 'Getting started',
    title: 'How bots work',
    summary: 'A bot is a set of instructions that trades for you automatically, using pretend money and real prices.',
    keywords: ['overview', 'introduction', 'automatic', 'algorithm', 'strategy'],
    figure: <F.BotLoopFig />,
    body: (
      <>
        <p>
          A bot follows the instructions you give it, around the clock, without emotions. You tell it three things: <b>which stocks</b> to
          watch, <b>when</b> to act, and <b>what</b> to do. Every 30 seconds it checks each stock and trades if one of your rules says so.
        </p>
        <p>
          All trading uses the virtual money in a portfolio, but the prices are real and live, so you can see how an idea would have done
          without risking anything.
        </p>
        <Tip>
          Start from a <L to="templates">template</L>, run a <L to="preview">preview</L>, then <L to="backtest">backtest</L> it before
          letting it trade.
        </Tip>
      </>
    ),
  },
  {
    id: 'bars',
    category: 'Getting started',
    title: 'Bars and bar size',
    summary: 'Prices are grouped into "bars" (5 minutes, 15 minutes, 1 hour or 1 day). Indicators count in bars.',
    keywords: ['bar size', 'interval', 'candle', 'candlestick', 'timeframe', 'daily', 'hourly', 'minute', 'OHLC'],
    where: 'Bot builder → Bar size',
    figure: (
      <>
        <F.CandleAnatomyFig />
        <F.BarSizesFig />
      </>
    ),
    body: (
      <>
        <p>
          A <b>bar</b> summarizes the price over a fixed period: where it opened, where it closed, and the highest and lowest prices in
          between. The bar size you pick controls how the bot sees the market.
        </p>
        <Values
          rows={[
            ['5-minute / 15-minute', 'Fast. For day trading; reacts to small moves but sees a lot of noise.'],
            ['Hourly', 'A middle ground: about 7 bars per trading day.'],
            ['Daily', 'Slow and steady. One bar per trading day; best for most beginners.'],
          ]}
        />
        <p>
          Whenever a setting says <b>“N bars”</b>, it means N of the bars you chose. “SMA(20)” is a 20-day average on daily bars but only a
          100-minute average on 5-minute bars.
        </p>
        <Tip>Each rule can act at most once per bar for each stock, so on daily bars a rule trades a stock at most once a day.</Tip>
      </>
    ),
  },
  {
    id: 'templates',
    category: 'Getting started',
    title: 'Templates',
    summary: 'Ready-made bots you can use as they are or change. Each one explains its idea, its strengths and its risks.',
    keywords: ['preset', 'ready-made', 'example', 'starter', 'dca', 'crossover', 'turtle', 'mean reversion'],
    where: 'Bots → New bot, or the “Start from” menu on Backtest',
    body: (
      <>
        <p>
          A template fills in every part of the builder for you: stocks, rules and limits. Click <b>How it works</b> on any template to read
          what it does, when it does well and what can go wrong. After choosing one you can change anything.
        </p>
        <Values
          rows={[
            ['Dollar-cost averaging', 'Buys a fixed amount on a schedule. The simplest long-term approach.'],
            ['Moving-average crossover', 'Follows trends using two moving averages.'],
            ['RSI mean reversion', 'Buys short-term drops in quality stocks.'],
            ['Channel breakout', 'Buys when price breaks out to new highs.'],
            ['Screener momentum', 'Day-trades fast movers from a live screener.'],
            ['Short overbought spikes', 'Bets against stocks that rose too fast.'],
            ['Buy dips in calm stocks', 'Uses the volatility score to pick steady stocks.'],
          ]}
        />
      </>
    ),
  },

  // ---- Choosing stocks --------------------------------------------------------------
  {
    id: 'source-list',
    category: 'Choosing stocks',
    title: 'Specific stocks (a fixed list)',
    summary: 'You choose exactly which stocks the bot watches, one by one or from a ready-made list.',
    keywords: ['universe', 'symbols', 'tickers', 'hand-picked', 'dow 30', 'sector etf', 'mega-cap', 'dividend', 'index'],
    where: STEP1,
    body: (
      <>
        <p>
          Type a company name or ticker to add it, or use <b>Add a list…</b> to add a whole group at once. The list stays the same until you
          edit the bot. A bot can watch up to 30 stocks.
        </p>
        <Values
          rows={[
            ['Mega-cap tech', 'The largest technology companies (Apple, Microsoft, Nvidia, …).'],
            ['Dow Jones 30', '30 large, well-known US companies.'],
            ['S&P sector ETFs', 'One fund per sector of the economy (tech, energy, health, …).'],
            ['Index ETFs', 'Funds that track the whole market, such as SPY.'],
            ['Dividend stalwarts', 'Steady companies known for paying dividends.'],
          ]}
        />
        <Tip>An ETF is a single fund you can buy like a stock that holds many companies at once. Good for calmer strategies.</Tip>
      </>
    ),
  },
  {
    id: 'source-screener',
    category: 'Choosing stocks',
    title: 'Live screener (dynamic list)',
    summary: 'The bot pulls its stocks from a live Yahoo Finance list, such as today’s biggest gainers, so its choices change during the day.',
    keywords: ['dynamic', 'screener', 'gainers', 'losers', 'most active', 'small cap', 'undervalued', 'most shorted', 'scan'],
    where: STEP1,
    body: (
      <>
        <p>
          Instead of a fixed list, the bot re-reads a live screener every few minutes and looks at the top stocks on it (you choose how
          many, up to 30). Stocks from a screener also come with <L to="metric-market_cap">company fundamentals</L> you can filter on.
        </p>
        <Values
          rows={[
            ['Day gainers / losers', 'The biggest % rises / falls today.'],
            ['Most active', 'The most shares traded today.'],
            ['Small caps with momentum, Aggressive small caps', 'Smaller, faster-moving companies.'],
            ['Growth technology stocks', 'Tech companies with fast-growing earnings.'],
            ['Undervalued growth / large caps', 'Stocks that look cheap compared to their earnings.'],
            ['Most shorted stocks', 'Stocks many traders are betting against.'],
          ]}
        />
        <Warn>
          Screener stocks are often very volatile. If a stock drops off the screener while the bot owns it, the bot keeps managing it until
          it sells.
        </Warn>
      </>
    ),
  },
  {
    id: 'source-watchlist',
    category: 'Choosing stocks',
    title: 'My watchlist',
    summary: 'The bot follows whatever is on your watchlist (the panel on the right) at the moment it checks.',
    keywords: ['watchlist', 'dynamic', 'sidebar'],
    where: STEP1,
    body: (
      <p>
        Add or remove stocks from your watchlist at any time and the bot picks up the change on its next check. This is a handy way to
        steer a bot without editing it. The first 30 stocks are used.
      </p>
    ),
  },
  {
    id: 'source-holdings',
    category: 'Choosing stocks',
    title: "Portfolio's current holdings",
    summary: 'The bot manages every stock already in its portfolio, including ones you bought yourself.',
    keywords: ['holdings', 'positions', 'manage', 'exit', 'protect', 'trailing'],
    where: STEP1,
    body: (
      <>
        <p>
          Normally a bot only sells shares it bought itself. With this option it takes charge of <b>every</b> position in the portfolio. This
          is ideal for protective bots, for example “sell half of anything that is up 20%” or a stop-loss on everything you own.
        </p>
        <Warn>These bots can't be backtested, because past holdings depend on what you traded by hand.</Warn>
      </>
    ),
  },
  {
    id: 'filters',
    category: 'Choosing stocks',
    title: 'Stock filters',
    summary: 'Optional checks that remove stocks from consideration, such as “only stocks over $10” or “only calm stocks”.',
    keywords: ['filter', 'screen', 'characteristic', 'exclude', 'include', 'narrow', 'eligible'],
    where: `${STEP1} → Stock filters`,
    figure: <F.FilterFunnelFig />,
    body: (
      <>
        <p>
          Filters use the same <L to="op-compare">conditions</L> as rules, but they decide <b>which stocks are allowed</b> rather than what to
          do. A stock that fails is skipped entirely on that check. Filters are re-checked every time, so a stock can drop in and out.
        </p>
        <Ex>“Price ≥ $10” and “Volatility score(60) &lt; 30%” keeps only steady stocks that aren't penny stocks.</Ex>
        <Tip>Stocks the bot already owns skip the filters, so their sell rules always get a chance to run.</Tip>
      </>
    ),
  },

  // ---- Rules and conditions --------------------------------------------------------------
  {
    id: 'rules',
    category: 'Rules and conditions',
    title: 'Rules',
    summary: 'A rule is “when these conditions are true, do this”. Rules are checked from top to bottom.',
    keywords: ['rule', 'order', 'priority', 'first match', 'when', 'then', 'entry', 'exit', 'signal'],
    where: STEP2,
    figure: <F.RuleOrderFig />,
    body: (
      <>
        <p>
          Each rule has <b>conditions</b> (the “when”) and one <b>action</b> (the “then”). For every stock, the bot goes through your rules
          in order, and the <b>first</b> rule whose conditions pass is the one that acts. Use the ↑ ↓ arrows to change the order.
        </p>
        <p>Most bots need at least two rules: one to get in (buy) and one to get out (sell).</p>
        <Tip>
          Put exit rules above entry rules so selling always gets priority. A rule with no conditions acts on every bar, which is useful with
          a <L to="limit-cooldownBars">cooldown</L>.
        </Tip>
      </>
    ),
  },
  {
    id: 'all-any',
    category: 'Rules and conditions',
    title: 'All vs. any',
    summary: '“All” means every condition must be true. “Any” means at least one must be true.',
    keywords: ['and', 'or', 'all', 'any', 'logic', 'combine', 'multiple conditions'],
    where: `${STEP2} → “When all/any of these are true”`,
    figure: <F.AllAnyFig />,
    body: (
      <>
        <p>
          <b>All</b> (AND) is strict: use it to require several signs before acting, like “cheap <i>and</i> trending up <i>and</i> busy
          trading”. <b>Any</b> (OR) is loose: use it when any one of several reasons is enough, like “sell if the trend breaks <i>or</i> the
          stock is up 20%”.
        </p>
        <Tip>Need both? Make two rules, one with “all” and one with “any”.</Tip>
      </>
    ),
  },
  {
    id: 'op-compare',
    category: 'Rules and conditions',
    title: 'Conditions and comparisons (>, <, =)',
    summary: 'A condition compares a metric to a number, or to another metric, and is either true or false.',
    keywords: ['condition', 'compare', 'greater', 'less', 'equal', 'not equal', 'operator', 'threshold', 'number', 'metric'],
    where: COND,
    figure: <F.PriceLevelFig />,
    body: (
      <>
        <p>
          The left side is usually a <b>metric</b> (something measured about the stock, like its price or RSI). The right side can be a
          number you type (<b>A number…</b>) or another metric.
        </p>
        <Values
          rows={[
            ['>  ≥', 'greater than / greater than or equal to'],
            ['<  ≤', 'less than / less than or equal to'],
            ['=  ≠', 'equal / not equal. Mostly used as “Bot’s shares = 0” (the bot owns none).'],
          ]}
        />
        <Ex>“RSI(14) &lt; 30”, or metric vs. metric: “Price &gt; SMA(50)”.</Ex>
        <Tip>If a metric has no value (for example, not enough history yet), the condition counts as false. See <L to="no-trades">Why isn't my bot trading?</L></Tip>
      </>
    ),
  },
  {
    id: 'op-crosses',
    category: 'Rules and conditions',
    title: 'Crosses above / crosses below',
    summary: 'True only on the one bar where something moves from one side of a level to the other.',
    keywords: ['cross', 'crossover', 'crosses above', 'crosses below', 'golden cross', 'death cross', 'event', 'once'],
    where: COND,
    figure: <F.CompareVsCrossFig />,
    body: (
      <>
        <p>
          “&gt;” is true for as long as something stays above. <b>“Crosses above”</b> is only true at the moment it moves from below (or
          equal) to above, comparing the previous bar with the current one. That makes it perfect for “act once when this happens”.
        </p>
        <Ex>“SMA(10) crosses above SMA(30)” fires once when a new uptrend may be starting. See the <L to="metric-sma">moving average</L> topic.</Ex>
      </>
    ),
  },

  // ---- Metrics: price and trend ------------------------------------------------------------
  {
    id: 'metric-price',
    category: 'Metrics: price and trend',
    title: 'Price',
    summary: 'The latest price of the stock.',
    keywords: ['price', 'last', 'current', 'quote', 'level', 'target'],
    where: COND,
    body: (
      <>
        <p>
          In a live bot this is the real-time price. In a <L to="backtest">backtest</L> it's the closing price of each bar. Use it for
          simple “price reaches a point” rules, or compare it with other metrics.
        </p>
        <Ex>“Price &lt; $150” to buy below a target, or “Price &gt; N-bar high(20)” for a breakout.</Ex>
      </>
    ),
  },
  {
    id: 'metric-change_pct',
    category: 'Metrics: price and trend',
    title: 'Change %',
    summary: 'How much the price has risen or fallen over the last N bars, in percent.',
    keywords: ['change', 'percent', 'return', 'momentum', 'rate of change', 'move', 'drop', 'rise', 'gain'],
    where: COND,
    figure: <F.ChangePctFig />,
    body: (
      <>
        <p>
          Compares the current price with the price N bars ago. +10% means the stock rose 10% over that stretch, and −5% means it fell 5%.
          This is the tool for “the price changed by X in a certain time”.
        </p>
        <Ex>“Change %(5) &lt; −4%” on daily bars: the stock fell more than 4% in a week. “Change %(4) &gt; 2%” on 15-minute bars: up 2% in the last hour.</Ex>
      </>
    ),
  },
  {
    id: 'metric-day_change_pct',
    category: 'Metrics: price and trend',
    title: "Today's change %",
    summary: "How far the price has moved since yesterday's closing price, whatever your bar size.",
    keywords: ['today', 'daily change', 'day', 'gap', 'previous close'],
    where: COND,
    figure: <F.DayChangeFig />,
    body: (
      <>
        <p>
          This is the number you see in the news (“Apple is up 2% today”). Unlike <L to="metric-change_pct">Change %</L>, it always measures
          from the previous day's close, even on 5-minute bars.
        </p>
        <Ex>“Today's change % &gt; 5%” to catch big movers, or “&lt; −3%” to avoid stocks having a bad day.</Ex>
      </>
    ),
  },
  {
    id: 'metric-sma',
    category: 'Metrics: price and trend',
    title: 'Simple moving average (SMA)',
    summary: 'The average closing price of the last N bars. A smoothed-out version of the price that shows the trend.',
    keywords: ['sma', 'moving average', 'average', 'trend', 'smooth', 'golden cross', 'death cross', '200 day', '50 day'],
    where: COND,
    figure: (
      <>
        <F.SmaFig />
        <F.CrossoverFig />
      </>
    ),
    body: (
      <>
        <p>
          Price zig-zags every day; its average doesn't. When the price is <b>above</b> its moving average, the stock has generally been
          rising (an uptrend), and below it, falling. Bigger N means smoother and slower.
        </p>
        <Values
          rows={[
            ['SMA(10–20)', 'short-term trend'],
            ['SMA(50)', 'medium-term trend'],
            ['SMA(200)', 'long-term trend; widely watched by investors'],
          ]}
        />
        <Ex>“Price &gt; SMA(200)” as a filter means “only stocks in a long-term uptrend”. “SMA(10) crosses above SMA(30)” is the classic golden cross buy signal.</Ex>
      </>
    ),
  },
  {
    id: 'metric-ema',
    category: 'Metrics: price and trend',
    title: 'Exponential moving average (EMA)',
    summary: 'A moving average that counts recent bars more heavily, so it reacts faster than the SMA.',
    keywords: ['ema', 'exponential', 'moving average', 'fast', 'responsive', 'trend'],
    where: COND,
    figure: <F.EmaFig />,
    body: (
      <>
        <p>
          Same idea as the <L to="metric-sma">SMA</L>, but newer prices matter more. It catches turns sooner, with the trade-off of more false
          alarms. Popular for short-term trading.
        </p>
        <Ex>“Price crosses below EMA(20)” as a quick exit when momentum fades.</Ex>
      </>
    ),
  },
  {
    id: 'metric-high_n',
    category: 'Metrics: price and trend',
    title: 'N-bar high',
    summary: 'The highest price of the previous N bars. Breaking above it is called a breakout.',
    keywords: ['high', 'highest', 'breakout', 'resistance', 'donchian', 'channel', 'turtle', 'new high'],
    where: COND,
    figure: <F.ChannelFig />,
    body: (
      <>
        <p>
          Looks back N bars (not counting the current one) and takes the highest price. If the price is now above that, the stock is
          trading higher than at any point in that period, which often signals strong demand.
        </p>
        <Ex>“Price &gt; N-bar high(20)” on daily bars = the highest price in about a month.</Ex>
      </>
    ),
  },
  {
    id: 'metric-low_n',
    category: 'Metrics: price and trend',
    title: 'N-bar low',
    summary: 'The lowest price of the previous N bars. Falling below it is called a breakdown.',
    keywords: ['low', 'lowest', 'breakdown', 'support', 'donchian', 'channel', 'exit'],
    where: COND,
    body: (
      <>
        <p>
          The mirror image of <L to="metric-high_n">N-bar high</L>. Dropping below the recent low is a common sign that a rise is over, so
          it's often used as an exit or a reason to short.
        </p>
        <Ex>“Price &lt; N-bar low(10)” → sell the entire position.</Ex>
      </>
    ),
  },
  {
    id: 'metric-pct_from_high',
    category: 'Metrics: price and trend',
    title: '% below N-bar high',
    summary: 'How far the price has fallen from its recent peak. 0% means it is at the peak.',
    keywords: ['drawdown', 'from high', 'pullback', 'dip', 'correction', 'off the highs'],
    where: COND,
    figure: <F.PctFromHighFig />,
    body: (
      <>
        <p>
          Always 0 or negative. −10% means the stock is 10% below the highest price of the last N bars. It's useful for buying pullbacks or
          avoiding stocks that have crashed.
        </p>
        <Ex>“% below N-bar high(50) &lt; −15%”: a stock that has pulled back more than 15% from its recent high.</Ex>
      </>
    ),
  },
  {
    id: 'metric-price_vs_sma_pct',
    category: 'Metrics: price and trend',
    title: '% above SMA',
    summary: 'How far the price is above (+) or below (−) its moving average. Measures how “stretched” a stock is.',
    keywords: ['distance', 'stretched', 'extended', 'overextended', 'above average', 'below average', 'trend filter'],
    where: COND,
    figure: <F.PriceVsSmaFig />,
    body: (
      <>
        <p>
          Positive means price is above its <L to="metric-sma">SMA</L> (uptrend), negative means below. Very large values mean the stock has
          run far from its average, and such gaps often shrink again.
        </p>
        <Ex>“% above SMA(200) &gt; 0” keeps only uptrending stocks. “% above SMA(20) &gt; 8%” spots an overextended stock to short.</Ex>
      </>
    ),
  },

  // ---- Momentum & volatility -----------------------------------------------------------
  {
    id: 'metric-rsi',
    category: 'Metrics: momentum and volatility',
    title: 'RSI (Relative Strength Index)',
    summary: 'A 0–100 score of how fast the price has been rising or falling. Below 30 = “oversold”, above 70 = “overbought”.',
    keywords: ['rsi', 'relative strength', 'oversold', 'overbought', 'momentum', 'oscillator', 'mean reversion'],
    where: COND,
    figure: <F.RsiFig />,
    body: (
      <>
        <p>
          RSI compares the size of recent up-moves with recent down-moves. A low RSI means sellers have been in control lately and a high
          RSI means buyers have. Extreme readings often (not always) bounce back toward the middle.
        </p>
        <Values
          rows={[
            ['Below 30', 'oversold: fell fast, may bounce'],
            ['30–70', 'normal'],
            ['Above 70', 'overbought: rose fast, may pull back'],
          ]}
        />
        <Ex>“RSI(14) &lt; 30” → buy; “RSI(14) &gt; 65” → sell. The standard period is 14 bars.</Ex>
        <Warn>In a strong trend RSI can stay “overbought” or “oversold” for a long time.</Warn>
      </>
    ),
  },
  {
    id: 'metric-volatility',
    category: 'Metrics: momentum and volatility',
    title: 'Volatility score',
    summary: 'How wildly a stock’s price swings, as a yearly percentage. Higher = bigger, less predictable moves.',
    keywords: ['volatility', 'risk', 'standard deviation', 'swing', 'calm', 'wild', 'stable', 'annualized'],
    where: COND,
    figure: <F.VolatilityFig />,
    body: (
      <>
        <p>
          Measures how much the price typically bounces around from bar to bar over the last N bars, scaled to a year so it's comparable
          across bar sizes. Use it to pick calm or exciting stocks, or to stay out when things get choppy.
        </p>
        <Values
          rows={[
            ['10–20%', 'calm: broad index funds, utilities'],
            ['20–40%', 'typical large companies'],
            ['60%+', 'very jumpy: small or speculative stocks'],
          ]}
        />
        <Ex>Filter “Volatility score(60) &lt; 25%” to trade only steady stocks.</Ex>
      </>
    ),
  },
  {
    id: 'metric-atr_pct',
    category: 'Metrics: momentum and volatility',
    title: 'Average true range % (ATR)',
    summary: 'The typical size of one bar’s price range, as a % of the price. Another way to measure how much a stock moves.',
    keywords: ['atr', 'average true range', 'range', 'volatility', 'movement', 'gap'],
    where: COND,
    figure: <F.AtrFig />,
    body: (
      <>
        <p>
          Averages how tall each bar is, from high to low (gaps between bars count too). 2% means the stock typically moves about 2% within a
          single bar. It's easier to picture than the <L to="metric-volatility">volatility score</L> because it's in “per bar” terms.
        </p>
        <Ex>“ATR %(14) &gt; 3%” on daily bars finds stocks that move a lot each day, which suits day-trading bots.</Ex>
      </>
    ),
  },

  // ---- Volume ----------------------------------------------------------------------------
  {
    id: 'metric-volume',
    category: 'Metrics: volume',
    title: 'Volume',
    summary: 'How many shares were traded in the current bar.',
    keywords: ['volume', 'shares traded', 'activity', 'liquidity'],
    where: COND,
    figure: <F.VolumeFig />,
    body: (
      <>
        <p>
          Volume shows how much interest there is in a stock. A price move on high volume is usually more meaningful than one on low volume.
        </p>
        <Warn>The current bar is still in progress, so its volume keeps growing until the bar ends. For comparisons, <L to="metric-rel_volume">relative volume</L> is usually more useful.</Warn>
      </>
    ),
  },
  {
    id: 'metric-avg_volume',
    category: 'Metrics: volume',
    title: 'Average volume',
    summary: 'The average number of shares traded per bar over the previous N bars.',
    keywords: ['average volume', 'liquidity', 'illiquid', 'thinly traded'],
    where: COND,
    body: (
      <>
        <p>
          A measure of how actively a stock normally trades. Stocks with very low volume (“illiquid”) can jump around on small orders, so many
          traders avoid them.
        </p>
        <Ex>Filter “Average volume(20) ≥ 1,000,000” on daily bars to stick to popular, easily traded stocks.</Ex>
      </>
    ),
  },
  {
    id: 'metric-rel_volume',
    category: 'Metrics: volume',
    title: 'Relative volume',
    summary: 'Current volume divided by average volume. 2× means twice as much trading as usual.',
    keywords: ['relative volume', 'rvol', 'unusual volume', 'spike', 'surge', 'interest'],
    where: COND,
    body: (
      <>
        <p>
          A quick way to spot unusual excitement. A big price move with relative volume above 2× suggests lots of traders are piling in,
          perhaps because of news.
        </p>
        <Ex>“Change %(4) &gt; 2%” AND “Relative volume(20) &gt; 1.5×”: a move that is backed by real buying.</Ex>
      </>
    ),
  },

  // ---- Fundamentals ------------------------------------------------------------------------
  {
    id: 'metric-market_cap',
    category: 'Metrics: company fundamentals',
    title: 'Market cap',
    summary: 'The total value of the company in billions of dollars. Only available for screener stocks.',
    keywords: ['market cap', 'capitalization', 'size', 'large cap', 'small cap', 'fundamentals', 'billion'],
    where: COND,
    body: (
      <>
        <p>Share price × number of shares. It tells you how big the company is.</p>
        <Values
          rows={[
            ['Under $2B', 'small cap: more room to grow, more risk'],
            ['$2B–$10B', 'mid cap'],
            ['Over $10B', 'large cap: established companies'],
          ]}
        />
        <Warn>
          Fundamentals only exist for stocks that come from a <L to="source-screener">live screener</L>. For other stocks the condition is
          always false.
        </Warn>
      </>
    ),
  },
  {
    id: 'metric-pe',
    category: 'Metrics: company fundamentals',
    title: 'P/E ratio',
    summary: 'Price divided by the company’s yearly earnings per share: how many dollars you pay for $1 of profit.',
    keywords: ['pe', 'p/e', 'price earnings', 'valuation', 'cheap', 'expensive', 'value', 'fundamentals'],
    where: COND,
    body: (
      <>
        <p>
          A P/E of 15 means investors pay $15 for every $1 the company earns per year. Lower can mean “cheap”, and higher means investors
          expect fast growth. Companies losing money have no P/E.
        </p>
        <Ex>“P/E ratio &lt; 20” to focus on reasonably priced companies. Only works with <L to="source-screener">screener</L> stocks.</Ex>
      </>
    ),
  },
  {
    id: 'metric-dividend_yield',
    category: 'Metrics: company fundamentals',
    title: 'Dividend yield %',
    summary: 'Cash the company pays shareholders each year, as a % of the share price.',
    keywords: ['dividend', 'yield', 'income', 'payout', 'fundamentals'],
    where: COND,
    body: (
      <>
        <p>
          A 3% yield on a $100 stock means about $3 per share per year in dividends. Dividend payers tend to be mature, steady companies.
          (The simulator doesn't pay dividends into your portfolio.)
        </p>
        <Ex>“Dividend yield % &gt; 2.5%”. Only works with <L to="source-screener">screener</L> stocks.</Ex>
      </>
    ),
  },

  // ---- Position ------------------------------------------------------------------------------
  {
    id: 'metric-position_qty',
    category: "Metrics: the bot's own position",
    title: "Bot's shares",
    summary: 'How many shares of this stock the bot holds: positive = owns them, negative = short, 0 = none.',
    keywords: ['position', 'shares held', 'quantity', 'flat', 'holding', 'own', 'long', 'short', 'in position'],
    where: COND,
    body: (
      <>
        <p>Add this to rules so they only act at the right time:</p>
        <Values
          rows={[
            ['= 0', 'the bot owns none (use on buy rules so it doesn’t keep buying)'],
            ['> 0', 'the bot owns shares (use on sell rules)'],
            ['< 0', 'the bot is short (use on cover rules)'],
          ]}
        />
        <Warn>Without “Bot's shares = 0”, a buy rule keeps buying more on every new bar while its conditions stay true.</Warn>
      </>
    ),
  },
  {
    id: 'metric-position_pnl_pct',
    category: "Metrics: the bot's own position",
    title: 'Position profit %',
    summary: 'How much the bot is up or down on this stock compared with what it paid.',
    keywords: ['profit', 'loss', 'pnl', 'gain', 'return', 'unrealized', 'take profit', 'stop loss'],
    where: COND,
    figure: <F.PositionPnlFig />,
    body: (
      <>
        <p>
          Compares the current price with the bot's average entry price. For shorts it's flipped: a short is “in profit” when the price has
          fallen. It's empty when the bot has no position, so conditions using it are false.
        </p>
        <Ex>“Position profit % ≥ 15%” → sell 50% of the position, to lock in some gains and let the rest run.</Ex>
        <Tip>For simple exits, the built-in <L to="limit-stopLossPct">stop-loss</L> and <L to="limit-takeProfitPct">take-profit</L> do this for you.</Tip>
      </>
    ),
  },
  {
    id: 'metric-bars_held',
    category: "Metrics: the bot's own position",
    title: 'Bars held',
    summary: 'How many bars since the bot opened its current position in this stock.',
    keywords: ['bars held', 'holding period', 'time', 'time stop', 'duration', 'age'],
    where: COND,
    figure: <F.BarsTimelineFig />,
    body: (
      <>
        <p>
          Used for <b>time-based exits</b>: if a trade hasn't worked out after a while, get out and free the money for something else. Empty
          when the bot has no position.
        </p>
        <Ex>“Bars held ≥ 20” → sell the entire position, giving every trade about a month on daily bars.</Ex>
      </>
    ),
  },
  {
    id: 'metric-bars_since_trade',
    category: "Metrics: the bot's own position",
    title: 'Bars since last trade',
    summary: 'How many bars since the bot last bought or sold this stock. Perfect for schedules like “every 5 days”.',
    keywords: ['schedule', 'every', 'periodic', 'recurring', 'dca', 'dollar cost averaging', 'frequency', 'since last'],
    where: COND,
    body: (
      <>
        <p>
          Counts from the most recent trade of any kind in this stock. If the bot has never traded the stock it counts as “never”, which is
          bigger than any number, so “≥ 5” is true right away.
        </p>
        <Ex>“Bars since last trade ≥ 5” → buy $500. On daily bars that's roughly a weekly purchase (dollar-cost averaging).</Ex>
      </>
    ),
  },

  // ---- Actions ---------------------------------------------------------------------------------
  {
    id: 'action-buy',
    category: 'Actions',
    title: 'Buy',
    summary: 'Buy shares, betting that the price will go up.',
    keywords: ['buy', 'long', 'purchase', 'enter', 'open'],
    where: `${STEP2} → Then`,
    body: (
      <>
        <p>
          Buying (“going long”) means you profit when the price rises. The bot can add to a stock it already owns unless you add “Bot's
          shares = 0”. Fractional shares are allowed. The amount is set by the <L to="sizing">order size</L> and capped by your{' '}
          <L to="limit-maxPositionPct">limits</L> and buying power.
        </p>
        <Tip>You can't buy a stock the bot is currently short. Cover it first.</Tip>
      </>
    ),
  },
  {
    id: 'action-sell',
    category: 'Actions',
    title: 'Sell',
    summary: 'Sell shares the bot owns, to take a profit or cut a loss.',
    keywords: ['sell', 'exit', 'close', 'take profit', 'cut loss'],
    where: `${STEP2} → Then`,
    body: (
      <p>
        Sells shares the bot bought earlier. Choose <b>the entire position</b>, a <b>% of the position</b> (e.g. sell half), or a number of
        shares. A bot only sells shares it bought itself, so your own shares are safe, unless it uses the{' '}
        <L to="source-holdings">current holdings</L> source.
      </p>
    ),
  },
  {
    id: 'action-short',
    category: 'Actions',
    title: 'Short',
    summary: 'Sell borrowed shares now and buy them back later, betting that the price will fall.',
    keywords: ['short', 'short selling', 'bet against', 'bearish', 'borrow', 'fall', 'decline'],
    where: `${STEP2} → Then`,
    figure: <F.LongShortFig />,
    body: (
      <>
        <p>
          Shorting flips a normal trade. You sell first at today's price and buy back (“<L to="action-cover">cover</L>”) later. If the price
          drops you keep the difference, and if it rises you lose money.
        </p>
        <Ex>Short 10 shares at $100 and cover at $90: +$100 profit. Cover at $120 instead: −$200 loss.</Ex>
        <Warn>
          A stock can rise without limit, so short losses can be bigger than the amount you started with. Shorting also ties up extra cash as
          collateral. See <L to="margin">Margin and buying power</L>. Always use a <L to="limit-stopLossPct">stop-loss</L>.
        </Warn>
      </>
    ),
  },
  {
    id: 'action-cover',
    category: 'Actions',
    title: 'Cover',
    summary: 'Buy back shares the bot shorted, closing the short position.',
    keywords: ['cover', 'buy to cover', 'close short', 'exit short'],
    where: `${STEP2} → Then`,
    body: (
      <p>
        Covering ends a <L to="action-short">short</L>: the bot buys the shares back and the difference from the original sale price becomes
        your profit or loss. Like selling, choose the entire short, a % of it, or a number of shares.
      </p>
    ),
  },

  // ---- Order size --------------------------------------------------------------------------------
  {
    id: 'sizing',
    category: 'Order size',
    title: 'Order size options',
    summary: 'How much to buy, sell, short or cover: a number of shares, a dollar amount, or a percentage.',
    keywords: ['size', 'amount', 'shares', 'dollars', 'worth', 'percent', 'buying power', 'portfolio value', 'position', 'entire', 'allocation'],
    where: `${STEP2} → Then`,
    figure: <F.SizingFig />,
    body: (
      <>
        <Values
          rows={[
            ['shares', 'An exact number of shares, e.g. 10.'],
            ['worth ($)', 'A dollar amount, e.g. $500 worth.'],
            ['% of buying power', 'A share of the cash available to spend right now.'],
            ['% of portfolio value', 'A share of everything (cash + stocks). Keeps positions evenly sized as the portfolio grows.'],
            ['% of position', 'For sell/cover: part of what the bot holds, e.g. 50% = half.'],
            ['entire position', 'For sell/cover: everything the bot holds in that stock.'],
          ]}
        />
        <Tip>
          “% of portfolio value” is the most popular choice for multi-stock bots: 10% each lets the bot hold about 10 stocks. Orders are
          always trimmed to fit your <L to="limit-maxPositionPct">max position size</L> and available cash.
        </Tip>
      </>
    ),
  },

  // ---- Safety limits --------------------------------------------------------------------------------
  {
    id: 'limit-stopLossPct',
    category: 'Safety limits',
    title: 'Stop-loss %',
    summary: 'Automatically closes a position once it has lost this much, to stop a small loss becoming a big one.',
    keywords: ['stop loss', 'stop', 'protect', 'limit loss', 'risk', 'cut losses'],
    where: STEP3,
    figure: <F.StopTakeFig />,
    body: (
      <>
        <p>
          Checked every 30 seconds, <b>before</b> any rule. If a position is down by this % from the bot's entry price, it's closed
          immediately. This also works for shorts (when the price rises against you). Set 0 to turn it off.
        </p>
        <Ex>Stop-loss 8%: bought at $100 → sold automatically if it reaches $92.</Ex>
        <Tip>Typical values are 5–10% for daily bots and 2–4% for day-trading bots.</Tip>
      </>
    ),
  },
  {
    id: 'limit-takeProfitPct',
    category: 'Safety limits',
    title: 'Take-profit %',
    summary: 'Automatically closes a position once it has gained this much, locking in the profit.',
    keywords: ['take profit', 'target', 'lock in', 'profit target', 'exit'],
    where: STEP3,
    body: (
      <>
        <p>
          The opposite of the <L to="limit-stopLossPct">stop-loss</L>: once a position is up by this %, the bot closes it. It's checked
          before any rule. Set 0 to turn it off and let your rules decide when to sell.
        </p>
        <Ex>Take-profit 10%: bought at $100 → sold automatically at $110.</Ex>
      </>
    ),
  },
  {
    id: 'limit-maxPositions',
    category: 'Safety limits',
    title: 'Max open positions',
    summary: 'The most stocks the bot may hold at once. Further buy signals are skipped until it sells something.',
    keywords: ['max positions', 'diversification', 'slots', 'how many stocks', 'concentration'],
    where: STEP3,
    figure: <F.MaxPositionsFig />,
    body: (
      <p>
        Prevents a bot watching 30 stocks from buying all 30. It only blocks <b>new</b> stocks: the bot can still add to stocks it already
        owns and always sell. A good rule of thumb is that max positions × % per trade should be at most 100%.
      </p>
    ),
  },
  {
    id: 'limit-maxPositionPct',
    category: 'Safety limits',
    title: 'Max position size %',
    summary: 'No single stock may grow larger than this % of the portfolio. Bigger orders are trimmed.',
    keywords: ['position size', 'max size', 'concentration', 'diversify', 'cap', 'limit'],
    where: STEP3,
    figure: <F.MaxPositionSizeFig />,
    body: (
      <p>
        Spreads risk so one bad stock can't sink the portfolio. It counts shares the bot already holds, so repeated buys stop once the cap is
        reached. 100% means no limit.
      </p>
    ),
  },
  {
    id: 'limit-cooldownBars',
    category: 'Safety limits',
    title: 'Cooldown (bars)',
    summary: 'After trading a stock, the bot waits this many bars before its rules may trade that stock again.',
    keywords: ['cooldown', 'wait', 'pause', 'overtrading', 'whipsaw', 'frequency'],
    where: STEP3,
    figure: <F.CooldownFig />,
    body: (
      <>
        <p>
          Stops a bot from buying and selling the same stock over and over when signals flicker on and off (“whipsaw”). It affects every
          rule, including sell rules. The <L to="limit-stopLossPct">stop-loss</L> and <L to="limit-takeProfitPct">take-profit</L> still work
          during a cooldown.
        </p>
        <Ex>Cooldown 4 on 15-minute bars = wait an hour after each trade in that stock.</Ex>
      </>
    ),
  },
  {
    id: 'margin',
    category: 'Safety limits',
    title: 'Margin and buying power (shorting)',
    summary: 'Shorting sets aside cash as collateral. If a short goes badly wrong, it is closed automatically (a “margin call”).',
    keywords: ['margin', 'buying power', 'collateral', 'margin call', 'leverage', 'short', 'reg t'],
    where: 'Portfolio page → Buying power',
    figure: <F.MarginFig />,
    body: (
      <>
        <p>
          When you short $10,000 of stock, that $10,000 plus 50% more ($5,000 of your own cash) is held as collateral. <b>Buying power</b>,
          the money you can still use, shrinks accordingly.
        </p>
        <p>
          If your shorts rise so much that your total portfolio value falls below 30% of their value, the simulator triggers a{' '}
          <b>margin call</b> and covers all shorts automatically, just like a real broker would.
        </p>
      </>
    ),
  },

  // ---- Testing ---------------------------------------------------------------------------------------
  {
    id: 'preview',
    category: 'Testing your bot',
    title: 'Preview (dry run)',
    summary: 'Runs your bot once against live prices without trading, and shows exactly which conditions passed for each stock.',
    keywords: ['preview', 'dry run', 'test', 'simulate', 'check', 'debug', 'scan', 'why'],
    where: 'Bots → New/Edit bot → Preview (dry run)',
    body: (
      <>
        <p>
          The preview lists every stock the bot would look at, with the result: “Would buy 12”, “Excluded by stock filters”, or “Waiting: no
          rule conditions met”. Click a row to see every condition with its <b>actual value</b>, marked ✓ or ✗:
        </p>
        <div className="doc-mock">
          <div>
            <b>Oversold: buy</b> <span className="down">✗</span>
          </div>
          <div>
            <span className="down">✗</span> RSI(14): 45.20 &lt; 30
          </div>
          <div>
            <span className="up">✓</span> Bot's shares: 0 = 0
          </div>
        </div>
        <p>Here RSI is 45, not below 30, so the rule waits. Saved bots show the same breakdown under “Latest check”.</p>
      </>
    ),
  },
  {
    id: 'backtest',
    category: 'Testing your bot',
    title: 'Backtesting',
    summary: 'Replays your bot over real past prices to see how it would have performed.',
    keywords: ['backtest', 'history', 'historical', 'simulate', 'past performance', 'test'],
    where: 'Backtest page, or Backtest button in the bot editor',
    figure: <F.BacktestFig />,
    body: (
      <>
        <p>
          The backtester walks through history one bar at a time, applying your exact rules and limits to every stock and sharing one pot of
          cash. Trades happen at each bar's closing price. Pick a period (up to 10 years for daily bars), starting cash and commission.
        </p>
        <Warn>
          Past results don't guarantee future ones. Bots tuned to look perfect on past data often disappoint live. Screener backtests use
          today's screener list, which flatters the results.
        </Warn>
      </>
    ),
  },
  {
    id: 'backtest-results',
    category: 'Testing your bot',
    title: 'Reading backtest results',
    summary: 'What final value, buy & hold, CAGR, max drawdown, Sharpe ratio and win rate mean.',
    keywords: ['results', 'metrics', 'cagr', 'drawdown', 'sharpe', 'win rate', 'benchmark', 'buy and hold', 'performance'],
    where: 'Backtest page → Results',
    body: (
      <Values
        rows={[
          ['Final value', 'What the starting cash grew (or shrank) to.'],
          ['Buy & hold', 'What you’d have made by simply buying the same stocks at the start and holding them. Beating this is the real test.'],
          ['CAGR', 'Average yearly growth rate. 10% means the money grew about 10% per year.'],
          ['Max drawdown', 'The worst drop from a peak, i.e. the most painful stretch. −30% means at one point you were down 30% from your best.'],
          ['Sharpe ratio', 'Return per unit of risk. Below 0.5 weak, around 1 good, above 2 excellent.'],
          ['Win rate', 'The share of closing trades that made money. Low win rates can still be profitable if the winners are big.'],
        ]}
      />
    ),
  },

  // ---- Help --------------------------------------------------------------------------------------------
  {
    id: 'no-trades',
    category: 'Help',
    title: "Why isn't my bot trading?",
    summary: 'The most common reasons a bot sits idle, and how to check each one.',
    keywords: ['not trading', 'no trades', 'idle', 'problem', 'troubleshoot', 'debug', 'nothing happens', 'help'],
    body: (
      <ul>
        <li>
          <b>The market is closed.</b> Bots only trade during US market hours (9:30–4:00 Eastern, weekdays).
        </li>
        <li>
          <b>Conditions are too strict.</b> Run a <L to="preview">preview</L> to see which ones fail. Try “any” instead of “all”, or loosen a
          number.
        </li>
        <li>
          <b>Missing data.</b> A long average like SMA(200) needs 200 bars of history, and fundamentals only exist for screener stocks.
          Without data, a condition is false.
        </li>
        <li>
          <b>Limits reached.</b> <L to="limit-maxPositions">Max positions</L>, <L to="limit-maxPositionPct">max position size</L>, a{' '}
          <L to="limit-cooldownBars">cooldown</L>, or not enough buying power. The preview shows “skipped: …” with the reason.
        </li>
        <li>
          <b>It already acted this bar.</b> Each rule acts at most once per bar for each stock.
        </li>
      </ul>
    ),
  },
  {
    id: 'glossary',
    category: 'Help',
    title: 'Glossary',
    summary: 'Plain-English definitions of common trading words used in the app.',
    keywords: ['glossary', 'definitions', 'terms', 'words', 'meaning', 'long', 'short', 'position', 'equity', 'etf', 'ticker', 'paper trading'],
    body: (
      <Values
        rows={[
          ['Ticker / symbol', 'The short code for a stock, e.g. AAPL for Apple.'],
          ['ETF', 'A fund traded like a stock that holds many companies at once.'],
          ['Position', 'The shares you hold in one stock.'],
          ['Long', 'Owning shares, so you profit when the price rises.'],
          ['Short', 'Owing borrowed shares, so you profit when the price falls.'],
          ['Portfolio value (equity)', 'Cash plus the value of your stocks, minus what your shorts would cost to buy back.'],
          ['Buying power', 'Cash you can still use for new trades.'],
          ['Indicator / metric', 'A number calculated from prices or volume, like an average or RSI.'],
          ['Paper trading', 'Practicing with pretend money, which is what this app does.'],
        ]}
      />
    ),
  },
];

export const TOPIC_BY_ID = Object.fromEntries(TOPICS.map((t) => [t.id, t]));

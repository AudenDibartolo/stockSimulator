import { Fragment, isValidElement, useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIES, TOPICS } from '../docs/topics.jsx';

// Plain text of a JSX tree, so search can look inside topic bodies.
function textOf(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (isValidElement(node)) {
    const { children, rows } = node.props;
    return `${textOf(children)} ${rows ? rows.flat().join(' ') : ''}`;
  }
  return '';
}

const INDEX = TOPICS.map((t) => ({
  topic: t,
  title: t.title.toLowerCase(),
  text: [t.title, t.summary, t.category, t.keywords.join(' '), t.where ?? '', textOf(t.body)].join(' ').toLowerCase(),
}));

export function search(query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return null;
  return INDEX.filter((e) => terms.every((term) => e.text.includes(term)))
    .map((e) => ({ topic: e.topic, score: terms.reduce((s, term) => s + (e.title.includes(term) ? 10 : 0) + (e.topic.keywords.some((k) => k.includes(term)) ? 3 : 0), 0) }))
    .sort((a, b) => b.score - a.score)
    .map((r) => r.topic);
}

function Highlight({ text, query }) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return text;
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return text.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : <Fragment key={i}>{part}</Fragment>));
}

export default function Docs({ topicId }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(topicId);
  const [tocOpen, setTocOpen] = useState(false);
  const searchRef = useRef(null);
  const results = useMemo(() => search(query), [query]);
  const visible = results ?? TOPICS;

  // "/" focuses search; Escape clears it.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Jump to the linked topic (from a "?" link or the table of contents).
  useEffect(() => {
    if (!topicId) return;
    setQuery('');
    setTocOpen(false);
    setTimeout(() => {
      const el = document.getElementById(`doc-${topicId}`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.remove('flash');
      void el.offsetWidth; // restart the highlight animation
      el.classList.add('flash');
      setActive(topicId);
    }, 30);
  }, [topicId]);

  // Links to the topic already in the URL don't change the hash, so scroll by hand.
  const onClick = (e) => {
    const a = e.target.closest('a[href^="#/docs/"]');
    if (!a || a.target === '_blank' || a.getAttribute('href') !== window.location.hash) return;
    e.preventDefault();
    setQuery('');
    setTocOpen(false);
    const id = a.getAttribute('href').slice('#/docs/'.length);
    setTimeout(() => document.getElementById(`doc-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  };

  // Highlight the topic currently on screen in the table of contents.
  useEffect(() => {
    const seen = new Map();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => seen.set(e.target.id, e.isIntersecting));
        const first = visible.find((t) => seen.get(`doc-${t.id}`));
        if (first) setActive(first.id);
      },
      { rootMargin: '-70px 0px -55% 0px' },
    );
    visible.forEach((t) => {
      const el = document.getElementById(`doc-${t.id}`);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [visible]);

  const grouped = CATEGORIES.map((c) => [c, visible.filter((t) => t.category === c)]).filter(([, list]) => list.length);
  const unknown = topicId && !TOPICS.some((t) => t.id === topicId);

  return (
    <div className="docs" onClick={onClick}>
      <aside className={`docs-nav card ${tocOpen ? 'open' : ''}`}>
        <div className="docs-search">
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder="Search the guide…  ( / )"
            aria-label="Search the guide"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuery('');
              if (e.key === 'Enter' && results?.[0]) window.location.hash = `/docs/${results[0].id}`;
            }}
          />
          {query && (
            <button className="icon" onClick={() => setQuery('')} aria-label="Clear search">
              ×
            </button>
          )}
        </div>
        <button className="ghost small toc-toggle" onClick={() => setTocOpen((o) => !o)}>
          {tocOpen ? 'Hide topics' : `Show topics (${visible.length})`}
        </button>
        <nav className="toc">
          {grouped.map(([category, list]) => (
            <div key={category}>
              <div className="toc-cat">{category}</div>
              {list.map((t) => (
                <a key={t.id} href={`#/docs/${t.id}`} className={active === t.id ? 'active' : ''}>
                  <Highlight text={t.title} query={query} />
                </a>
              ))}
            </div>
          ))}
          {results && !results.length && <p className="muted small">No topics match “{query}”.</p>}
        </nav>
      </aside>

      <div className="docs-main">
        <header className="card docs-intro">
          <h2>Bot guide</h2>
          <p>
            Everything you can set when building a bot, explained in plain English with pictures. New to trading? Start with{' '}
            <a href="#/docs/what-is-a-bot">How bots work</a> and <a href="#/docs/bars">Bars</a>, or browse the{' '}
            <a href="#/docs/glossary">Glossary</a>. In the bot builder, click any <span className="help-link static">?</span> to jump
            straight to its explanation.
          </p>
          {unknown && <p className="warn small">That help topic doesn't exist, so here is the full guide.</p>}
          {results && (
            <p className="small">
              {results.length} result{results.length === 1 ? '' : 's'} for “{query}”{' '}
              <button className="ghost small" onClick={() => setQuery('')}>
                Show everything
              </button>
            </p>
          )}
        </header>

        {grouped.map(([category, list]) => (
          <section key={category} className="docs-category">
            <h3 className="docs-cat-title">{category}</h3>
            {list.map((t) => (
              <article key={t.id} id={`doc-${t.id}`} className="card doc-topic">
                <h4>
                  <Highlight text={t.title} query={query} />
                  <a className="anchor" href={`#/docs/${t.id}`} title="Link to this topic">
                    #
                  </a>
                </h4>
                <p className="doc-summary">
                  <Highlight text={t.summary} query={query} />
                </p>
                {t.where && <div className="doc-where">Where: {t.where}</div>}
                <div className="doc-body">{t.body}</div>
                {t.figure}
              </article>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

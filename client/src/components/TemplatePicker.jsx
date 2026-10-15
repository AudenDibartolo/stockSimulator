import { useState } from 'react';
import { describeConfig } from '../botText.js';

// Gallery of ready-made strategies with full explanations.
export default function TemplatePicker({ catalog, selectedId, onPick, onBlank }) {
  const [open, setOpen] = useState(null);
  return (
    <div className="templates">
      {catalog.templates.map((t) => (
        <article key={t.id} className={`template ${selectedId === t.id ? 'selected' : ''}`}>
          <div className="tag">{t.category}</div>
          <h4>{t.name}</h4>
          <p className="small">{t.summary}</p>
          {open === t.id && <TemplateDetails catalog={catalog} template={t} />}
          <div className="row gap">
            <button type="button" className="primary small" onClick={() => onPick(t)}>
              {selectedId === t.id ? 'Selected' : 'Use this'}
            </button>
            <button type="button" className="ghost small" onClick={() => setOpen(open === t.id ? null : t.id)}>
              {open === t.id ? 'Less' : 'How it works'}
            </button>
          </div>
        </article>
      ))}
      {onBlank && (
        <article className={`template blank ${selectedId === 'blank' ? 'selected' : ''}`}>
          <div className="tag">Custom</div>
          <h4>Start from scratch</h4>
          <p className="small">Choose your own stocks, conditions and actions with the rule builder.</p>
          <button type="button" className="small" onClick={onBlank}>
            Blank bot
          </button>
        </article>
      )}
    </div>
  );
}

export function TemplateDetails({ catalog, template }) {
  return (
    <div className="template-details">
      <h5>How it works</h5>
      <p>{template.howItWorks}</p>
      <h5>Good for</h5>
      <p>{template.goodFor}</p>
      <h5>Watch out for</h5>
      <p>{template.watchOutFor}</p>
      <h5>Tips</h5>
      <p>{template.tips}</p>
      <h5>The rules</h5>
      <ul>
        {describeConfig(catalog, template.config).map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

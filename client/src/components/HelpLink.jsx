// Small "?" link that opens the matching guide topic in a new tab, so a
// half-built bot isn't lost.
export default function HelpLink({ topic, label }) {
  return (
    <a
      className="help-link"
      href={`#/docs/${topic}`}
      target="_blank"
      rel="noopener noreferrer"
      title={label ? `Learn about ${label} (opens the guide in a new tab)` : 'Explain this (opens the guide in a new tab)'}
      aria-label={label ? `Help: ${label}` : 'Help'}
      onClick={(e) => e.stopPropagation()}
    >
      ?
    </a>
  );
}

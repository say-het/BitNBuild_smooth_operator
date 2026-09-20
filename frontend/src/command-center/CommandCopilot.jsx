import { useState, useRef, useEffect } from 'react';
import { Bot, CornerDownLeft, Sparkles, X, RotateCcw, Radio, Activity, Send, Compass } from 'lucide-react';
import { useCommandCenter } from './useCommandCenter.js';

const DEFAULT_SUGGESTIONS = [
  'Summarize current operational status',
  'Which emergency units are available right now?',
  'Are there any delayed incidents or resource shortages?',
  'Show incoming social/Twitter hazard reports',
];

function formatAnswer(text) {
  if (!text) return null;
  const lines = text.split('\n');
  return lines.map((line, idx) => {
    // Bold parsing: **text**
    const parts = line.split(/(\*\*.*?\*\*)/g);
    const renderedLine = parts.map((part, pIdx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={pIdx} className="copilot-highlight">{part.slice(2, -2)}</strong>;
      }
      return part;
    });

    if (line.startsWith('• ') || line.startsWith('- ')) {
      return (
        <li key={idx} className="copilot-bullet">
          {renderedLine}
        </li>
      );
    }
    if (line.startsWith('  - ')) {
      return (
        <li key={idx} className="copilot-subbullet">
          {renderedLine}
        </li>
      );
    }
    return (
      <p key={idx} className="copilot-para">
        {renderedLine}
      </p>
    );
  });
}

export function CommandCopilot() {
  const store = useCommandCenter();
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [store.copilotMessages, store.copilotBusy]);

  if (!store.copilotOpen) return null;

  const submit = (text) => {
    const query = (text ?? message).trim();
    if (!query || store.copilotBusy) return;
    setMessage('');
    store.queryCopilot(query);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  // Find latest assistant message to get active dynamic suggestions
  const latestAssistant = [...store.copilotMessages].reverse().find((m) => m.role === 'assistant');
  const activeSuggestions = (latestAssistant?.suggestedFollowUps?.length > 0)
    ? latestAssistant.suggestedFollowUps
    : DEFAULT_SUGGESTIONS;

  return (
    <aside className="copilot-panel" aria-label="ResQai Emergency Tactical AI Copilot">
      <header className="copilot-header">
        <div className="copilot-header-brand">
          <div className="copilot-bot-icon">
            <Bot size={18} />
            <span className="copilot-status-dot" title="Gemini 2.5 Live Telemetry Grounded" />
          </div>
          <div>
            <div className="copilot-title-row">
              <strong>Tactical Copilot</strong>
              <span className="copilot-ai-badge">GEMINI 2.5</span>
            </div>
            <small className="copilot-subtitle">Live Incident & Unit Context Active</small>
          </div>
        </div>
        <div className="copilot-header-actions">
          {store.copilotMessages.length > 0 && (
            <button
              type="button"
              className="copilot-action-btn"
              title="Reset Conversation"
              onClick={store.clearCopilot}
              aria-label="Reset Conversation"
            >
              <RotateCcw size={14} />
            </button>
          )}
          <button
            type="button"
            className="copilot-action-btn"
            aria-label="Close Copilot"
            onClick={store.toggleCopilot}
          >
            <X size={17} />
          </button>
        </div>
      </header>

      <div className="copilot-messages">
        {!store.copilotMessages.length && (
          <div className="copilot-welcome">
            <div className="copilot-welcome-icon">
              <Sparkles size={28} />
            </div>
            <strong>ResQai Tactical Intelligence</strong>
            <p>
              Directly connected to live Ahmedabad emergency dispatch, OSM infrastructure, fleet telemetry, hospital beds, and real-time citizen hazard streams.
            </p>
            <div className="copilot-welcome-features">
              <span><Radio size={12} /> Live Incident Stream</span>
              <span><Activity size={12} /> Unit Availability</span>
              <span><Compass size={12} /> Map Coordinates</span>
            </div>
          </div>
        )}

        {store.copilotMessages.map((item, index) => (
          <article key={`${item.role}-${index}`} className={`copilot-bubble ${item.role}`}>
            <div className="copilot-bubble-meta">
              <small>{item.role === 'user' ? 'Operator' : 'ResQai Tactical AI'}</small>
            </div>
            <div className="copilot-bubble-content">
              {formatAnswer(item.text ?? item.answer)}
            </div>

            {item.references?.length > 0 && (
              <div className="reference-list">
                <span className="reference-title">Interactive Entities:</span>
                {item.references.map(({ entityType, entityId }) => (
                  <button
                    type="button"
                    key={`${entityType}-${entityId}`}
                    className={`copilot-chip entity-${entityType.toLowerCase()}`}
                    title={`Click to focus ${entityId} on map`}
                    onClick={() => {
                      if (entityType === 'INCIDENT') {
                        store.applyMapActions([{ type: 'FOCUS_INCIDENT', entityId }]);
                      } else if (entityType === 'RESOURCE') {
                        store.applyMapActions([{ type: 'FOCUS_RESOURCE', entityId }]);
                      } else if (entityType === 'HOSPITAL') {
                        store.applyMapActions([{ type: 'FOCUS_HOSPITAL', entityId }]);
                      }
                    }}
                  >
                    <span className="chip-prefix">{entityType.slice(0, 3)}</span>
                    <span className="chip-id">{entityId}</span>
                  </button>
                ))}
              </div>
            )}
          </article>
        ))}

        {store.copilotBusy && (
          <div className="copilot-thinking">
            <span className="thinking-spinner" />
            <span>Analyzing real-time operational context with Gemini…</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="copilot-suggestions">
        <span className="suggestions-label">Suggested Queries:</span>
        <div className="suggestions-scroll">
          {activeSuggestions.map((item) => (
            <button
              type="button"
              key={item}
              className="suggestion-pill"
              onClick={() => submit(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <form
        className="copilot-input-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={600}
          rows={2}
          placeholder="Ask tactical copilot (e.g. 'Dispatch plan for fire near GIDC', 'Show all available ambulances')…"
        />
        <button
          type="submit"
          className="copilot-send-button"
          disabled={!message.trim() || store.copilotBusy}
          aria-label="Send query"
        >
          <Send size={15} />
        </button>
      </form>
    </aside>
  );
}


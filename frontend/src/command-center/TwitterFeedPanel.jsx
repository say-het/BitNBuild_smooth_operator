import { useEffect, useState, useRef, useMemo } from 'react';
import {
  MessageSquareText,
  Search,
  Flame,
  Radio,
  RefreshCw,
  Volume2,
  VolumeX,
  MapPin,
  ShieldAlert,
  Zap,
  RadioTower,
  Cpu,
  Tv,
  Sparkles,
  Layers,
  Bot,
  CheckCircle2,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useCommandCenter } from './useCommandCenter.js';

const SOURCE_FILTERS = [
  { id: 'ALL', label: 'All Signals', icon: Layers, tone: 'cyan' },
  { id: 'TWITTER', label: 'Twitter / X', icon: MessageSquareText, tone: 'sky' },
  { id: 'EMERGENCY_911', label: '911 Wire', icon: ShieldAlert, tone: 'red' },
  { id: 'IOT_SENSOR', label: 'IoT Mesh', icon: Cpu, tone: 'amber' },
  { id: 'DRONE_RECON', label: 'Drone UAV', icon: RadioTower, tone: 'violet' },
  { id: 'TRAFFIC_CCTV', label: 'Traffic CCTV', icon: Tv, tone: 'green' },
];

function playTacticalAudioChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // Audio policy might block until user interaction
  }
}

export function TwitterFeedPanel() {
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [activeSource, setActiveSource] = useState('ALL');
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [status, setStatus] = useState({ connected: true, stats: {} });

  const prevAlertCount = useRef(0);
  const { selectIncident } = useCommandCenter();

  // Load and poll multi-source feed
  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const sourceParam = activeSource !== 'ALL' ? `&source=${encodeURIComponent(activeSource)}` : '';
        const queryParam = query ? `&keyword=${encodeURIComponent(query)}` : '';

        const [incidentsRes, statusRes] = await Promise.allSettled([
          api(`/twitter/incidents?limit=60${sourceParam}${queryParam}`),
          api('/twitter/status'),
        ]);

        if (!active) return;

        if (incidentsRes.status === 'fulfilled' && Array.isArray(incidentsRes.value)) {
          const newItems = incidentsRes.value;
          if (audioEnabled && newItems.length > prevAlertCount.current && prevAlertCount.current > 0) {
            playTacticalAudioChime();
          }
          prevAlertCount.current = newItems.length;
          setAlerts(newItems);
        }

        if (statusRes.status === 'fulfilled') {
          setStatus(statusRes.value ?? { connected: true });
        }
      } catch {
        // Safe offline fallback
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, 8000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [query, activeSource, audioEnabled]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setQuery(keyword.trim().toLowerCase());
  };

  const handleTriggerSimulatedSignal = async () => {
    try {
      setLoading(true);
      const res = await api('/twitter/incidents?limit=60');
      if (Array.isArray(res)) {
        setAlerts(res);
        if (audioEnabled) playTacticalAudioChime();
      }
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  };

  const filteredCounts = useMemo(() => {
    const counts = { ALL: alerts.length };
    alerts.forEach((item) => {
      const src = item.source || 'TWITTER';
      counts[src] = (counts[src] || 0) + 1;
    });
    return counts;
  }, [alerts]);

  return (
    <section className="twitter-panel panel tactical-intelligence-hub" aria-label="Multi-source live tactical intelligence">
      {/* Section Header with Glowing Title & Search */}
      <div className="section-heading tactical-intel-heading">
        <div className="intel-title-lockup">
          <span className="eyebrow">
            <Bot size={12} className="tone-violet pulsate" /> Gemini AI Hazard & Geo Intelligence
          </span>
          <h2>
            <Zap size={16} className="tone-amber" /> Live Threat Stream & Social Radar
            <span className="count-badge glow-badge">{alerts.length} verified signals</span>
          </h2>
        </div>

        <div className="intel-header-actions">
          <button
            type="button"
            className={`audio-toggle-btn ${audioEnabled ? 'active' : ''}`}
            onClick={() => setAudioEnabled(!audioEnabled)}
            title={audioEnabled ? 'Mute signal ping' : 'Enable tactical audio chime on new alerts'}
          >
            {audioEnabled ? <Volume2 size={13} className="tone-cyan" /> : <VolumeX size={13} />}
            <span>{audioEnabled ? 'Audio Chime ON' : 'Audio Muted'}</span>
          </button>

          <button
            type="button"
            className="pulse-trigger-btn"
            onClick={handleTriggerSimulatedSignal}
            title="Scan for new emergency signals"
          >
            <Sparkles size={13} className="tone-amber" />
            <span>Scan Signals</span>
          </button>

          <form onSubmit={handleSearchSubmit} className="twitter-search-form">
            <div className="twitter-search-input-wrap">
              <Search size={13} className="search-icon" />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Filter signals (e.g. fire, crash, naroda)"
                className="twitter-search-input tactical-search-input"
              />
            </div>
            <button type="submit" className="twitter-search-button">
              Filter
            </button>
          </form>
        </div>
      </div>

      {/* AI Intelligence Filter Banner */}
      <div className="ai-intel-filter-banner">
        <span className="ai-banner-pill">
          <Sparkles size={11} className="tone-cyan" />
          <b>GEMINI AI CONTEXT FILTER ACTIVE:</b> Ahmedabad Metropolitan Area Only · False Positives & Slang Discarded
        </span>
      </div>

      {/* Source Category Filter Chips */}
      <div className="tactical-source-tabs-bar">
        <div className="source-filter-pills">
          {SOURCE_FILTERS.map((filter) => {
            const Icon = filter.icon;
            const count = filteredCounts[filter.id] || 0;
            const isActive = activeSource === filter.id;

            return (
              <button
                key={filter.id}
                type="button"
                className={`source-chip tone-${filter.tone} ${isActive ? 'active' : ''}`}
                onClick={() => setActiveSource(filter.id)}
              >
                <Icon size={12} />
                <span>{filter.label}</span>
                <b className="chip-count">{count}</b>
              </button>
            );
          })}
        </div>

        <div className="intel-stream-status">
          <span className="live-state live">
            <Radio size={11} className="spin-slow" /> AHMEDABAD AI STREAM ACTIVE
          </span>
          {loading && <RefreshCw size={12} className="spin tone-cyan" />}
        </div>
      </div>

      {/* Alert Feed Cards Grid */}
      <div className="twitter-feed-list tactical-signal-feed">
        {alerts.length === 0 ? (
          <div className="empty-state">
            <Flame size={24} className="tone-amber pulsate" />
            <strong>No matching emergency intelligence signals detected in Ahmedabad.</strong>
            <span>Try searching another keyword or switch category filters.</span>
          </div>
        ) : (
          alerts.map((item) => {
            const isCritical = item.severity === 'CRITICAL' || (item.matched || []).includes('explosion');
            const isHigh = item.severity === 'HIGH' || (item.matched || []).includes('fire');
            const severityClass = isCritical ? 'severity-critical' : isHigh ? 'severity-high' : 'severity-medium';

            const sourceIcon =
              item.source === 'EMERGENCY_911' ? '🚨' :
              item.source === 'IOT_SENSOR' ? '📡' :
              item.source === 'DRONE_RECON' ? '🚁' :
              item.source === 'TRAFFIC_CCTV' ? '📹' :
              item.source === 'WEATHER_RADAR' ? '🛰️' :
              item.source === 'CIVIL_DEFENSE' ? '📢' : '🐦';

            return (
              <article key={item.id || item.createdAt} className={`tweet-card tactical-signal-card ${severityClass}`}>
                <header className="tweet-card-header">
                  <div className="signal-source-badge">
                    <span className="source-avatar">{sourceIcon}</span>
                    <div className="source-details">
                      <strong className="source-name">{item.sourceName || item.source || 'Social Stream'}</strong>
                      <span className="source-author">{item.author || '@citizen_alert'}</span>
                    </div>
                  </div>

                  <div className="signal-time-meta">
                    <span className={`signal-severity-tag tag-${(item.severity || 'HIGH').toLowerCase()}`}>
                      {item.severity || 'ALERT'}
                    </span>
                    <time className="tweet-time">
                      {new Date(item.createdAt || item.detectedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </time>
                  </div>
                </header>

                <p className="tweet-text tactical-signal-body">{item.text}</p>

                {/* Gemini AI Reasoning Box */}
                {item.aiReasoning && (
                  <div className="ai-reasoning-snippet">
                    <Bot size={11} className="tone-violet" />
                    <span><b>Gemini AI:</b> {item.aiReasoning}</span>
                  </div>
                )}

                {/* Signal Telemetry & Location Badges */}
                <div className="signal-telemetry-row">
                  {item.location?.name && (
                    <span className="telemetry-badge loc-badge">
                      <MapPin size={10} className="tone-cyan" /> {item.location.name}
                    </span>
                  )}
                  {item.aiVerified && (
                    <span className="telemetry-badge ai-verified-badge">
                      <CheckCircle2 size={10} className="tone-green" /> ✨ AI Verified (Ahmedabad)
                    </span>
                  )}
                  {item.confidence && (
                    <span className="telemetry-badge confidence-badge">
                      🎯 {Math.round(item.confidence * 100)}% Confidence
                    </span>
                  )}
                  {item.hazardType && (
                    <span className="telemetry-badge hazard-type-badge">
                      ⚡ {item.hazardType}
                    </span>
                  )}
                </div>

                <footer className="tweet-card-footer tactical-card-footer">
                  <div className="tweet-tags">
                    {(item.matched || ['emergency']).map((tag) => (
                      <span
                        key={tag}
                        className={`tweet-tag ${['fire', 'explosion', 'gas leak'].includes(tag.toLowerCase()) ? 'tag-fire' : ''}`}
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>

                  <div className="card-quick-actions">
                    <span className="signal-id-hash">{item.id?.slice(0, 14)}</span>
                  </div>
                </footer>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

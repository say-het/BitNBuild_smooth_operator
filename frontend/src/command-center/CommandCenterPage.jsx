import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Ambulance, BellRing, Bot, CheckCircle2, Clock3, Radio, RefreshCw, ShieldCheck, Siren, TriangleAlert, X } from 'lucide-react';
import { CommandCopilot } from './CommandCopilot.jsx';
import { EntityDrawer } from './EntityDrawer.jsx';
import { IncidentQueue } from './IncidentQueue.jsx';
import { OperationalMap } from './OperationalMap.jsx';
import { OperationalSummaries } from './OperationalSummaries.jsx';
import { useCommandCenter } from './useCommandCenter.js';
import { WorkflowPanels } from './WorkflowPanels.jsx';
import { NotificationCenter } from './NotificationCenter.jsx';
import { DemoControls } from './DemoControls.jsx';
import { TwitterFeedPanel } from './TwitterFeedPanel.jsx';

function Header() {
  const { error, refreshing, realtime, notifications, toggleNotifications, toggleCopilot, copilotOpen } = useCommandCenter();
  const unread = Object.values(notifications).filter(({ read }) => !read).length;
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <header className="command-header">
      <div className="brand-lockup">
        <span className="brand-mark"><ShieldCheck size={23} /></span>
        <span><strong>ResQai</strong><small>Emergency Operations Command</small></span>
      </div>
      <div className="header-statuses">
        <a className="header-link" href="/">Command Center</a>
        <a className="header-link" href="#resources">Resources</a>
        <a className="header-link" href="/analytics">Analytics</a>
        <a className="header-link" href="/report">Report emergency</a>
        <span className={`system-state ${error ? 'degraded' : ''}`}><Activity size={14} /> {error ? 'DEGRADED' : 'OPERATIONAL'}</span>
        <span className={`live-state ${realtime.connectionState}`}><Radio size={14} /> {realtime.connectionState.toUpperCase()}</span>
        {refreshing && <span className="sync-state"><RefreshCw size={13} /> Syncing</span>}
        <time><Clock3 size={14} /> {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
        <button type="button" className={`header-tool ${copilotOpen ? 'active' : ''}`} onClick={toggleCopilot}><Bot size={16} /> Copilot</button>
        <button type="button" className="header-tool notification-trigger" onClick={toggleNotifications}><BellRing size={16} />{unread > 0 && <b>{unread > 99 ? '99+' : unread}</b>}</button>
      </div>
    </header>
  );
}

function Kpis() {
  const { incidents, resources, alerts } = useCommandCenter();
  const active = Object.values(incidents).filter(({ status }) => !['RESOLVED', 'CANCELLED'].includes(status));
  const activeAlerts = Object.values(alerts).filter(({ status }) => ['ACTIVE', 'ACKNOWLEDGED'].includes(status));
  const delayed = new Set([
    ...active.filter(({ status }) => status === 'DELAYED').map(({ incidentId }) => incidentId),
    ...activeAlerts.filter(({ type }) => type === 'RESPONSE_DELAY').map(({ incidentId }) => incidentId).filter(Boolean),
  ]).size;
  const values = [
    ['Active incidents', active.length, Siren, 'cyan'],
    ['Critical incidents', active.filter(({ priority, severity }) => priority === 'P0' || severity >= 5).length, TriangleAlert, 'red'],
    ['Delayed responses', delayed, Clock3, 'amber'],
    ['Available resources', Object.values(resources).filter(({ status }) => status === 'AVAILABLE').length, Ambulance, 'green'],
    ['Active alerts', activeAlerts.length, BellRing, 'violet'],
  ];
  return (
    <section className="kpi-strip" aria-label="Operational key metrics">
      {values.map(([title, value, Icon, tone]) => <article key={title} className={`kpi-card tone-${tone}`}><span><small>{title}</small><strong>{value}</strong></span><Icon size={20} /></article>)}
    </section>
  );
}

function Feedback() {
  const { feedback, clearFeedback } = useCommandCenter();
  useEffect(() => {
    if (!feedback) return undefined;
    const timer = setTimeout(clearFeedback, 4500);
    return () => clearTimeout(timer);
  }, [clearFeedback, feedback]);
  if (!feedback) return null;
  return <div className={`feedback-toast ${feedback.type}`} role="status">{feedback.type === 'success' ? <CheckCircle2 size={17} /> : <TriangleAlert size={17} />}<span>{feedback.message}</span><button type="button" aria-label="Dismiss notification" onClick={clearFeedback}><X size={14} /></button></div>;
}

export function CommandCenterPage() {
  const { loading, error, refresh, selectIncident } = useCommandCenter();
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (loading || deepLinkHandled.current) return;
    deepLinkHandled.current = true;
    const incidentId = new URLSearchParams(window.location.search).get('incident');
    if (incidentId) selectIncident(incidentId);
  }, [loading, selectIncident]);
  const loadingView = useMemo(() => (
    <div className="page-state"><RefreshCw className="spin" size={28} /><strong>Loading operational state</strong><span>Connecting incidents, resources, hospitals, and alerts…</span></div>
  ), []);
  return (
    <main className="command-center">
      <Header />
      <Feedback />
      <CommandCopilot />
      <NotificationCenter />
      {loading ? loadingView : (
        <div className="command-content">
          {error && <div className="error-banner"><span><TriangleAlert size={17} /><b>API unavailable.</b> Showing the last known operational picture where available.</span><button type="button" onClick={refresh}>Retry</button></div>}
          <DemoControls />
          <Kpis />
          <section className="operations-grid">
            <IncidentQueue />
            <div className="map-workspace"><OperationalMap /><EntityDrawer /></div>
          </section>
          <TwitterFeedPanel />
          <OperationalSummaries />
          <WorkflowPanels />
        </div>
      )}
    </main>
  );
}

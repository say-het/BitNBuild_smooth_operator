import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowLeft, Clock3, RefreshCw, ShieldCheck, Siren, TriangleAlert, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../lib/api.js';
import { HotspotMap } from './HotspotMap.jsx';
import { SimulationEvaluation } from './SimulationEvaluation.jsx';

function chartData(record) {
  return Object.entries(record ?? {}).map(([name, value]) => ({ name: name.replaceAll('_', ' '), value }));
}

function minutes(value) {
  return value == null ? 'Unavailable' : `${value} min`;
}

const tooltipStyle = { background: '#0f172a', border: '1px solid #334155', borderRadius: 7, fontSize: 11 };

export function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try { setData(await api('/analytics/overview')); setError(null); }
    catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    api('/analytics/overview')
      .then((result) => { setData(result); setError(null); })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);
  const resourceChart = useMemo(() => data?.resources.byType.map((item) => ({ name: item.type.replaceAll('_', ' '), utilization: item.utilizationPercent })) ?? [], [data]);
  return (
    <main className="analytics-page">
      <header className="analytics-header"><a href="/"><ArrowLeft size={17} /> Command Center</a><span><ShieldCheck size={21} /><strong>Operational Analytics</strong></span><button type="button" onClick={load}><RefreshCw size={14} /> Refresh</button></header>
      {loading && !data && <div className="analytics-loading"><RefreshCw className="spin" /> Loading analytics…</div>}
      {error && <div className="analytics-error">{error}</div>}
      {data && <div className="analytics-content">
        <section className="analytics-kpis">
          {[
            ['Average response time', minutes(data.response.incidentToFirstResponse.averageMinutes), Clock3],
            ['Active critical incidents', data.incidents.activeCritical, Siren],
            ['SLA violations', data.alerts.slaViolations, TriangleAlert],
            ['Resource utilization', data.resources.utilizationPercent == null ? 'Unavailable' : `${data.resources.utilizationPercent}%`, Users],
          ].map(([label, value, Icon]) => <article key={label}><Icon size={20} /><span><small>{label}</small><strong>{value}</strong></span></article>)}
        </section>
        <section className="analytics-charts">
          <article className="analytics-panel"><h2>Incidents by Type</h2><ResponsiveContainer width="100%" height={250}><BarChart data={chartData(data.incidents.byType)}><CartesianGrid stroke="#1e293b" vertical={false} /><XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 9 }} /><YAxis allowDecimals={false} stroke="#64748b" /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="value" fill="#22d3ee" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></article>
          <article className="analytics-panel"><h2>Incidents by Severity</h2><ResponsiveContainer width="100%" height={250}><BarChart data={chartData(data.incidents.bySeverity)}><CartesianGrid stroke="#1e293b" vertical={false} /><XAxis dataKey="name" stroke="#64748b" /><YAxis allowDecimals={false} stroke="#64748b" /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="value" fill="#f97316" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></article>
          <article className="analytics-panel"><h2>Response Time Trend</h2><ResponsiveContainer width="100%" height={250}><LineChart data={data.response.trend}><CartesianGrid stroke="#1e293b" vertical={false} /><XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 9 }} /><YAxis stroke="#64748b" unit="m" /><Tooltip contentStyle={tooltipStyle} /><Line type="monotone" dataKey="averageMinutes" stroke="#a78bfa" strokeWidth={3} connectNulls /></LineChart></ResponsiveContainer></article>
          <article className="analytics-panel"><h2>Resource Utilization by Type</h2><ResponsiveContainer width="100%" height={250}><BarChart data={resourceChart}><CartesianGrid stroke="#1e293b" vertical={false} /><XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 9 }} /><YAxis domain={[0, 100]} stroke="#64748b" unit="%" /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="utilization" fill="#4ade80" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></article>
        </section>
        <section className="analytics-panel hotspot-panel"><h2><Activity size={16} /> Incident Hotspots</h2><HotspotMap data={data.hotspots} /></section>
        <SimulationEvaluation />
      </div>}
    </main>
  );
}

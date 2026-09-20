import { useEffect, useState } from 'react';
import { BellRing, Pause, Play, RotateCcw, SkipForward, Square } from 'lucide-react';
import { api } from '../lib/api.js';
import { useCommandCenter } from './useCommandCenter.js';

const scenarios = ['INDUSTRIAL_FIRE', 'FLOOD', 'ROAD_ACCIDENT', 'EARTHQUAKE'];
const simulationEvents = [
  'simulation.started', 'simulation.paused', 'simulation.resumed', 'simulation.stopped',
  'simulation.completed', 'simulation.event', 'simulation.reset',
];

function clock(seconds = 0) {
  const value = Math.max(0, Number(seconds) || 0);
  const hours = String(Math.floor(value / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((value % 3600) / 60)).padStart(2, '0');
  const remaining = String(Math.floor(value % 60)).padStart(2, '0');
  return `${hours}:${minutes}:${remaining}`;
}

export function DemoControls() {
  const store = useCommandCenter();
  const [run, setRun] = useState(null);
  const [scenario, setScenario] = useState('INDUSTRIAL_FIRE');
  const [timeScale, setTimeScale] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [lastEvent, setLastEvent] = useState(null);

  useEffect(() => {
    api('/simulations').then((runs) => {
      const latest = runs.find(({ status }) => ['RUNNING', 'PAUSED', 'CREATED'].includes(status)) ?? runs[0] ?? null;
      setRun(latest);
      if (latest) { setScenario(latest.scenario); setTimeScale(latest.timeScale); }
    }).catch((requestError) => setError(requestError.message));
  }, []);
  useEffect(() => {
    const listeners = simulationEvents.map((eventName) => {
      const listener = ({ data = {} }) => {
        setRun((current) => !current || current.runId === data.runId ? { ...current, ...data, scenario: data.scenario ?? current?.scenario } : current);
        if (eventName === 'simulation.event') setLastEvent(data);
        if (eventName === 'simulation.reset') setLastEvent(null);
      };
      store.realtime.on(eventName, listener);
      return [eventName, listener];
    });
    return () => listeners.forEach(([eventName, listener]) => store.realtime.off(eventName, listener));
  }, [store.realtime]);
  useEffect(() => {
    if (run?.status !== 'RUNNING') return undefined;
    const timer = setInterval(() => api(`/simulations/${run.runId}`).then(setRun).catch(() => {}), 1_500);
    return () => clearInterval(timer);
  }, [run?.runId, run?.status]);

  async function perform(work) {
    setBusy(true); setError(null);
    try {
      const updated = await work();
      setRun(updated);
      await store.refresh();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function start() {
    setLastEvent(null);
    await perform(async () => {
      let target = run;
      if (!target || target.status !== 'CREATED' || target.scenario !== scenario || target.timeScale !== timeScale) {
        target = await api('/simulations', { method: 'POST', body: { scenario, timeScale } });
      }
      return api(`/simulations/${target.runId}/start`, { method: 'POST', body: {} });
    });
  }

  const control = (action) => perform(() => api(`/simulations/${run.runId}/${action}`, { method: 'POST', body: {} }));
  async function runMonitoring() {
    setBusy(true); setError(null);
    try { await api('/monitoring/run', { method: 'POST', body: {} }); await store.refresh(); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }
  const active = ['RUNNING', 'PAUSED'].includes(run?.status);
  return (
    <section className="demo-controls panel" aria-label="Simulation demo controls">
      <div className="demo-heading"><span><b>Demo Console</b><small>Synthetic scenario · ingestion pipeline</small></span><span className={`demo-state state-${run?.status?.toLowerCase() ?? 'idle'}`}>{run?.status ?? 'IDLE'}</span></div>
      <label>Scenario<select value={scenario} disabled={active || busy} onChange={(event) => setScenario(event.target.value)}>{scenarios.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Speed<select value={timeScale} disabled={active || busy} onChange={(event) => setTimeScale(Number(event.target.value))}>{[1, 5, 10, 20].map((value) => <option key={value} value={value}>{value}×</option>)}</select></label>
      <div className="demo-actions">
        {run?.status === 'RUNNING' ? <button type="button" disabled={busy} onClick={() => control('pause')}><Pause size={13} /> Pause</button>
          : run?.status === 'PAUSED' ? <button type="button" disabled={busy} onClick={() => control('resume')}><Play size={13} /> Resume</button>
            : <button type="button" disabled={busy} onClick={start}><Play size={13} /> Start</button>}
        {['CREATED', 'PAUSED'].includes(run?.status) && <button type="button" disabled={busy} onClick={() => control('step')}><SkipForward size={13} /> Step</button>}
        {['CREATED', 'RUNNING', 'PAUSED'].includes(run?.status) && <button type="button" disabled={busy} onClick={() => control('stop')}><Square size={12} /> Stop</button>}
        <button type="button" disabled={busy} onClick={runMonitoring}><BellRing size={13} /> Check alerts</button>
        {run && <button type="button" className="reset-demo" disabled={busy} onClick={() => control('reset')}><RotateCcw size={13} /> Reset Demo</button>}
      </div>
      <div className="demo-metrics"><span><small>Simulation time</small><b>{clock(run?.simulationTime)}</b></span><span><small>Events emitted</small><b>{run?.eventsGenerated ?? 0}</b></span><span><small>Last signal</small><b>{lastEvent?.eventType?.replaceAll('_', ' ') ?? '—'}</b></span></div>
      {error && <p className="demo-error">{error}</p>}
    </section>
  );
}

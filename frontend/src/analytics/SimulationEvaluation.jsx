import { useCallback, useEffect, useState } from 'react';
import { Activity, Play, RefreshCw } from 'lucide-react';
import { api } from '../lib/api.js';

const scenarios = ['INDUSTRIAL_FIRE', 'FLOOD', 'ROAD_ACCIDENT', 'EARTHQUAKE'];

function percent(value) {
  return value == null ? 'Unavailable' : `${Math.round(value * 100)}%`;
}

export function SimulationEvaluation() {
  const [runs, setRuns] = useState([]);
  const [selected, setSelected] = useState('');
  const [scenario, setScenario] = useState('INDUSTRIAL_FIRE');
  const [evaluation, setEvaluation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const loadRuns = useCallback(async () => {
    const data = await api('/simulations');
    setRuns(data);
    setSelected((current) => current || data[0]?.runId || '');
    return data;
  }, []);

  const refresh = useCallback(async (runId = selected) => {
    if (!runId) return;
    try { setEvaluation(await api(`/simulations/${runId}/evaluation`)); setError(null); }
    catch (requestError) { setError(requestError.message); }
  }, [selected]);

  useEffect(() => {
    api('/simulations')
      .then((data) => { setRuns(data); setSelected(data[0]?.runId ?? ''); })
      .catch((requestError) => setError(requestError.message));
  }, []);
  useEffect(() => {
    if (!selected) return;
    api(`/simulations/${selected}/evaluation`)
      .then((data) => { setEvaluation(data); setError(null); })
      .catch((requestError) => setError(requestError.message));
  }, [selected]);
  const activeRun = runs.find(({ runId }) => runId === selected);
  useEffect(() => {
    if (!activeRun || !['RUNNING', 'PAUSED'].includes(activeRun.status)) return undefined;
    const timer = setInterval(async () => { await loadRuns(); await refresh(activeRun.runId); }, 3_000);
    return () => clearInterval(timer);
  }, [activeRun, loadRuns, refresh]);

  async function startScenario() {
    setBusy(true); setError(null);
    try {
      const run = await api('/simulations', { method: 'POST', body: { scenario, timeScale: 20 } });
      await api(`/simulations/${run.runId}/start`, { method: 'POST', body: {} });
      await loadRuns(); setSelected(run.runId); await refresh(run.runId);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  const metrics = evaluation && [
    ['Detection accuracy', percent(evaluation.classification.accuracy)],
    ['Correlation precision', percent(evaluation.correlation.precision)],
    ['Correlation recall', percent(evaluation.correlation.recall)],
    ['Median location error', evaluation.location.medianErrorMeters == null ? 'Unavailable' : `${Math.round(evaluation.location.medianErrorMeters)} m`],
    ['Average detection delay', evaluation.detection.averageDelaySeconds == null ? 'Unavailable' : `${evaluation.detection.averageDelaySeconds}s`],
    ['Capability coverage', evaluation.capabilities.coveragePercent == null ? 'Unavailable' : `${evaluation.capabilities.coveragePercent}%`],
  ];
  return (
    <section className="analytics-panel evaluation-panel">
      <div className="analytics-panel-heading"><span><Activity size={17} /><strong>Simulation Evaluation</strong><small>Synthetic Benchmark</small></span><button type="button" onClick={() => refresh()} disabled={!selected}><RefreshCw size={14} /> Refresh</button></div>
      <div className="simulation-controls"><select value={scenario} onChange={(event) => setScenario(event.target.value)}>{scenarios.map((item) => <option key={item}>{item}</option>)}</select><button type="button" onClick={startScenario} disabled={busy}><Play size={14} /> {busy ? 'Starting…' : 'Start 20× scenario'}</button><select value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Select run</option>{runs.map((run) => <option key={run.runId} value={run.runId}>{run.scenario} · {run.status}</option>)}</select></div>
      {error && <p className="analytics-error">{error}</p>}
      {evaluation && <><p className="synthetic-disclaimer">{evaluation.disclaimer}</p><div className="evaluation-metrics">{metrics.map(([label, value]) => <article key={label}><small>{label}</small><strong>{value}</strong></article>)}</div><p className="evaluation-summary">Run {evaluation.run.status.toLowerCase()} · {evaluation.run.eventsGenerated} events · {evaluation.coverage.detectedMatches}/{evaluation.coverage.groundTruthIncidents} truth incidents matched · F1 {evaluation.correlation.f1 ?? 'unavailable'}</p></>}
      {!evaluation && !error && <p className="analytics-empty">Choose or start a scenario to view evaluation metrics.</p>}
    </section>
  );
}

import { useState } from 'react';
import { AlertTriangle, BedDouble, BrainCircuit, Check, Clock3, MapPin, Route, Sparkles, Users, X } from 'lucide-react';
import { useCommandCenter } from './useCommandCenter.js';

const activeStatuses = new Set(['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SCENE']);
const nextStatuses = {
  ASSIGNED: [['ACCEPTED', 'Accept'], ['EN_ROUTE', 'Mark en route']],
  ACCEPTED: [['EN_ROUTE', 'Mark en route']],
  EN_ROUTE: [['ON_SCENE', 'Mark on scene']],
  ON_SCENE: [['COMPLETED', 'Complete']],
};
const cancellableIncidents = new Set(['CREATED', 'ASSESSING', 'RESOURCE_RECOMMENDED', 'RESOURCE_ASSIGNED', 'EN_ROUTE', 'DELAYED', 'ESCALATED', 'REOPTIMIZED']);
const incidentNextActions = {
  CREATED: ['ASSESSING', 'Begin assessment'],
  ASSESSING: ['RESOURCE_RECOMMENDED', 'Confirm resource plan'],
  ON_SCENE: ['RESOLVING', 'Begin resolution'],
};

function eta(value) {
  if (!value) return 'No ETA';
  const minutes = Math.ceil((new Date(value).getTime() - Date.now()) / 60_000);
  return minutes > 0 ? `${minutes} min ETA` : 'ETA elapsed';
}

function time(value) {
  return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
}

function eventContent(event) {
  const payload = event?.payload ?? {};
  return payload.text ?? payload.transcript ?? payload.message ?? payload.description
    ?? payload.observation ?? payload.status ?? event?.eventType?.replaceAll('_', ' ') ?? 'Operational observation';
}

function AssignmentTimeline({ assignment }) {
  const steps = [
    ['ASSIGNED', assignment.assignedAt],
    ['ACCEPTED', assignment.acceptedAt],
    ['EN_ROUTE', assignment.departedAt],
    ['ON_SCENE', assignment.arrivedAt],
    ['COMPLETED', assignment.completedAt],
  ];
  const currentIndex = steps.findIndex(([status]) => status === assignment.status);
  return (
    <div className="assignment-timeline">
      {steps.map(([status, timestamp], index) => (
        <div key={status} className={timestamp || index <= currentIndex ? 'reached' : ''}>
          <i>{timestamp || index <= currentIndex ? <Check size={10} /> : ''}</i>
          <span>
            {status.replaceAll('_', ' ')}
            <small>{time(timestamp)}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

function AssignmentCard({ assignment, resource, alternatives, busy, onUpdate, onCancel, onReassign }) {
  const [replacementId, setReplacementId] = useState('');
  const replacement = alternatives.find(({ resourceId }) => resourceId === replacementId);
  const currentEta = assignment.estimatedTravelTimeSeconds ? Math.ceil(assignment.estimatedTravelTimeSeconds / 60) : null;
  const improvement = currentEta && replacement ? currentEta - replacement.etaMinutes : null;
  return (
    <article className="assignment-card">
      <div className="assignment-head">
        <span>
          <strong>{resource?.name ?? assignment.resourceId}</strong>
          <small>{assignment.assignmentId}</small>
        </span>
        <b>{assignment.status?.replaceAll('_', ' ')}</b>
      </div>
      <div className="route-summary">
        <Route size={15} />
        <div>
          <strong>{eta(assignment.estimatedArrival)}</strong>
          <span>{assignment.distanceMeters ? `${(assignment.distanceMeters / 1000).toFixed(1)} km` : 'Distance unavailable'}</span>
        </div>
        <small>{assignment.metadata?.route?.provider ?? 'Stored route'}{assignment.metadata?.route?.estimated ? ' · estimated' : ''}</small>
      </div>
      <AssignmentTimeline assignment={assignment} />
      {activeStatuses.has(assignment.status) && (
        <div className="action-row">
          {(nextStatuses[assignment.status] ?? []).map(([status, label]) => (
            <button type="button" key={status} disabled={busy} onClick={() => onUpdate(status)}>{label}</button>
          ))}
          <button type="button" className="danger-button" disabled={busy} onClick={onCancel}>Cancel</button>
        </div>
      )}
      {activeStatuses.has(assignment.status) && alternatives.length > 0 && (
        <div className="reassign-box">
          <label>
            Replacement
            <select value={replacementId} onChange={(event) => setReplacementId(event.target.value)}>
              <option value="">Choose available resource</option>
              {alternatives.map((item) => (
                <option key={item.resourceId} value={item.resourceId}>
                  {item.resourceId} · {item.etaMinutes} min
                </option>
              ))}
            </select>
          </label>
          {replacement && (
            <p>
              Current {currentEta ?? '—'} min → replacement {replacement.etaMinutes} min{' '}
              {improvement !== null && <b>({improvement > 0 ? `${improvement} min faster` : 'no ETA improvement'})</b>}
            </p>
          )}
          <button type="button" disabled={!replacement || busy} onClick={() => onReassign(replacement)}>
            Confirm reassignment
          </button>
        </div>
      )}
    </article>
  );
}

function Recommendations({ incident, recommendation, resources, busy, assignResources }) {
  const [selected, setSelected] = useState([]);
  if (!recommendation) return <p className="muted">Loading recommendations…</p>;
  if (recommendation.error) return <p className="muted">{recommendation.error}</p>;
  const candidates = recommendation.candidates ?? recommendation.assignments ?? [];
  const selectedCandidates = candidates.filter(({ resourceId }) => selected.includes(resourceId));
  const covered = new Set(selectedCandidates.flatMap(({ resourceId }) => resources[resourceId]?.capabilities?.map(({ capability }) => capability.code) ?? []));
  const requirements = incident.requiredCapabilities ?? [];
  const toggle = (id) => setSelected((value) => value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);

  return (
    <>
      <div className="recommendation-meta">
        <span>{recommendation.optimizer ?? 'LOCAL_GREEDY'}</span>
        <span>{recommendation.status?.replaceAll('_', ' ') ?? 'AVAILABLE'}</span>
      </div>
      <div className="coverage-list">
        {requirements.map((item) => (
          <span key={item.code} className={covered.has(item.code) ? 'covered' : 'uncovered'}>
            {covered.has(item.code) ? '✓' : '!'} {item.name ?? item.code}
          </span>
        ))}
      </div>
      <div className="recommendation-list">
        {!candidates.length && <p className="muted">No eligible resources found.</p>}
        {candidates.slice(0, 8).map((candidate) => {
          const resource = resources[candidate.resourceId];
          return (
            <label key={candidate.resourceId} className="recommendation-card">
              <input type="checkbox" checked={selected.includes(candidate.resourceId)} onChange={() => toggle(candidate.resourceId)} />
              <span>
                <strong>{resource?.name ?? candidate.resourceId}</strong>
                <small>{resource?.type?.replaceAll('_', ' ')} · {candidate.etaMinutes} min · {candidate.distanceMeters ? (candidate.distanceMeters / 1000).toFixed(1) : '—'} km</small>
                <em>{candidate.reasonFactors?.join(' · ') || 'Eligible available unit'}</em>
              </span>
              <b>{Math.round((candidate.score || 0.9) * 100)}%</b>
            </label>
          );
        })}
      </div>
      {incident.status !== 'RESOURCE_RECOMMENDED' && <p className="muted">Confirm the resource plan in Incident actions before dispatch.</p>}
      <button
        type="button"
        className="primary-action"
        disabled={incident.status !== 'RESOURCE_RECOMMENDED' || !selected.length || busy}
        onClick={() => assignResources(incident.incidentId, selectedCandidates)}
      >
        Assign selected ({selected.length})
      </button>
    </>
  );
}

function SourceTimeline({ events }) {
  return (
    <div className="source-timeline">
      {!events?.length && <p className="muted">No source observations loaded.</p>}
      {events?.map((item, idx) => {
        const event = item.event || item;
        const relationshipType = item.relationshipType || 'DIRECT_SIGNAL';
        return (
          <article key={event.eventId || idx}>
            <time>{time(event.timestamp || event.createdAt)}</time>
            <div>
              <strong>{event.source?.replaceAll('_', ' ') || 'TACTICAL OBSERVATION'}</strong>
              <small>{relationshipType.replaceAll('_', ' ')}</small>
              <p>{String(eventContent(event)).slice(0, 220)}</p>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function analysisAge(value) {
  if (!value) return null;
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  return minutes < 1 ? 'Generated just now' : `Generated ${minutes} min ago`;
}

function SituationAnalysis({ incidentId, result, busy, refresh }) {
  const analysis = result?.analysis;
  return (
    <section className="drawer-section situation-analysis">
      <div className="section-heading">
        <h3><BrainCircuit size={14} /> AI Situation Analysis</h3>
        <button type="button" disabled={busy} onClick={() => refresh(incidentId)}>
          {busy ? 'Analyzing…' : analysis ? 'Refresh Analysis' : 'Generate Analysis'}
        </button>
      </div>
      {!result && <p className="muted">Checking for a recent analysis…</p>}
      {result && !analysis && result.available && <p className="muted">No analysis has been generated for this incident.</p>}
      {result && !result.available && <p className="ai-unavailable">Situation analysis is temporarily unavailable. Core operations remain active.</p>}
      {analysis && (
        <>
          <div className="analysis-meta">
            <span>{analysisAge(result.generatedAt)}</span>
            {result.stale && <b>Operational state changed — refresh recommended</b>}
            <small>{result.model}</small>
          </div>
          <p><strong>{analysis.summary}</strong></p>
          {analysis.currentResponse && <p>{analysis.currentResponse}</p>}
          {!!analysis.keyRisks?.length && (
            <div>
              <h4>Key risks</h4>
              <ul>{analysis.keyRisks.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          )}
          {!!analysis.resourceGaps?.length && (
            <div>
              <h4>Resource gaps</h4>
              <div className="tag-list">{analysis.resourceGaps.map((item) => <span key={item}>{item}</span>)}</div>
            </div>
          )}
          {!!analysis.hospitalConsiderations?.length && (
            <div>
              <h4>Hospital considerations</h4>
              <ul>{analysis.hospitalConsiderations.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          )}
          {!!analysis.recommendedActions?.length && (
            <div>
              <h4>Recommended review</h4>
              {analysis.recommendedActions.map((item) => (
                <p key={`${item.type}-${item.description}`} className="analysis-action">
                  <b>{item.type?.replaceAll('_', ' ')}</b> {item.description}
                </p>
              ))}
            </div>
          )}
          <small>Confidence {Math.round((analysis.confidence || 0.9) * 100)}% · Advisory only</small>
        </>
      )}
    </section>
  );
}

function IncidentDetails({ incident }) {
  const store = useCommandCenter();
  const assignments = Object.values(store.assignments || {}).filter(({ incidentId }) => incidentId === incident.incidentId);
  const activeAlerts = Object.values(store.alerts || {}).filter(({ incidentId, status }) => incidentId === incident.incidentId && ['ACTIVE', 'ACKNOWLEDGED'].includes(status));
  const events = store.incidentEvents?.[incident.incidentId];
  const recommendation = store.recommendations?.[incident.incidentId];
  const factors = [...new Set([...(incident.hazards ?? []), ...(events ?? []).flatMap(({ correlation }) => correlation?.matchedSignals ?? [])])].slice(0, 6);
  const alternatives = recommendation?.candidates ?? recommendation?.assignments ?? [];
  const busy = Boolean(store.busy?.[`incident:${incident.incidentId}`] || store.busy?.[`assign:${incident.incidentId}`]);
  const nextAction = incidentNextActions[incident.status];

  const locString = incident.location
    ? `${incident.location.lat}, ${incident.location.lng}`
    : incident.latitude
    ? `${incident.latitude}, ${incident.longitude}`
    : 'Location coordinates loading…';

  return (
    <>
      <div className="drawer-title">
        <span className={`priority-tag priority-${(incident.priority || 'P1').toLowerCase()}`}>{incident.priority || 'P1'}</span>
        <h2>{incident.title || `Incident #${incident.incidentId}`}</h2>
      </div>
      <p className="entity-id">{incident.incidentId} · {incident.type?.replaceAll('_', ' ') || 'EMERGENCY'}</p>
      <div className="detail-grid">
        <div><span>Status</span><strong>{incident.status?.replaceAll('_', ' ') || 'ACTIVE'}</strong></div>
        <div><span>Severity</span><strong>{incident.severity ?? 4}/5</strong></div>
        <div><span>Confidence</span><strong>{incident.confidence == null ? '—' : `${Math.round(incident.confidence * 100)}%`}</strong></div>
        <div><span>Source signals</span><strong>{incident.eventCount ?? events?.length ?? '1'}</strong></div>
      </div>
      <section className="drawer-section">
        <h3>Operational summary</h3>
        <p>{incident.summary || 'Emergency incident detected. Tactical assessment in progress.'}</p>
      </section>
      <section className="drawer-section">
        <h3><MapPin size={14} /> Location</h3>
        <p>{locString}</p>
      </section>
      <section className="drawer-section">
        <h3><Users size={14} /> Casualty estimates</h3>
        <p>{incident.estimatedVictims ?? '—'} affected · {incident.estimatedInjured ?? '—'} injured · {incident.estimatedTrapped ?? '—'} trapped</p>
      </section>
      {!!incident.hazards?.length && (
        <section className="drawer-section">
          <h3><AlertTriangle size={14} /> Hazards</h3>
          <div className="tag-list">{incident.hazards.map((item) => <span key={item}>{item}</span>)}</div>
        </section>
      )}
      {!!incident.requiredCapabilities?.length && (
        <section className="drawer-section">
          <h3>Required capabilities</h3>
          <div className="tag-list">{incident.requiredCapabilities.map((item) => <span key={item.code}>{item.name ?? item.code}</span>)}</div>
        </section>
      )}
      <section className="drawer-section ai-assessment">
        <h3><BrainCircuit size={14} /> AI assessment</h3>
        <strong>{incident.type?.replaceAll('_', ' ')} · {incident.confidence == null ? 'High confidence' : `${Math.round(incident.confidence * 100)}% confidence`}</strong>
        <ul>{factors.map((factor) => <li key={factor}>{factor.replaceAll('_', ' ')}</li>)}</ul>
        {!factors.length && <p className="muted">Multi-signal corroboration verified.</p>}
      </section>
      <SituationAnalysis
        incidentId={incident.incidentId}
        result={store.situationAnalyses?.[incident.incidentId]}
        busy={Boolean(store.busy?.[`analysis:${incident.incidentId}`])}
        refresh={store.refreshAnalysis}
      />
      <section className="drawer-section">
        <h3><Sparkles size={14} /> Recommended resources</h3>
        <Recommendations
          incident={incident}
          recommendation={recommendation}
          resources={store.resources}
          busy={busy}
          assignResources={store.assignResources}
        />
      </section>
      <section className="drawer-section">
        <h3><Clock3 size={14} /> Assignments</h3>
        {!assignments.length && <p className="muted">No active unit assignments yet.</p>}
        {assignments.map((assignment) => (
          <AssignmentCard
            key={assignment.assignmentId}
            assignment={assignment}
            resource={store.resources[assignment.resourceId]}
            alternatives={alternatives.filter(({ resourceId }) => resourceId !== assignment.resourceId)}
            busy={Boolean(store.busy?.[`assignment:${assignment.assignmentId}`])}
            onUpdate={(status) => store.updateAssignment(assignment.assignmentId, status, incident.incidentId)}
            onCancel={() => store.cancelAssignment(assignment.assignmentId, incident.incidentId)}
            onReassign={(candidate) => store.reassign(assignment, candidate)}
          />
        ))}
      </section>
      {!!activeAlerts.length && (
        <section className="drawer-section">
          <h3>Active alerts</h3>
          {activeAlerts.map((alert) => (
            <p key={alert.alertId} className="drawer-alert">
              <b>{alert.severity}</b> {alert.title}
            </p>
          ))}
        </section>
      )}
      <section className="drawer-section">
        <h3>Source event timeline</h3>
        <SourceTimeline events={events} />
      </section>
      <section className="drawer-section incident-actions">
        <h3>Incident actions</h3>
        {nextAction && (
          <button type="button" className="primary-action" disabled={busy} onClick={() => store.transitionIncident(incident.incidentId, nextAction[0])}>
            {nextAction[1]}
          </button>
        )}
        {incident.status === 'RESOLVING' && (
          <button type="button" className="primary-action" disabled={busy} onClick={() => store.transitionIncident(incident.incidentId, 'RESOLVED')}>
            Resolve incident
          </button>
        )}
        {cancellableIncidents.has(incident.status) && (
          <button type="button" className="danger-button" disabled={busy} onClick={() => store.transitionIncident(incident.incidentId, 'CANCELLED')}>
            Cancel incident
          </button>
        )}
        {!nextAction && incident.status !== 'RESOLVING' && !cancellableIncidents.has(incident.status) && (
          <p className="muted">No incident actions are valid in this state.</p>
        )}
      </section>
    </>
  );
}

function ResourceDetails({ resource }) {
  const store = useCommandCenter();
  const history = Object.values(store.assignments || {}).filter(({ resourceId }) => resourceId === resource.resourceId).sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt));
  const current = history.find(({ status }) => activeStatuses.has(status));
  return (
    <>
      <div className="drawer-title">
        <span className="resource-glyph">{resource.type?.[0] ?? 'R'}</span>
        <h2>{resource.name}</h2>
      </div>
      <p className="entity-id">{resource.resourceId} · {resource.type?.replaceAll('_', ' ')}</p>
      <div className="detail-grid">
        <div><span>Status</span><strong>{resource.status?.replaceAll('_', ' ')}</strong></div>
        <div><span>Availability</span><strong>{resource.availability ? 'Ready' : 'Unavailable'}</strong></div>
      </div>
      <section className="drawer-section">
        <h3><MapPin size={14} /> Location</h3>
        <p>{resource.latitude ?? '—'}, {resource.longitude ?? '—'}</p>
      </section>
      <section className="drawer-section">
        <h3>Capabilities</h3>
        <div className="tag-list">{resource.capabilities?.map(({ capability }) => <span key={capability.code}>{capability.name}</span>)}</div>
      </section>
      <section className="drawer-section">
        <h3>Current assignment</h3>
        {current ? (
          <>
            <p>{current.incidentId} · {eta(current.estimatedArrival)}</p>
            <button type="button" className="secondary-action" onClick={() => store.selectIncident(current.incidentId)}>
              View incident
            </button>
          </>
        ) : (
          <p className="muted">No active assignment.</p>
        )}
      </section>
      <section className="drawer-section">
        <h3>Assignment history</h3>
        {!history.length && <p className="muted">No assignment history.</p>}
        {history.map((assignment) => (
          <div key={assignment.assignmentId} className="history-row">
            <span><strong>{assignment.incidentId}</strong><small>{time(assignment.assignedAt)}</small></span>
            <b>{assignment.status?.replaceAll('_', ' ')}</b>
          </div>
        ))}
      </section>
    </>
  );
}

function HospitalDetails({ hospital }) {
  return (
    <>
      <div className="drawer-title">
        <span className="resource-glyph" style={{ background: '#0284c7', color: '#fff' }}><BedDouble size={16} /></span>
        <h2>{hospital.name}</h2>
      </div>
      <p className="entity-id">{hospital.hospitalId} · {hospital.status?.replaceAll('_', ' ')}</p>
      <div className="detail-grid">
        <div><span>Status</span><strong>{hospital.status?.replaceAll('_', ' ')}</strong></div>
        <div><span>Emergency Dock</span><strong>{hospital.availableEmergencyCapacity ?? 0} Capacity</strong></div>
      </div>
      <section className="drawer-section">
        <h3><MapPin size={14} /> Location</h3>
        <p>{hospital.latitude ?? '—'}, {hospital.longitude ?? '—'}</p>
      </section>
      <section className="drawer-section">
        <h3>Bed & Capacity Telemetry</h3>
        <div className="detail-grid">
          <div><span>Available Beds</span><strong>{hospital.availableBeds ?? 0} / {hospital.totalBeds ?? 0}</strong></div>
          <div><span>Available ICU</span><strong>{hospital.availableIcuBeds ?? 0} / {hospital.icuBeds ?? 0}</strong></div>
          <div><span>Ambulance Bays</span><strong>{hospital.ambulanceCapacity ?? 'Active'}</strong></div>
          <div><span>Accepting Patients</span><strong>{hospital.status === 'OPERATIONAL' ? 'YES' : 'LIMITED'}</strong></div>
        </div>
      </section>
    </>
  );
}

export function EntityDrawer() {
  const store = useCommandCenter();
  const selectedIncId = store.selectedIncidentId;
  const selectedResId = store.selectedResourceId;
  const selectedHospId = store.selectedHospitalId;

  if (!selectedIncId && !selectedResId && !selectedHospId) return null;

  const incident = selectedIncId ? (store.incidents[selectedIncId] || {
    incidentId: selectedIncId,
    title: `Incident #${selectedIncId}`,
    priority: 'P1',
    status: 'ASSESSING',
    type: 'EMERGENCY',
  }) : null;

  const resource = selectedResId ? store.resources[selectedResId] : null;
  const hospital = selectedHospId ? store.hospitals[selectedHospId] : null;

  return (
    <aside className="entity-drawer" aria-label={`${incident ? 'Incident' : resource ? 'Resource' : 'Hospital'} details`}>
      <div className="drawer-top-bar">
        <span className="drawer-type-label">
          {incident ? '🚨 INCIDENT DOSSIER' : resource ? '🚑 UNIT TELEMETRY' : '🏥 MEDICAL FACILITY'}
        </span>
        <button type="button" className="icon-button drawer-close" aria-label="Close details" onClick={store.clearSelection}>
          <X size={18} />
        </button>
      </div>
      <div className="drawer-scroll-body">
        {incident ? <IncidentDetails incident={incident} /> : resource ? <ResourceDetails resource={resource} /> : hospital ? <HospitalDetails hospital={hospital} /> : null}
      </div>
    </aside>
  );
}

import { useState } from 'react';
import { AlertTriangle, Search, Truck } from 'lucide-react';
import { useCommandCenter } from './useCommandCenter.js';

const activeAssignments = new Set(['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SCENE']);

function text(value) { return value?.replaceAll('_', ' ') ?? 'Unknown'; }
function eta(value) {
  if (!value) return '—';
  const minutes = Math.ceil((new Date(value).getTime() - Date.now()) / 60_000);
  return minutes > 0 ? `${minutes} min` : 'elapsed';
}

function ResourceDirectory() {
  const { resources, assignments, selectResource } = useCommandCenter();
  const [filters, setFilters] = useState({ search: '', type: 'ALL', status: 'ALL', capability: 'ALL' });
  const values = Object.values(resources);
  const types = [...new Set(values.map(({ type }) => type))].sort();
  const statuses = [...new Set(values.map(({ status }) => status))].sort();
  const capabilities = [...new Set(values.flatMap(({ capabilities: items = [] }) => items.map(({ capability }) => capability.code)))].sort();
  const activeByResource = Object.fromEntries(Object.values(assignments).filter(({ status }) => activeAssignments.has(status)).map((item) => [item.resourceId, item]));
  const visible = values.filter((resource) => `${resource.resourceId} ${resource.name}`.toLowerCase().includes(filters.search.toLowerCase()))
    .filter(({ type }) => filters.type === 'ALL' || type === filters.type)
    .filter(({ status }) => filters.status === 'ALL' || status === filters.status)
    .filter(({ capabilities: items = [] }) => filters.capability === 'ALL' || items.some(({ capability }) => capability.code === filters.capability));
  const change = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }));
  return <article className="panel workflow-panel"><div className="section-heading"><div><span className="eyebrow">Operations</span><h2><Truck size={16} /> Resource directory</h2></div><span className="count-badge">{visible.length}</span></div><div className="directory-filters"><label><Search size={13} /><input aria-label="Search resources" placeholder="ID or name" value={filters.search} onChange={change('search')} /></label><select aria-label="Resource type" value={filters.type} onChange={change('type')}><option value="ALL">All types</option>{types.map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Resource status" value={filters.status} onChange={change('status')}><option value="ALL">All status</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Resource capability" value={filters.capability} onChange={change('capability')}><option value="ALL">All capabilities</option>{capabilities.map((value) => <option key={value}>{value}</option>)}</select></div><div className="resource-table"><div className="table-head"><span>Resource</span><span>Type</span><span>Status</span><span>Capabilities</span><span>Incident</span><span>ETA</span></div>{!visible.length && <div className="empty-state">No resources match these filters.</div>}{visible.map((resource) => { const assignment = activeByResource[resource.resourceId] ?? resource.assignments?.[0]; return <button type="button" key={resource.resourceId} onClick={() => selectResource(resource.resourceId)}><span><strong>{resource.name}</strong><small>{resource.resourceId}</small></span><span>{text(resource.type)}</span><b className={`status-pill status-${resource.status?.toLowerCase()}`}>{text(resource.status)}</b><span>{resource.capabilities?.map(({ capability }) => capability.code).join(', ') || '—'}</span><span>{assignment?.incidentId ?? assignment?.incident?.incidentId ?? resource.currentIncident?.incidentId ?? '—'}</span><span>{eta(assignment?.estimatedArrival)}</span></button>; })}</div></article>;
}

function AlertWorkflow() {
  const store = useCommandCenter();
  const [filters, setFilters] = useState({ view: 'ACTIVE', severity: 'ALL', type: 'ALL', status: 'ALL' });
  const values = Object.values(store.alerts);
  const types = [...new Set(values.map(({ type }) => type))].sort();
  const visible = values.filter(({ status }) => filters.view === 'ACTIVE' ? ['ACTIVE', 'ACKNOWLEDGED'].includes(status) : ['RESOLVED', 'DISMISSED'].includes(status))
    .filter(({ severity }) => filters.severity === 'ALL' || severity === filters.severity)
    .filter(({ type }) => filters.type === 'ALL' || type === filters.type)
    .filter(({ status }) => filters.status === 'ALL' || status === filters.status);
  const change = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }));
  return <article className="panel workflow-panel"><div className="section-heading"><div><span className="eyebrow">Attention queue</span><h2><AlertTriangle size={16} /> Alert workflow</h2></div><div className="view-tabs"><button type="button" className={filters.view === 'ACTIVE' ? 'active' : ''} onClick={() => setFilters((value) => ({ ...value, view: 'ACTIVE' }))}>Active</button><button type="button" className={filters.view === 'HISTORY' ? 'active' : ''} onClick={() => setFilters((value) => ({ ...value, view: 'HISTORY' }))}>History</button></div></div><div className="alert-filters"><select aria-label="Alert severity" value={filters.severity} onChange={change('severity')}><option value="ALL">All severity</option>{['CRITICAL', 'HIGH', 'WARNING', 'INFO'].map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Alert type" value={filters.type} onChange={change('type')}><option value="ALL">All types</option>{types.map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Alert status" value={filters.status} onChange={change('status')}><option value="ALL">All status</option>{['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED'].map((value) => <option key={value}>{value}</option>)}</select></div><div className="workflow-alert-list">{!visible.length && <div className="empty-state">No alerts in this view.</div>}{visible.map((alert) => { const escalation = alert.metadata?.escalation; const busy = store.busy[`alert:${alert.alertId}`]; return <section key={alert.alertId}><div className="workflow-alert-head"><span className={`alert-severity severity-${alert.severity?.toLowerCase()}`}>{alert.severity}</span><span><strong>{alert.title}</strong><small>{text(alert.type)} · {text(alert.status)} · {new Date(alert.createdAt).toLocaleString()}</small></span></div><p>{alert.message}</p>{alert.incidentId && <button type="button" className="link-action" onClick={() => store.selectIncident(alert.incidentId)}>View {alert.incidentId}</button>}{escalation && <div className="escalation-card"><b>Escalation recommendation · {escalation.urgency}</b><p>{escalation.reason}</p><ul>{escalation.recommendedActions?.map((action, index) => <li key={`${action.type}-${index}`}>{text(action.type)}{action.resourceId ? ` ${action.resourceId}` : ''}: {action.details}</li>)}</ul><button type="button" onClick={() => alert.incidentId && store.selectIncident(alert.incidentId)}>Review recommendation</button></div>}<div className="action-row">{alert.status === 'ACTIVE' && <button type="button" disabled={busy} onClick={() => store.updateAlert(alert.alertId, 'acknowledge')}>Acknowledge</button>}{['ACTIVE', 'ACKNOWLEDGED'].includes(alert.status) && <button type="button" className="danger-button" disabled={busy} onClick={() => store.updateAlert(alert.alertId, 'resolve')}>Resolve</button>}</div></section>; })}</div></article>;
}

export function WorkflowPanels() {
  return <section className="workflow-grid"><ResourceDirectory /><AlertWorkflow /></section>;
}

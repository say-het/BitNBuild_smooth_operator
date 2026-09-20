import { useState } from 'react';
import { Filter, Siren } from 'lucide-react';
import { useCommandCenter } from './useCommandCenter.js';

const priorityRank = { P0: 0, P1: 1, P2: 2, P3: 3 };

function elapsed(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function IncidentQueue() {
  const { incidents, selectedIncidentId, selectIncident } = useCommandCenter();
  const [filters, setFilters] = useState({ search: '', priority: 'ALL', type: 'ALL', status: 'ALL', severity: 'ALL', sort: 'priority' });
  const values = Object.values(incidents).filter((incident) => !['RESOLVED', 'CANCELLED'].includes(incident.status));
  const types = [...new Set(values.map(({ type }) => type))].sort();
  const statuses = [...new Set(values.map(({ status }) => status))].sort();

  const visible = values
    .filter((incident) => `${incident.incidentId} ${incident.title}`.toLowerCase().includes(filters.search.toLowerCase()))
    .filter((incident) => filters.priority === 'ALL' || incident.priority === filters.priority)
    .filter((incident) => filters.type === 'ALL' || incident.type === filters.type)
    .filter((incident) => filters.status === 'ALL' || incident.status === filters.status)
    .filter((incident) => filters.severity === 'ALL' || incident.severity === Number(filters.severity))
    .sort((left, right) => {
      if (filters.sort === 'severity') return right.severity - left.severity;
      if (filters.sort === 'newest') return new Date(right.detectedAt) - new Date(left.detectedAt);
      if (filters.sort === 'oldest') return new Date(left.detectedAt) - new Date(right.detectedAt);
      return priorityRank[left.priority] - priorityRank[right.priority] || right.severity - left.severity;
    });

  const change = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }));

  return (
    <aside className="incident-queue panel">
      <div className="section-heading">
        <div><span className="eyebrow">Priority queue</span><h2>Active incidents</h2></div>
        <span className="count-badge">{visible.length}</span>
      </div>
      <div className="queue-filters" aria-label="Incident queue filters">
        <span className="filter-label"><Filter size={13} /> Filter</span>
        <input className="filter-search" aria-label="Search incidents" placeholder="Search ID or title" value={filters.search} onChange={change('search')} />
        <select aria-label="Priority" value={filters.priority} onChange={change('priority')}>
          <option value="ALL">All priority</option>{['P0', 'P1', 'P2', 'P3'].map((value) => <option key={value}>{value}</option>)}
        </select>
        <select aria-label="Incident type" value={filters.type} onChange={change('type')}>
          <option value="ALL">All types</option>{types.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select aria-label="Incident status" value={filters.status} onChange={change('status')}>
          <option value="ALL">All status</option>{statuses.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select aria-label="Incident severity" value={filters.severity} onChange={change('severity')}><option value="ALL">All severity</option>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>Severity {value}</option>)}</select>
        <select aria-label="Sort incidents" value={filters.sort} onChange={change('sort')}>
          <option value="priority">Priority</option><option value="severity">Severity</option>
          <option value="newest">Newest</option><option value="oldest">Oldest</option>
        </select>
      </div>
      <div className="queue-list">
        {!visible.length && <div className="empty-state"><Siren size={20} /> No incidents match these filters.</div>}
        {visible.map((incident) => (
          <button
            type="button" key={incident.incidentId}
            className={`incident-card priority-${incident.priority.toLowerCase()} ${selectedIncidentId === incident.incidentId ? 'selected' : ''}`}
            onClick={() => selectIncident(incident.incidentId)}
          >
            <span className="priority-tag">{incident.priority}</span>
            <span className="incident-card-copy">
              <strong>{incident.title}</strong>
              <small>{incident.type.replaceAll('_', ' ')} · {incident.status.replaceAll('_', ' ')}</small>
            </span>
            <span className="incident-card-meta"><b>S{incident.severity}</b><small>{elapsed(incident.detectedAt ?? incident.createdAt)}</small></span>
          </button>
        ))}
      </div>
    </aside>
  );
}

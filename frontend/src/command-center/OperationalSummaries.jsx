import { useState } from 'react';
import { AlertTriangle, BedDouble, Truck } from 'lucide-react';
import { useCommandCenter } from './useCommandCenter.js';

function label(value) {
  return value?.replaceAll('_', ' ') ?? 'Unknown';
}

export function OperationalSummaries() {
  const { resources, hospitals, alerts, selectIncident } = useCommandCenter();
  const [hospitalSearch, setHospitalSearch] = useState('');
  const grouped = Object.values(resources).reduce((result, resource) => {
    const row = result[resource.type] ?? { total: 0, available: 0 };
    row.total += 1;
    if (resource.status === 'AVAILABLE') row.available += 1;
    result[resource.type] = row;
    return result;
  }, {});
  const activeAlerts = Object.values(alerts)
    .filter(({ status }) => ['ACTIVE', 'ACKNOWLEDGED'].includes(status))
    .sort((left, right) => (right.severityLevel ?? 0) - (left.severityLevel ?? 0));

  return (
    <section className="summary-grid" id="resources">
      <article className="panel summary-panel">
        <div className="section-heading"><div><span className="eyebrow">Fleet</span><h2><Truck size={16} /> Resource readiness</h2></div></div>
        <div className="summary-list">
          {!Object.keys(grouped).length && <div className="empty-state">No resources available.</div>}
          {Object.entries(grouped).map(([type, counts]) => (
            <div key={type}><span>{label(type)}</span><strong>{counts.available}<small> / {counts.total} available</small></strong></div>
          ))}
        </div>
      </article>
      <article className="panel summary-panel alerts-panel">
        <div className="section-heading"><div><span className="eyebrow">Attention</span><h2><AlertTriangle size={16} /> Active alerts</h2></div><span className="count-badge alert-count">{activeAlerts.length}</span></div>
        <div className="alert-list">
          {!activeAlerts.length && <div className="empty-state">No active alerts.</div>}
          {activeAlerts.slice(0, 6).map((alert) => (
            <button type="button" key={alert.alertId} disabled={!alert.incidentId} onClick={() => alert.incidentId && selectIncident(alert.incidentId)}>
              <span className={`alert-severity severity-${alert.severity?.toLowerCase()}`}>{alert.severity}</span>
              <span>
                <strong>{alert.title}</strong>
                <small>{label(alert.type)} · {label(alert.status)}{alert.incidentId ? ` · ${alert.incidentId}` : ''}</small>
                {alert.message && <em>{alert.message}</em>}
              </span>
              <time>{new Date(alert.updatedAt ?? alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
            </button>
          ))}
        </div>
      </article>
      <article className="panel summary-panel">
        <div className="section-heading"><div><span className="eyebrow">Facilities</span><h2><BedDouble size={16} /> Hospital capacity</h2></div></div>
        <input className="summary-search" aria-label="Search hospitals" placeholder="Search hospital name" value={hospitalSearch} onChange={(event) => setHospitalSearch(event.target.value)} />
        <div className="hospital-list">
          {!Object.keys(hospitals).length && <div className="empty-state">No hospitals available.</div>}
          {Object.values(hospitals).filter(({ name }) => name.toLowerCase().includes(hospitalSearch.toLowerCase())).map((hospital) => (
            <div key={hospital.hospitalId}>
              <span><strong>{hospital.name}</strong><small>{label(hospital.status)}</small></span>
              <span className="capacity-values">
                <small>Emergency</small><b>{hospital.emergencyCapacity ? `${hospital.availableEmergencyCapacity}/${hospital.emergencyCapacity}` : '—'}</b>
                <small>ICU</small><b>{hospital.icuBeds ? `${hospital.availableIcuBeds}/${hospital.icuBeds}` : '—'}</b>
              </span>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

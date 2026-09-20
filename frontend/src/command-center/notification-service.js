const readStorageKey = 'resqai.read-notifications';

function readIds() {
  try { return new Set(JSON.parse(localStorage.getItem(readStorageKey) ?? '[]')); }
  catch { return new Set(); }
}

export function saveReadIds(ids) {
  localStorage.setItem(readStorageKey, JSON.stringify([...ids].slice(-500)));
}

export function notificationFromAlert(alert) {
  const read = readIds().has(`alert:${alert.alertId}`);
  return {
    notificationId: `alert:${alert.alertId}`,
    source: 'ALERT',
    title: alert.title,
    message: alert.message,
    severity: alert.severity,
    incidentId: alert.incidentId,
    resourceId: alert.resourceId,
    createdAt: alert.createdAt ?? alert.updatedAt ?? new Date().toISOString(),
    read,
  };
}

export function notificationsFromAlerts(alerts) {
  return alerts.filter(({ status }) => ['ACTIVE', 'ACKNOWLEDGED'].includes(status)).map(notificationFromAlert);
}

export function notificationFromRealtime(event, data) {
  if (event === 'alert.created') return notificationFromAlert(data);
  if (event === 'incident.created' && (data.priority === 'P0' || data.severity >= 5)) {
    return {
      notificationId: `incident:${data.incidentId}:${data.updatedAt ?? Date.now()}`,
      source: 'INCIDENT', title: `Critical incident — ${data.incidentId}`,
      message: data.title ?? 'A critical incident requires operator review.', severity: 'CRITICAL',
      incidentId: data.incidentId, createdAt: data.updatedAt ?? new Date().toISOString(), read: false,
    };
  }
  if (event === 'assignment.created') {
    const reassigned = Boolean(data.metadata?.replacesAssignmentId);
    return {
      notificationId: `assignment:${data.assignmentId}`,
      source: 'ASSIGNMENT', title: `Resource ${reassigned ? 'reassigned' : 'assigned'} — ${data.incidentId}`,
      message: reassigned
        ? `${data.resourceId} replaced the previous assignment.`
        : `${data.resourceId} has been assigned.`, severity: 'INFO',
      incidentId: data.incidentId, resourceId: data.resourceId,
      createdAt: data.assignedAt ?? new Date().toISOString(), read: false,
    };
  }
  return null;
}

export function showBrowserNotification(notification) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!['HIGH', 'CRITICAL'].includes(notification.severity)) return;
  new Notification(notification.title, { body: notification.message, tag: notification.notificationId });
}

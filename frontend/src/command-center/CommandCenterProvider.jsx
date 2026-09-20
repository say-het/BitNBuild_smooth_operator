import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { api, loadLiveContext, loadOperationalSnapshot } from '../lib/api.js';
import { useRealtime } from '../realtime/useRealtime.js';
import { CommandCenterContext } from './command-center-context.js';
import {
  notificationFromRealtime, notificationsFromAlerts, saveReadIds, showBrowserNotification,
} from './notification-service.js';

const realtimeEvents = [
  'incident.created', 'incident.updated', 'incident.state_changed', 'incident.resolved', 'incident.escalated',
  'resource.updated', 'resource.location_updated', 'resource.assigned', 'resource.released',
  'assignment.created', 'assignment.updated', 'assignment.cancelled',
  'alert.created', 'alert.updated', 'alert.resolved', 'hospital.updated',
  'simulation.started', 'simulation.paused', 'simulation.resumed', 'simulation.stopped',
  'simulation.completed', 'simulation.event', 'simulation.reset',
];

const initialState = {
  incidents: {}, resources: {}, hospitals: {}, alerts: {}, assignments: {}, roads: [], liveContext: null,
  incidentEvents: {}, recommendations: {}, situationAnalyses: {}, notifications: {},
  selectedIncidentId: null, selectedResourceId: null, selectedHospitalId: null,
  mapHighlights: { incidentIds: [], resourceIds: [] }, copilotOpen: false, notificationsOpen: false,
  copilotMessages: [], copilotSessionId: null, copilotBusy: false,
  mapFilters: { incidents: true, resources: true, hospitals: true, routes: true, hotspots: false, roads: true, facilities: true, hazards: false },
  busy: {}, feedback: null, loading: true, refreshing: false, error: null,
};

function records(items, key) {
  return Object.fromEntries(items.map((item) => [item[key], item]));
}

function mergeRecords(current, items = [], key) {
  return items.filter(Boolean).reduce((result, item) => ({ ...result, [item[key]]: { ...result[item[key]], ...item } }), current);
}

function mergeResource(current, data) {
  if (!data.location) {
    const merged = { ...current, ...data };
    if ('currentIncidentId' in data) merged.currentIncident = data.currentIncidentId ? { incidentId: data.currentIncidentId } : null;
    else if (data.incidentId && data.status !== 'AVAILABLE') merged.currentIncident = { incidentId: data.incidentId };
    return merged;
  }
  const { location, ...rest } = data;
  return { ...current, ...rest, latitude: location.lat, longitude: location.lng };
}

function reducer(state, action) {
  if (action.type === 'loading') return { ...state, [state.loading ? 'loading' : 'refreshing']: true, error: null };
  if (action.type === 'snapshot') return {
    ...state,
    incidents: records(action.data.incidents, 'incidentId'), resources: records(action.data.resources, 'resourceId'),
    hospitals: records(action.data.hospitals, 'hospitalId'), alerts: records(action.data.alerts, 'alertId'),
    roads: action.data.roads,
    notifications: mergeRecords(
      Object.fromEntries(Object.entries(state.notifications).filter(([, item]) => !item.incidentId || action.data.incidents.some(({ incidentId }) => incidentId === item.incidentId))),
      notificationsFromAlerts(action.data.alerts), 'notificationId',
    ),
    selectedIncidentId: action.data.incidents.some(({ incidentId }) => incidentId === state.selectedIncidentId) ? state.selectedIncidentId : null,
    selectedResourceId: action.data.resources.some(({ resourceId }) => resourceId === state.selectedResourceId) ? state.selectedResourceId : null,
    loading: false, refreshing: false, error: null,
  };
  if (action.type === 'liveContext') return { ...state, liveContext: action.data };
  if (action.type === 'error') return { ...state, loading: false, refreshing: false, error: action.error };
  if (action.type === 'selectIncident') return { ...state, selectedIncidentId: action.id, selectedResourceId: null, selectedHospitalId: null, notificationsOpen: false };
  if (action.type === 'selectResource') return { ...state, selectedResourceId: action.id, selectedIncidentId: null, selectedHospitalId: null, notificationsOpen: false };
  if (action.type === 'selectHospital') return { ...state, selectedHospitalId: action.id, selectedIncidentId: null, selectedResourceId: null, notificationsOpen: false };
  if (action.type === 'clearSelection') return { ...state, selectedIncidentId: null, selectedResourceId: null, selectedHospitalId: null };
  if (action.type === 'incidentData') return { ...state, incidents: mergeRecords(state.incidents, [action.data], 'incidentId') };
  if (action.type === 'incidentEvents') return { ...state, incidentEvents: { ...state.incidentEvents, [action.id]: action.data } };
  if (action.type === 'recommendation') return { ...state, recommendations: { ...state.recommendations, [action.id]: action.data } };
  if (action.type === 'situationAnalysis') return { ...state, situationAnalyses: { ...state.situationAnalyses, [action.id]: action.data } };
  if (action.type === 'toggleCopilot') return { ...state, copilotOpen: !state.copilotOpen, notificationsOpen: false };
  if (action.type === 'toggleNotifications') return { ...state, notificationsOpen: !state.notificationsOpen, copilotOpen: false };
  if (action.type === 'copilotStart') return { ...state, copilotBusy: true, copilotOpen: true, copilotMessages: [...state.copilotMessages, { role: 'user', text: action.message }] };
  if (action.type === 'copilotResult') return { ...state, copilotBusy: false, copilotSessionId: action.data.sessionId, copilotMessages: [...state.copilotMessages, { role: 'assistant', ...action.data }] };
  if (action.type === 'clearCopilot') return { ...state, copilotMessages: [], copilotSessionId: null };
  if (action.type === 'mapActions') return { ...state, ...action.selection, mapHighlights: action.highlights };
  if (action.type === 'notificationRead') return { ...state, notifications: { ...state.notifications, [action.id]: { ...state.notifications[action.id], read: true } } };
  if (action.type === 'assignments') return { ...state, assignments: mergeRecords(state.assignments, action.data, 'assignmentId') };
  if (action.type === 'toggleLayer') return { ...state, mapFilters: { ...state.mapFilters, [action.layer]: !state.mapFilters[action.layer] } };
  if (action.type === 'operationStart') return { ...state, busy: { ...state.busy, [action.key]: true }, feedback: null };
  if (action.type === 'operationEnd') {
    const busy = { ...state.busy }; delete busy[action.key];
    return { ...state, busy, feedback: action.feedback };
  }
  if (action.type === 'clearFeedback') return { ...state, feedback: null };
  if (action.type === 'confirmed') return {
    ...state,
    incidents: mergeRecords(state.incidents, action.data.incidents, 'incidentId'),
    resources: action.data.resources.filter(Boolean).reduce((result, item) => ({
      ...result, [item.resourceId]: mergeResource(result[item.resourceId] ?? {}, item),
    }), state.resources),
    assignments: mergeRecords(state.assignments, action.data.assignments, 'assignmentId'),
    alerts: mergeRecords(state.alerts, action.data.alerts, 'alertId'),
  };
  if (action.type === 'realtime') {
    const [entity] = action.event.split('.');
    const keys = { incident: ['incidents', 'incidentId'], resource: ['resources', 'resourceId'], assignment: ['assignments', 'assignmentId'], alert: ['alerts', 'alertId'], hospital: ['hospitals', 'hospitalId'] };
    const target = keys[entity];
    const notification = notificationFromRealtime(action.event, action.data);
    const notificationState = notification ? { ...state.notifications, [notification.notificationId]: notification } : state.notifications;
    if (!target) return { ...state, notifications: notificationState };
    const [collection, idKey] = target;
    const id = action.data[idKey];
    if (!id) return state;
    const current = state[collection][id] ?? {};
    const merged = entity === 'resource' ? mergeResource(current, action.data) : { ...current, ...action.data };
    return { ...state, [collection]: { ...state[collection], [id]: merged }, notifications: notificationState };
  }
  return state;
}

export function CommandCenterProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const realtime = useRealtime();

  const refresh = useCallback(async () => {
    dispatch({ type: 'loading' });
    loadLiveContext().then((data) => dispatch({ type: 'liveContext', data })).catch(() => {});
    try { dispatch({ type: 'snapshot', data: await loadOperationalSnapshot() }); }
    catch (error) { dispatch({ type: 'error', error: error.message }); }
  }, []);

  const loadAssignments = useCallback(async (kind, id) => {
    try { dispatch({ type: 'assignments', data: await api(`/${kind}/${id}/assignments`) }); } catch { /* detail remains usable */ }
  }, []);

  const loadIncident = useCallback(async (id) => {
    const requests = await Promise.allSettled([
      api(`/incidents/${id}`), api(`/incidents/${id}/events`),
      api(`/incidents/${id}/assignments`), api('/optimization/recommend', { method: 'POST', body: { incidentIds: [id] } }),
      api(`/incidents/${id}/analysis`),
    ]);
    if (requests[0].status === 'fulfilled') dispatch({ type: 'incidentData', data: requests[0].value });
    if (requests[1].status === 'fulfilled') dispatch({ type: 'incidentEvents', id, data: requests[1].value });
    if (requests[2].status === 'fulfilled') dispatch({ type: 'assignments', data: requests[2].value });
    dispatch({ type: 'recommendation', id, data: requests[3].status === 'fulfilled' ? requests[3].value : { error: 'Recommendations unavailable' } });
    if (requests[4].status === 'fulfilled') dispatch({ type: 'situationAnalysis', id, data: requests[4].value });
  }, []);

  const operate = useCallback(async (key, success, work) => {
    dispatch({ type: 'operationStart', key });
    try {
      const result = await work();
      dispatch({ type: 'operationEnd', key, feedback: { type: 'success', message: success } });
      return result;
    } catch (error) {
      dispatch({ type: 'operationEnd', key, feedback: { type: 'error', message: error.message } });
      return null;
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh, realtime.reconnectVersion]);
  useEffect(() => {
    const timer = setInterval(() => { loadLiveContext().then((data) => dispatch({ type: 'liveContext', data })).catch(() => {}); }, 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    realtime.subscribe('operations'); realtime.subscribe('alerts');
    const listeners = realtimeEvents.map((event) => {
      const listener = (message) => {
        const data = message.data ?? {};
        const notification = notificationFromRealtime(event, data);
        if (notification) showBrowserNotification(notification);
        dispatch({ type: 'realtime', event, data });
        if (event === 'simulation.event' || event === 'simulation.reset') refresh();
      };
      realtime.on(event, listener); return [event, listener];
    });
    return () => {
      realtime.unsubscribe('operations'); realtime.unsubscribe('alerts');
      listeners.forEach(([event, listener]) => realtime.off(event, listener));
    };
  }, [realtime, refresh]);
  useEffect(() => {
    const room = state.selectedIncidentId ? `incident:${state.selectedIncidentId}` : state.selectedResourceId ? `resource:${state.selectedResourceId}` : null;
    if (!room) return undefined;
    realtime.subscribe(room); return () => { realtime.unsubscribe(room); };
  }, [realtime, state.selectedIncidentId, state.selectedResourceId]);

  const actions = useMemo(() => ({
    refresh,
    selectIncident(id) { dispatch({ type: 'selectIncident', id }); loadIncident(id); },
    selectResource(id) { dispatch({ type: 'selectResource', id }); loadAssignments('resources', id); },
    selectHospital(id) { dispatch({ type: 'selectHospital', id }); },
    clearSelection: () => dispatch({ type: 'clearSelection' }),
    clearFeedback: () => dispatch({ type: 'clearFeedback' }),
    toggleLayer: (layer) => dispatch({ type: 'toggleLayer', layer }),
    toggleCopilot: () => dispatch({ type: 'toggleCopilot' }),
    clearCopilot: () => dispatch({ type: 'clearCopilot' }),
    toggleNotifications: () => dispatch({ type: 'toggleNotifications' }),
    async refreshAnalysis(incidentId) {
      dispatch({ type: 'operationStart', key: `analysis:${incidentId}` });
      try {
        const data = await api(`/incidents/${incidentId}/analysis`, { method: 'POST', body: { force: true } });
        dispatch({ type: 'situationAnalysis', id: incidentId, data });
        dispatch({ type: 'operationEnd', key: `analysis:${incidentId}`, feedback: data.available ? { type: 'success', message: 'Situation analysis refreshed' } : { type: 'error', message: 'Situation analysis is temporarily unavailable' } });
      } catch (error) {
        dispatch({ type: 'operationEnd', key: `analysis:${incidentId}`, feedback: { type: 'error', message: error.message } });
      }
    },
    async queryCopilot(message) {
      dispatch({ type: 'copilotStart', message });
      try {
        const data = await api('/copilot/query', { method: 'POST', body: { message, ...(state.copilotSessionId ? { sessionId: state.copilotSessionId } : {}) } });
        dispatch({ type: 'copilotResult', data });
        actions.applyMapActions(data.mapActions);
      } catch (error) {
        dispatch({ type: 'copilotResult', data: { available: false, sessionId: state.copilotSessionId, answer: 'AI Copilot temporarily unavailable. Operational dashboard remains active.', references: [], mapActions: [], suggestedFollowUps: [], errorCode: error.message } });
      }
    },
    applyMapActions(mapActions = []) {
      const selection = { selectedIncidentId: null, selectedResourceId: null, selectedHospitalId: null };
      const highlights = { incidentIds: [], resourceIds: [] };
      for (const action of mapActions) {
        if (action.type === 'FOCUS_INCIDENT' || action.type === 'SHOW_ROUTE') selection.selectedIncidentId = action.entityId;
        if (action.type === 'FOCUS_RESOURCE') selection.selectedResourceId = action.entityId;
        if (action.type === 'FOCUS_HOSPITAL') selection.selectedHospitalId = action.entityId;
        if (action.type === 'SHOW_INCIDENTS') highlights.incidentIds = action.entityIds;
        if (action.type === 'SHOW_RESOURCES') highlights.resourceIds = action.entityIds;
      }
      dispatch({ type: 'mapActions', selection, highlights });
      if (selection.selectedIncidentId) loadIncident(selection.selectedIncidentId);
      if (selection.selectedResourceId) loadAssignments('resources', selection.selectedResourceId);
    },
    markNotificationRead(notificationId) {
      const readIds = new Set(Object.values(state.notifications).filter(({ read }) => read).map(({ notificationId: id }) => id));
      readIds.add(notificationId); saveReadIds(readIds); dispatch({ type: 'notificationRead', id: notificationId });
    },
    openNotification(notification) {
      actions.markNotificationRead(notification.notificationId);
      if (notification.incidentId) { dispatch({ type: 'selectIncident', id: notification.incidentId }); loadIncident(notification.incidentId); }
      else if (notification.resourceId) { dispatch({ type: 'selectResource', id: notification.resourceId }); loadAssignments('resources', notification.resourceId); }
    },
    async enableBrowserNotifications() {
      if ('Notification' in window) await Notification.requestPermission();
    },
    async assignResources(incidentId, choices) {
      const bulk = choices.length > 1;
      const body = choices.map((choice) => ({
        resourceId: choice.resourceId, role: choice.capabilitiesCovered?.[0], reason: 'Command center recommendation',
        origin: 'OPTIMIZER', optimizationScore: choice.score,
      }));
      const result = await operate(`assign:${incidentId}`, `${choices.length} resource${bulk ? 's' : ''} assigned`, () => api(
        `/incidents/${incidentId}/assignments${bulk ? '/bulk' : ''}`,
        { method: 'POST', body: bulk ? { assignments: body } : body[0] },
      ));
      if (result) {
        dispatch({ type: 'confirmed', data: {
          assignments: result.assignments ?? [result.assignment], incidents: [result.incident],
          resources: result.resources ?? [result.resource], alerts: [],
        } });
        loadIncident(incidentId);
      }
      return result;
    },
    async updateAssignment(assignmentId, status, incidentId) {
      const result = await operate(`assignment:${assignmentId}`, `Assignment moved to ${status.replaceAll('_', ' ')}`, () => api(
        `/assignments/${assignmentId}/status`, { method: 'PATCH', body: { status, reason: 'Command center update' } },
      ));
      if (result) dispatch({ type: 'confirmed', data: { assignments: [result.assignment], incidents: [result.incident], resources: [result.resource], alerts: [] } });
      if (result && incidentId) loadIncident(incidentId);
    },
    async cancelAssignment(assignmentId, incidentId) {
      const result = await operate(`assignment:${assignmentId}`, 'Assignment cancelled', () => api(
        `/assignments/${assignmentId}/cancel`, { method: 'POST', body: { reason: 'Cancelled from command center' } },
      ));
      if (result) dispatch({ type: 'confirmed', data: { assignments: [result.assignment], incidents: [result.incident], resources: [result.resource], alerts: [] } });
      if (result && incidentId) loadIncident(incidentId);
    },
    async reassign(assignment, candidate) {
      const result = await operate(`assignment:${assignment.assignmentId}`, `Reassigned to ${candidate.resourceId}`, () => api(
        `/assignments/${assignment.assignmentId}/reassign`, {
          method: 'POST', body: { resourceId: candidate.resourceId, reason: 'Command center ETA improvement', origin: 'OPTIMIZER', optimizationScore: candidate.score },
        },
      ));
      if (result) {
        dispatch({ type: 'confirmed', data: {
          assignments: [{ assignmentId: assignment.assignmentId, status: 'REASSIGNED' }, result.assignment],
          incidents: [], resources: [{ resourceId: assignment.resourceId, status: 'AVAILABLE', currentIncidentId: null }, result.resource], alerts: [],
        } });
        loadIncident(assignment.incidentId);
      }
    },
    async transitionIncident(incidentId, status) {
      const terminal = ['RESOLVED', 'CANCELLED'].includes(status);
      const path = status === 'RESOLVED' ? `/incidents/${incidentId}/resolve`
        : status === 'CANCELLED' ? `/incidents/${incidentId}/cancel` : `/incidents/${incidentId}/transition`;
      const body = terminal
        ? { reason: `${status === 'RESOLVED' ? 'Resolved' : 'Cancelled'} from command center` }
        : { status, reason: `Operator advanced incident to ${status}` };
      const result = await operate(`incident:${incidentId}`, `Incident ${status.toLowerCase()}`, () => api(path, { method: 'POST', body }));
      const incident = result?.incident ?? result;
      if (incident) dispatch({ type: 'confirmed', data: {
        incidents: [incident],
        resources: (result.releasedResources ?? []).map((resourceId) => ({ resourceId, status: 'AVAILABLE', currentIncident: null })),
        assignments: (result.cancelledAssignments ?? result.completedAssignments ?? []).map((assignmentId) => ({ assignmentId, status: status === 'RESOLVED' ? 'COMPLETED' : 'CANCELLED' })),
        alerts: [],
      } });
      if (incident) loadIncident(incidentId);
    },
    async updateAlert(alertId, action) {
      const result = await operate(`alert:${alertId}`, `Alert ${action === 'acknowledge' ? 'acknowledged' : 'resolved'}`, () => api(
        `/alerts/${alertId}/${action}`, { method: 'PATCH', body: { reason: `Operator ${action}d from command center` } },
      ));
      if (result) dispatch({ type: 'confirmed', data: { incidents: [], resources: [], assignments: [], alerts: [result] } });
    },
  }), [loadAssignments, loadIncident, operate, refresh, state.copilotSessionId, state.notifications]);

  const value = useMemo(() => ({ ...state, ...actions, realtime }), [actions, realtime, state]);
  return <CommandCenterContext value={value}>{children}</CommandCenterContext>;
}

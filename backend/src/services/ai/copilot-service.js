import { randomUUID } from 'node:crypto';
import { logger } from '../../config/logger.js';
import { geminiClient } from './gemini-client.js';
import { operationalAITools } from './operational-ai-tools.js';
import { copilotResponseSchema, COPILOT_RESPONSE_SCHEMA } from './copilot-contract.js';
import { buildCopilotPrompt, COMMAND_COPILOT_SYSTEM_PROMPT } from './copilot-prompt.js';

const MAX_SESSIONS = 50;
const MAX_HISTORY_ITEMS = 8;

function idsIn(value, result = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => idsIn(item, result));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if ((key.endsWith('Id') || key === 'id') && typeof item === 'string') result.add(item);
      idsIn(item, result);
    }
  }
  return result;
}

function grounded(output, toolResults) {
  const parsed = copilotResponseSchema.parse(output);
  const knownIds = idsIn(toolResults);
  return {
    ...parsed,
    references: parsed.references.filter(({ entityId }) => knownIds.has(entityId)),
    mapActions: parsed.mapActions.flatMap((action) => {
      if (action.entityId) return knownIds.has(action.entityId) ? [action] : [];
      const entityIds = (action.entityIds || []).filter((id) => knownIds.has(id));
      return entityIds.length ? [{ ...action, entityIds }] : [];
    }),
  };
}

async function retrieve(message, tools) {
  const query = message.toLowerCase();
  const [incidents, availableResources, allResources, hospitals, activeAlerts, shortages, delayed, socialAlerts] = await Promise.all([
    tools.getActiveIncidents().catch(() => []),
    tools.getAvailableResources().catch(() => []),
    (tools.getAllResources ? tools.getAllResources() : tools.getAvailableResources()).catch(() => []),
    tools.getHospitals().catch(() => []),
    tools.getActiveAlerts().catch(() => []),
    tools.getResourceShortages().catch(() => []),
    tools.getDelayedIncidents().catch(() => []),
    (tools.getLiveSocialAlerts ? tools.getLiveSocialAlerts(15) : []).catch(() => []),
  ]);

  const incidentMentions = incidents.filter(({ incidentId, title }) => 
    query.includes(incidentId.toLowerCase()) || (title && query.includes(title.toLowerCase()))
  ).slice(0, 3);

  const resourceMentions = allResources.filter(({ resourceId, name }) => 
    query.includes(resourceId.toLowerCase()) || (name && query.includes(name.toLowerCase()))
  ).slice(0, 3);

  const hospitalMentions = hospitals.filter(({ hospitalId, name }) => 
    query.includes(hospitalId.toLowerCase()) || (name && query.includes(name.toLowerCase()))
  ).slice(0, 3);

  const toolResults = {
    summary: {
      totalActiveIncidents: incidents.length,
      totalAvailableUnits: availableResources.length,
      totalFleetUnits: allResources.length,
      totalActiveAlerts: activeAlerts.length,
      delayedIncidentsCount: delayed.length,
      shortagesCount: shortages.length,
    },
    activeIncidents: incidents.slice(0, 25),
    allResources: allResources.slice(0, 35),
    availableResources: availableResources.slice(0, 20),
    hospitals: hospitals.slice(0, 12),
    activeAlerts: activeAlerts.slice(0, 15),
    delayedIncidents: delayed,
    resourceShortages: shortages,
    liveSocialAlerts: socialAlerts.slice(0, 10),
  };

  // Deep dive for explicitly queried incidents or resources
  if (incidentMentions.length) {
    try {
      toolResults.incidentDeepDives = await Promise.all(
        incidentMentions.map(({ incidentId }) => tools.getIncidentSituation(incidentId))
      );
    } catch {
      // Ignore fallback
    }
  }

  if (resourceMentions.length) {
    try {
      toolResults.resourceDeepDives = await Promise.all(
        resourceMentions.map(({ resourceId }) => tools.getResource(resourceId))
      );
    } catch {
      // Ignore fallback
    }
  }

  return toolResults;
}

function generateDeterministicCopilotAnswer(toolResults, message = '') {
  const query = message.toLowerCase();
  const references = [];
  const mapActions = [];
  const lines = [];
  const followUps = [];

  const incidents = toolResults.activeIncidents || [];
  const resources = toolResults.availableResources || [];
  const hospitals = toolResults.hospitals || [];
  const social = toolResults.liveSocialAlerts || [];

  if (toolResults.incidentDeepDives?.length) {
    const deep = toolResults.incidentDeepDives[0];
    const inc = deep.incident;
    references.push({ entityId: inc.incidentId, entityType: 'INCIDENT' });
    mapActions.push({ type: 'FOCUS_INCIDENT', entityId: inc.incidentId });
    lines.push(`**Incident Deep-Dive: ${inc.title} (${inc.incidentId})**`);
    lines.push(`• Priority: **${inc.priority}** | Status: **${inc.status}** | Severity: **${inc.severity}/5**`);
    if (inc.hazards?.length) lines.push(`• Reported Hazards: ${inc.hazards.join(', ')}`);
    if (inc.estimatedVictims !== null && inc.estimatedVictims !== undefined) {
      lines.push(`• Estimated Victims: ${inc.estimatedVictims} (Injured: ${inc.estimatedInjured || 0}, Trapped: ${inc.estimatedTrapped || 0})`);
    }
    const asg = deep.assignments || [];
    lines.push(`• Assigned Units: ${asg.length ? asg.map((a) => a.resourceName || a.resourceId).join(', ') : 'None assigned yet'}`);
    if (deep.nearbyResources?.length) {
      const near = deep.nearbyResources.slice(0, 3);
      lines.push(`• Recommended Nearby Units: ${near.map((r) => `${r.name} (${(r.distanceMeters / 1000).toFixed(1)} km)`).join(', ')}`);
    }
    followUps.push(`Show nearest units for ${inc.incidentId}`, `Check hospital capacity for ${inc.incidentId}`, 'Summarize active incidents');
  } else if (/tweet|social|twitter|feed|citizen/.test(query) && social.length) {
    lines.push(`**Live Incoming Social & Twitter Hazard Feeds (${social.length} active)**:`);
    social.slice(0, 4).forEach((s) => {
      lines.push(`• **${s.title}** (${s.location}): "${s.description || s.summary || ''}" [${s.urgency || 'HIGH'}]`);
    });
    followUps.push('Show active incidents', 'Which resources are available?', 'Check hospital capacity');
  } else if (/resource|unit|ambulance|fire|police|drone|truck/.test(query)) {
    lines.push(`**Fleet & Resource Availability (${resources.length} ready for dispatch)**:`);
    resources.slice(0, 6).forEach((r) => {
      references.push({ entityId: r.resourceId, entityType: 'RESOURCE' });
      lines.push(`• **${r.name}** (${r.resourceId}) — ${r.type.replaceAll('_', ' ')} [${(r.capabilities || []).join(', ')}]`);
    });
    mapActions.push({ type: 'SHOW_RESOURCES', entityIds: resources.slice(0, 6).map((r) => r.resourceId) });
    followUps.push('What are the active incidents?', 'Are there any response delays?', 'Check resource shortages');
  } else if (/hospital|bed|icu|casualt|capacity/.test(query)) {
    lines.push(`**Regional Hospital Emergency Capacity**:`);
    hospitals.slice(0, 5).forEach((h) => {
      references.push({ entityId: h.hospitalId, entityType: 'HOSPITAL' });
      lines.push(`• **${h.name}**: ${h.status} — ${h.availableBeds} beds (${h.availableIcuBeds} ICU), Emergency Cap: ${h.availableEmergencyCapacity}`);
    });
    followUps.push('Show active incidents', 'Which resources are available?');
  } else {
    lines.push(`**ResQai Operational Command Overview**:`);
    lines.push(`• **Active Incidents**: ${incidents.length} (${toolResults.summary.delayedIncidentsCount} delayed, ${toolResults.summary.shortagesCount} shortages)`);
    lines.push(`• **Available Units**: ${resources.length} units standing by`);
    lines.push(`• **Live Social Alerts**: ${social.length} hazard reports stream`);
    incidents.slice(0, 3).forEach((inc) => {
      references.push({ entityId: inc.incidentId, entityType: 'INCIDENT' });
      lines.push(`  - **${inc.incidentId}**: ${inc.title} [${inc.priority}]`);
    });
    mapActions.push({ type: 'SHOW_INCIDENTS', entityIds: incidents.slice(0, 5).map((i) => i.incidentId) });
    followUps.push('Show available resources', 'Check delayed incidents', 'Show live social hazard feed');
  }

  return {
    answer: lines.join('\n'),
    references,
    mapActions,
    suggestedFollowUps: followUps.slice(0, 3),
  };
}

export function createCopilotService({ tools = operationalAITools, client = geminiClient } = {}) {
  const sessions = new Map();
  return {
    async query({ message, sessionId }) {
      const id = sessionId ?? randomUUID();
      const history = sessions.get(id) ?? [];
      logger.info({ sessionId: id, messageLength: message.length }, 'ai.copilot.query');
      const toolResults = await retrieve(message, tools);

      if (client.isConfigured()) {
        try {
          const generated = await client.generateStructured(buildCopilotPrompt({ message, history, toolResults }), {
            systemPrompt: COMMAND_COPILOT_SYSTEM_PROMPT,
            responseSchema: COPILOT_RESPONSE_SCHEMA,
          });
          const response = grounded(generated.output, toolResults);
          const nextHistory = [...history, { role: 'user', text: message }, { role: 'assistant', text: response.answer }].slice(-MAX_HISTORY_ITEMS);
          sessions.set(id, nextHistory);
          if (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
          return { available: true, sessionId: id, ...response };
        } catch (error) {
          logger.warn({ err: error, sessionId: id, errorCode: error.code }, 'ai.copilot.gemini_failed_using_fallback');
        }
      }

      // Deterministic copilot fallback grounded in retrieved live data
      const response = generateDeterministicCopilotAnswer(toolResults, message);
      const nextHistory = [...history, { role: 'user', text: message }, { role: 'assistant', text: response.answer }].slice(-MAX_HISTORY_ITEMS);
      sessions.set(id, nextHistory);
      if (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
      return { available: true, sessionId: id, ...response };
    },
  };
}

export const copilotService = createCopilotService();


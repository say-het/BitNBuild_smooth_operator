import { baseEvent, observedLocation } from './helpers.js';

export function generateGovernmentEvent(context) {
  const closed = ['road_closed', 'bridge_closed'].includes(context.timelineEvent.kind);
  return baseEvent(context, 'GOVERNMENT', 'ROAD_UPDATE', observedLocation(context.truth, context.random, 8), {
    roadId: context.timelineEvent.parameters.roadId,
    status: closed ? 'CLOSED' : 'BLOCKED',
    reason: context.timelineEvent.kind,
    authority: 'Synthetic Transport Authority',
  });
}

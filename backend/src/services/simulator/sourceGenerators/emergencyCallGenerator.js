import { baseEvent, observedLocation } from './helpers.js';

const transcripts = {
  fire_call: 'Caller reports fire inside a warehouse, possible workers trapped, and heard a loud pop.',
  flood_call: 'Caller reports fast-rising water around several homes and requests evacuation help.',
  accident_call: 'Caller reports a multi-vehicle collision with several injured occupants and a possible fuel leak.',
  trapped_call: 'Caller reports people trapped after part of a residential building collapsed during shaking.',
};

export function generateEmergencyCallEvent(context) {
  const estimatedVictims = Math.max(1, context.truth.estimatedVictims + context.random.integer(-2, 2));
  return baseEvent(context, 'EMERGENCY_CALL', 'EMERGENCY_CALL', observedLocation(context.truth, context.random, 25), {
    transcript: transcripts[context.timelineEvent.kind] ?? 'Caller reports an emergency and asks for assistance.',
    callerConfidence: context.random.pick(['medium', 'high']),
    urgency: context.truth.severity >= 4 ? 'HIGH' : 'MEDIUM',
    estimatedVictims,
  });
}

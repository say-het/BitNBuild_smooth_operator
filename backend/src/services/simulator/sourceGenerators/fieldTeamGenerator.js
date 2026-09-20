import { baseEvent, observedLocation } from './helpers.js';

const observations = {
  visible_flames: 'Unit reports visible flames and dense smoke from approximately 300 metres.',
  support_requested: 'Team requests additional fire and medical support; access is constrained.',
  fire_spread: 'Fire has spread to an adjacent storage structure.',
  evacuation_needed: 'Field team recommends evacuation of the lowest streets.',
  water_rescue_requested: 'Team requests water-rescue capability for stranded residents.',
  multiple_casualties: 'Responders have located multiple injured occupants.',
  ambulance_requested: 'Additional ambulances requested for casualty transport.',
  trapped_victims: 'Search team reports signs of trapped victims in the collapsed section.',
  separate_damage_confirmed: 'Team confirms a separate damaged residential structure.',
  rescue_requested: 'Heavy rescue and medical support requested for continued search.',
};

export function generateFieldTeamEvent(context) {
  const resourceId = context.resources.find((resource) => resource.status === 'AVAILABLE')?.resourceId ?? 'SYN-FIELD-01';
  return baseEvent(context, 'FIELD_TEAM', 'FIELD_UPDATE', observedLocation(context.truth, context.random, 10), {
    resourceId,
    status: context.timelineEvent.kind.includes('requested') ? 'SUPPORT_REQUESTED' : 'OBSERVING',
    observation: observations[context.timelineEvent.kind] ?? 'Field team submitted an operational update.',
    visibleVictims: Math.max(0, context.truth.estimatedVictims + context.random.integer(-2, 1)),
  });
}

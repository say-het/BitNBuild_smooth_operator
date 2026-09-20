import { baseEvent, observedLocation } from './helpers.js';

const reports = {
  smoke_report: ['There is thick dark smoke near the warehouses.', 'Something is burning in the industrial blocks. I can see heavy smoke.'],
  duplicate_fire_report: ['Large flames are visible near a warehouse.', 'There is a big fire in the industrial area.'],
  victims_reported: ['I think several people may still be inside.', 'People are saying maybe five or more workers are trapped.'],
  flood_report: ['Water is entering homes near the river basin.', 'The street is flooding quickly and people cannot get through.'],
  duplicate_flood_report: ['The low road is under water now.', 'Floodwater is moving across the neighborhood road.'],
  accident_report: ['Several vehicles have crashed on the main boulevard.', 'There has been a serious crash and one vehicle is sideways.'],
  duplicate_accident_report: ['Big collision on Arcway; traffic is completely stuck.', 'I can see damaged cars and injured people near the junction.'],
  collapse_report: ['Part of an apartment block has collapsed after the shaking.', 'A building wall came down and there is a lot of dust.'],
  bridge_damage_report: ['The bridge surface looks cracked and cars have stopped.', 'Something shifted on the bridge during the shaking.'],
  building_damage_report: ['Another residential building has serious cracks.', 'People are leaving a damaged building farther north.'],
};

export function generateCitizenEvent(context) {
  const options = reports[context.timelineEvent.kind] ?? ['Something dangerous is happening nearby.'];
  const estimate = Math.max(1, context.truth.estimatedVictims + context.random.integer(-3, 3));
  return baseEvent(
    context,
    'CITIZEN',
    'EMERGENCY_REPORT',
    observedLocation(context.truth, context.random, context.random.pick([30, 50, 75])),
    { text: context.random.pick(options), estimatedPeopleAffected: estimate, certainty: context.random.pick(['low', 'medium']) },
  );
}

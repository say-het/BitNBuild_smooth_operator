import { baseEvent } from './helpers.js';

export function generateWeatherEvent(context) {
  return baseEvent(context, 'WEATHER', 'WEATHER_UPDATE', context.truth.location, {
    stationId: 'SYN-WX-01',
    condition: context.timelineEvent.kind,
    ...context.timelineEvent.parameters,
  });
}

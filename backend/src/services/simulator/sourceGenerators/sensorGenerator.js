import { baseEvent, observedLocation } from './helpers.js';

export function generateSensorEvent(context) {
  return baseEvent(context, 'SENSOR', 'SENSOR_READING', observedLocation(context.truth, context.random, 5), {
    sensorId: `SYN-${context.scenario}-${context.timelineEvent.kind}`,
    readingType: context.timelineEvent.kind,
    ...context.timelineEvent.parameters,
    quality: 'GOOD',
  });
}

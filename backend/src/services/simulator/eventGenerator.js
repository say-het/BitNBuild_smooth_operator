import { generateCitizenEvent } from './sourceGenerators/citizenGenerator.js';
import { generateEmergencyCallEvent } from './sourceGenerators/emergencyCallGenerator.js';
import { generateFieldTeamEvent } from './sourceGenerators/fieldTeamGenerator.js';
import { generateGovernmentEvent } from './sourceGenerators/governmentGenerator.js';
import { generateHospitalEvent } from './sourceGenerators/hospitalGenerator.js';
import { generateSensorEvent } from './sourceGenerators/sensorGenerator.js';
import { generateWeatherEvent } from './sourceGenerators/weatherGenerator.js';

const generators = {
  CITIZEN: generateCitizenEvent,
  EMERGENCY_CALL: generateEmergencyCallEvent,
  SENSOR: generateSensorEvent,
  FIELD_TEAM: generateFieldTeamEvent,
  HOSPITAL: generateHospitalEvent,
  WEATHER: generateWeatherEvent,
  GOVERNMENT: generateGovernmentEvent,
};

export function generateSourceEvent(context) {
  const generator = generators[context.timelineEvent.source];
  if (!generator) throw new Error(`No synthetic source generator for ${context.timelineEvent.source}`);
  return generator(context);
}

import { baseEvent } from './helpers.js';

export function generateHospitalEvent(context) {
  const hospital = context.hospitals.find((item) => item.status !== 'CLOSED') ?? { hospitalId: 'SYN-HSP-01' };
  const incoming = Math.max(1, context.truth.estimatedVictims + context.random.integer(-2, 1));
  const availableBeds = Math.max(0, Number(hospital.availableBeds ?? 20) - incoming);
  const availableEmergencyCapacity = Math.max(0, Number(hospital.availableEmergencyCapacity ?? 10) - Math.ceil(incoming / 2));
  return baseEvent(context, 'HOSPITAL', 'HOSPITAL_UPDATE', context.truth.location, {
    hospitalId: hospital.hospitalId,
    observation: context.timelineEvent.kind,
    incomingPatients: incoming,
    availableBeds,
    availableEmergencyCapacity,
    status: availableEmergencyCapacity === 0 ? 'OVERLOADED' : 'LIMITED',
  });
}

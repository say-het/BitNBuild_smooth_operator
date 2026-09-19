import { hospitalRepository } from '../repositories/hospitalRepository.js';

export async function listHospitals(_request, response) {
  const hospitals = await hospitalRepository.findAll();
  response.status(200).json({ success: true, data: hospitals, meta: { count: hospitals.length } });
}

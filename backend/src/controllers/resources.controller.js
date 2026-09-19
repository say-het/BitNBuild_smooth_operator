import { resourceRepository } from '../repositories/resourceRepository.js';

export async function listResources(_request, response) {
  const resources = await resourceRepository.findAll();
  response.status(200).json({ success: true, data: resources, meta: { count: resources.length } });
}

import { Router } from 'express';
import {
  findNearbyHospitals,
  findNearbyIncidents,
  findNearbyResources,
  getRoads,
  getRoute,
  getLiveContext,
} from '../controllers/geo.controller.js';

export const geoRouter = Router();

geoRouter.get('/resources/nearby', findNearbyResources);
geoRouter.get('/hospitals/nearby', findNearbyHospitals);
geoRouter.get('/incidents/nearby', findNearbyIncidents);
geoRouter.post('/route', getRoute);
geoRouter.get('/roads', getRoads);
geoRouter.get('/live-context', getLiveContext);

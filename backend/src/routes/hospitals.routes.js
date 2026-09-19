import { Router } from 'express';
import { listHospitals } from '../controllers/hospitals.controller.js';

export const hospitalsRouter = Router();

hospitalsRouter.get('/', listHospitals);

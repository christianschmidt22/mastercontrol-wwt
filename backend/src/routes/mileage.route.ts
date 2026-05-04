import { Router } from 'express';
import { validateQuery } from '../lib/validate.js';
import { MileageReportQuerySchema, type MileageReportQuery } from '../schemas/mileage.schema.js';
import { buildMileageReport } from '../services/mileage.service.js';

export const mileageRouter = Router();

mileageRouter.get('/report', validateQuery(MileageReportQuerySchema), async (req, res, next) => {
  try {
    const query = req.validatedQuery as MileageReportQuery;
    res.json(await buildMileageReport(query.start_date, query.end_date, query.calculate));
  } catch (err) {
    next(err);
  }
});

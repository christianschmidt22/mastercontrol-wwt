import { Router } from 'express';
import { validateBody, validateQuery } from '../lib/validate.js';
import {
  MileageCalculateSchema,
  MileageExportPdfSchema,
  MileageReportQuerySchema,
  type MileageCalculate,
  type MileageExportPdf,
  type MileageReportQuery,
} from '../schemas/mileage.schema.js';
import { HttpError } from '../middleware/errorHandler.js';
import { buildMileageReport, calculateMileageRoute, exportMileagePdf } from '../services/mileage.service.js';

export const mileageRouter = Router();

mileageRouter.get('/report', validateQuery(MileageReportQuerySchema), async (req, res, next) => {
  try {
    const query = req.validatedQuery as MileageReportQuery;
    res.json(await buildMileageReport(query.start_date, query.end_date, query.calculate));
  } catch (err) {
    next(err);
  }
});

mileageRouter.post('/calculate', validateBody(MileageCalculateSchema), async (req, res, next) => {
  try {
    const body = req.validatedBody as MileageCalculate;
    res.json(await calculateMileageRoute(body.from_address, body.to_address));
  } catch (err) {
    next(err);
  }
});

mileageRouter.post('/export-pdf', validateBody(MileageExportPdfSchema), (req, res, next) => {
  try {
    const body = req.validatedBody as MileageExportPdf;
    res.json(exportMileagePdf(body));
  } catch (err) {
    if (err instanceof Error && err.message.includes('mastercontrol_root is not configured')) {
      next(new HttpError(400, err.message));
      return;
    }
    next(err);
  }
});

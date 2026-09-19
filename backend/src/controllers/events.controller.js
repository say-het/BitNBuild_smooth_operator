import { NotFoundError, ValidationError } from '../errors/application-error.js';
import { eventRepository } from '../repositories/eventRepository.js';
import { eventIngestionService } from '../services/events/event-ingestion-service.js';
import { eventListQuerySchema, EVENT_ID_PATTERN } from '../services/events/event-contract.js';
import { presentEvent } from '../services/events/event-presenter.js';
import { z } from 'zod';
import { citizenImageStore } from '../services/uploads/citizen-image-store.js';

const citizenReportSchema = z.object({
  description: z.string().trim().min(5).max(2_000),
  latitude: z.string().trim().optional(),
  longitude: z.string().trim().optional(),
  contactReference: z.string().trim().max(128).optional(),
}).strict().superRefine((value, context) => {
  if (Boolean(value.latitude) !== Boolean(value.longitude)) context.addIssue({ code: 'custom', path: ['latitude'], message: 'Latitude and longitude must be provided together' });
  if (value.latitude && (!Number.isFinite(Number(value.latitude)) || Number(value.latitude) < -90 || Number(value.latitude) > 90)) context.addIssue({ code: 'custom', path: ['latitude'], message: 'Invalid latitude' });
  if (value.longitude && (!Number.isFinite(Number(value.longitude)) || Number(value.longitude) < -180 || Number(value.longitude) > 180)) context.addIssue({ code: 'custom', path: ['longitude'], message: 'Invalid longitude' });
});

function validationDetails(error) {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

export async function ingestEvent(request, response) {
  const result = await eventIngestionService.ingest(request.body);
  response.status(result.created ? 201 : 200).json({
    success: true,
    data: {
      eventId: result.event.eventId,
      status: result.event.processingStatus,
      duplicate: result.duplicate,
    },
  });
}

export async function submitCitizenReport(request, response) {
  const parsed = citizenReportSchema.safeParse(request.body);
  if (!parsed.success) {
    await citizenImageStore.remove(request.file && { storageKey: request.file.filename });
    throw new ValidationError('Invalid citizen report', validationDetails(parsed.error));
  }
  let image;
  try {
    image = await citizenImageStore.descriptor(request.file);
    const input = {
      source: 'CITIZEN',
      eventType: 'EMERGENCY_REPORT',
      payload: { text: parsed.data.description, ...(image ? { image } : {}) },
      ...(parsed.data.latitude ? { location: { lat: Number(parsed.data.latitude), lng: Number(parsed.data.longitude) } } : {}),
      metadata: {
        submissionChannel: 'CITIZEN_WEB',
        ...(parsed.data.contactReference ? { contactReference: parsed.data.contactReference } : {}),
      },
    };
    const result = await eventIngestionService.ingest(input);
    response.status(result.created ? 201 : 200).json({
      success: true,
      data: { eventId: result.event.eventId, status: result.event.processingStatus, duplicate: result.duplicate },
    });
  } catch (error) {
    await citizenImageStore.remove(image ?? (request.file && { storageKey: request.file.filename }));
    throw error;
  }
}

export async function getEventStatus(request, response) {
  if (!EVENT_ID_PATTERN.test(request.params.eventId)) throw new ValidationError('Invalid event ID');
  const event = await eventRepository.findStatusByEventId(request.params.eventId);
  if (!event) throw new NotFoundError('Event not found');
  const incident = event.incidents[0]?.incident ?? null;
  response.status(200).json({
    success: true,
    data: {
      eventId: event.eventId,
      status: event.processingStatus,
      errorCode: event.processingError,
      updatedAt: event.updatedAt,
      incident,
    },
  });
}

export async function getEvent(request, response) {
  if (!EVENT_ID_PATTERN.test(request.params.eventId)) {
    throw new ValidationError('Invalid event ID', [
      { path: 'eventId', message: 'Invalid eventId format' },
    ]);
  }
  const event = await eventRepository.findByEventId(request.params.eventId);
  if (!event) throw new NotFoundError('Event not found');
  response.status(200).json({ success: true, data: presentEvent(event) });
}

export async function listEvents(request, response) {
  const parsed = eventListQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    throw new ValidationError('Invalid event query', validationDetails(parsed.error));
  }
  const query = {
    ...parsed.data,
    from: parsed.data.from ? new Date(parsed.data.from) : undefined,
    to: parsed.data.to ? new Date(parsed.data.to) : undefined,
  };
  const { events, total } = await eventRepository.findMany(query);
  response.status(200).json({
    success: true,
    data: events.map(presentEvent),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  });
}

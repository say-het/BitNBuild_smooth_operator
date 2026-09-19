export function presentEvent(event) {
  const hasLocation = event.latitude !== null && event.longitude !== null;
  return {
    eventId: event.eventId,
    source: event.source,
    eventType: event.eventType,
    timestamp: event.timestamp.toISOString(),
    receivedAt: event.receivedAt.toISOString(),
    ...(hasLocation
      ? {
          location: {
            lat: Number(event.latitude),
            lng: Number(event.longitude),
            ...(event.locationAccuracyMeters === null
              ? {}
              : { accuracyMeters: event.locationAccuracyMeters }),
          },
        }
      : {}),
    payload: event.payload,
    metadata: event.metadata ?? {},
    processingStatus: event.processingStatus,
    processingError: event.processingError,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

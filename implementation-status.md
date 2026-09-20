# ResQai Implementation Status

## Current Milestone

Prompt 16 — Full End-to-End Integration, Demo Flow & Final Hardening — complete for the local demo build.

## Implemented

- [x] React/Vite frontend and Express/Socket.IO modular-monolith foundation
- [x] PostgreSQL/PostGIS, Prisma repositories, migrations, and deterministic seed
- [x] Canonical event ingestion, source adapters, validation, and idempotency
- [x] Deterministic synthetic emergency world and simulation controls
- [x] Gemini Incident Intelligence and deterministic sensor interpretation
- [x] Deterministic correlation, deduplication, incident aggregation, and audited state transitions
- [x] Geospatial discovery, OSRM routing, ETA normalization, and fallback estimates
- [x] Resource intelligence, explainable scoring, OR-Tools recommendations, and deterministic fallback
- [x] Response orchestration, assignment execution, lifecycle coordination, and realtime updates
- [x] Monitoring, SLA evaluation, alert lifecycle, and escalation recommendations
- [x] Realtime delivery hardening, domain-event bridge, rooms, reconnect contract, and optional Redis fan-out
- [x] Command center foundation, live MapLibre layers, entity details, and operational summaries
- [x] Incident, resource, assignment, reassignment, and alert operator workflows
- [x] Grounded Situation Analyst, read-only Command Copilot, map actions, and in-app notifications
- [x] Operational analytics, multimodal citizen reporting, and synthetic simulator evaluation
- [x] Full end-to-end integration, operator demo flow, scoped reset, and local demo hardening
- [ ] Production authentication, deployment, observability, backup, and rollback operations

## End-to-End Demo Integration

- The Command Center now owns compact scenario/speed controls for start, pause, resume, step, stop, immediate monitoring, and scoped reset. It displays persisted run state, simulated time, emitted-event count, and the latest signal.
- The primary industrial-fire flow remains evidence-driven: synthetic sources use canonical ingestion, Incident Intelligence and deterministic correlation create the operational incident, and operators explicitly advance assessment, confirm the resource plan, assign units, move assignments, begin resolution, and resolve.
- The incident drawer now exposes the missing valid operator transitions `CREATED → ASSESSING → RESOURCE_RECOMMENDED` and `ON_SCENE → RESOLVING`; assignment and resolution remain under the existing audited services.
- Optimizer result/provider state and route provider/estimated state are visible. OR-Tools, routing, and Gemini failures preserve core operations through the existing greedy, geodesic, and unavailable-advisory fallbacks.
- The live map adds current synthetic road state plus a toggleable incident hotspot layer. `ROAD_UPDATE` remains normal evidence; blocked roads are warnings and do not claim to alter the public OSRM graph.
- Simulation lifecycle/event/reset notifications share the central realtime bridge. Command Center snapshots reconcile after emitted events, reset, and socket reconnect.
- `POST /api/v1/simulations/:runId/reset` stops scheduling, waits for the active ingestion tick, blocks while intelligence work is non-terminal or evidence is mixed with non-demo incidents, and then transactionally clears only run-owned operational data. Involved resources are restored from the run snapshot; truth/configuration/users remain untouched.
- Reassignment realtime records now carry replacement metadata so the notification center can label reassignment accurately.
- `.env.example` was audited against runtime reads; the unused backend `MAP_STYLE_URL` was removed while browser `VITE_MAP_STYLE_URL` remains authoritative. Root scripts now include optional optimizer and full-stack startup commands.

## Operational Analytics

- `GET /api/v1/analytics/overview` returns one compact backend-computed snapshot for incidents, response timing, resources, alerts/SLA/escalations, hospital capacity, trends, and map-ready hotspots. Frontend components do not recalculate domain metrics.
- Response metrics use persisted timestamps only: incident-to-assignment, assignment-to-en-route, en-route-to-arrival, incident-to-first-arrival, critical first arrival, and resolution duration. Missing timestamps are excluded and every summary includes its sample size.
- Resource utilization reports status totals and per-type busy percentages using `ASSIGNED`, `EN_ROUTE`, and `ON_SCENE` as busy states. Hospital totals preserve current availability/capacity fields.
- Hotspots are grouped in PostgreSQL with PostGIS `ST_SnapToGrid` and returned as GeoJSON with incident count and severity weight. The Analytics page uses the existing MapLibre stack for a heatmap/point layer.
- `/analytics` shows four operator KPIs plus Recharts type, severity, response-time trend, and resource-utilization charts with a deliberately restrained command-center visual style.

## Multimodal Citizen Reporting

- `/report` accepts a required description, optional manual/browser-permitted location, optional 4 MB JPEG/PNG/WEBP, and an optional reference. Browser geolocation is explicit and never required.
- `POST /api/v1/events/citizen-report` uses Multer disk storage with random filenames, MIME allowlisting, file-size/field limits, and image magic-byte validation. The API never returns a filesystem path and logs no image content.
- The controller creates a normal `CITIZEN` `EMERGENCY_REPORT`; canonical normalization, validation, persistence, `EVENT_RECEIVED`, Incident Intelligence, deterministic correlation, and incident creation remain unchanged and authoritative.
- Gemini receives text/location plus inline image data through the existing client and returns the unchanged Incident Intelligence schema. The prompt restricts visual claims to observable evidence, requires uncertainty, and prohibits exact victim counts, chemical identity, or diagnosis from imagery.
- Temporary image files are removed after intelligence processing. `GET /api/v1/events/:eventId/status` exposes only processing state and a resulting public incident projection for safe report tracking.

## Synthetic Simulation Evaluation

- `GET /api/v1/simulations/:runId/evaluation` is the only evaluation/truth comparison route. It reconstructs event-to-truth ownership from the seeded scenario timeline and deterministic event sequence inside the simulator boundary; hidden truth IDs are never added to ordinary events or incident APIs.
- Evaluation matches each truth incident to the detected incident receiving most of its linked observations. It reports detection match rate, classification accuracy/by-type counts, severity difference, priority accuracy, median/average geodesic location error, simulated detection delay, required-capability coverage, and actual first-response timing where assignments arrived.
- Correlation precision, recall, F1, correct merges, incorrect merges, and missed merges are pairwise metrics over linked synthetic observations. Unlinked counts remain visible separately and are not silently treated as successful clustering.
- The Analytics page has a clearly labeled **Synthetic Benchmark** section, can start a seeded 20× scenario, follows its status, and refreshes evaluation while events are processed.
- No optimizer baseline comparison is shown because the current system does not preserve both greedy and optimized decisions against the same immutable scenario state; making a comparative performance claim would be unsupported.

## Situation Analyst

- A controlled read-only AI tool facade wraps the existing incident, event, resource, assignment, hospital, geo, alert, and monitoring-facing services/repositories. Gemini code does not query Prisma and cannot access mutation services.
- Incident situation context includes a concise source-event projection, current incident assessment, assignments/resource state/ETA, active alerts and escalation state, nearby eligible resources, nearby hospital capacity, and relevant shortage alerts.
- `POST /api/v1/incidents/:incidentId/analysis` generates or refreshes strict structured output; `GET /api/v1/incidents/:incidentId/analysis` reads the process-local cache without consuming Gemini. The response includes generation/model/source-state timestamps and a deterministic stale flag.
- The grounding prompt prohibits invented resources, casualties, capacity, and IDs; unknown evidence remains null/empty. Output permits only five controlled review-action types and never exposes chain-of-thought or operational mutations.
- Incident detail shows summary, current response, risks, resource gaps, hospital considerations, recommendations, confidence, age, and staleness. Analysis is only generated by an explicit operator action and fails to a clean unavailable state.

## Command Copilot

- `POST /api/v1/copilot/query` accepts a bounded 500-character message and optional UUID session. A deterministic read-only retrieval planner selects minimal operational tool results for incident detail, urgency, delays, availability, shortages, hospitals/capacity, nearby incidents, or the compact current summary.
- Gemini returns a strict answer/reference/map-action/follow-up contract. References and action IDs absent from the retrieved live tool result are removed; malformed output fails closed.
- Session history is process-local, capped at six messages and fifty sessions. Queries are explicit user actions and reuse the existing Gemini timeout and bounded retry policy.
- The compact right-side Copilot panel keeps the map primary. Safe actions can focus an incident/resource/hospital, highlight incident/resource sets, or select an incident route. They never execute JavaScript or call operational write APIs.

## Notifications

- In-app notifications are presentation records derived from authoritative active alerts plus compact critical-incident and assignment realtime events. No competing notification database/domain model was introduced.
- The notification center shows unread count, persists read IDs locally, supports mark-read, and navigates to the affected incident/resource. New backend monitoring alerts log safe `notification.created` metadata.
- Browser notification permission is requested only from an explicit button. When granted, only `HIGH`/`CRITICAL` realtime notifications are shown; in-app delivery remains the fallback.
- External SMS/email/push providers remain intentionally unimplemented.

## Operational UI Workflows

- Incident selection now loads the consolidated detail, linked source-event timeline, assignment history, and resource recommendation plan concurrently. The drawer groups operational summary, location, casualties, hazards, required capabilities, concise AI assessment, recommendations, assignments, alerts, timeline, and consequential actions without displaying raw prompts or hidden simulator truth.
- Recommendation cards expose resource identity/type/capabilities, ETA, distance, score, and deterministic reason factors. Operators can select one or many candidates, see required-capability coverage, confirm, and submit through the existing single or bulk orchestration endpoints. State changes occur only after a successful response.
- Active assignment cards show stored routes, ETA, provider/fallback state, lifecycle timestamps, only backend-valid next-state controls, cancellation, and available reassignment alternatives with current-versus-new ETA. Reassignment uses the existing orchestrator and preserves the prior assignment record.
- Incident resolution is available only from `RESOLVING`. Incident cancellation now uses one transactional response-orchestrator path that cancels active assignments, releases resources, audits all changes, and emits the normal domain/realtime events.

## Resource and Alert Operations

- The resource directory supports ID/name search and type, status, and capability filters. It shows capabilities, current public incident ID, stored ETA, and coordinates selection with the map/resource drawer. Resource detail includes active assignment, incident navigation, and assignment history.
- The alert workflow separates active and history views, filters severity/type/status, and exposes acknowledge/resolve controls with confirmation where consequential. Incident-linked alerts focus the incident/map.
- Escalation metadata is shown as a concise reason and validated recommended-action list. The UI offers review rather than direct AI execution; operators must use deterministic assignment/reassignment controls.
- Operator mutations share loading state and success/error notifications. Action functions are centralized in `CommandCenterProvider`, providing a future role-policy boundary rather than embedding authorization decisions throughout presentation components.

## Prompt 13 Backend Support

- `POST /api/v1/incidents/:incidentId/cancel` performs transactional cancellation through `responseOrchestrator`; it does not use the generic state endpoint and therefore cannot strand active resources.
- `GET /api/v1/resources` now includes each resource's public current incident and compact active-assignment ETA projection for the directory.
- `POST /api/v1/optimization/recommend` now returns its already-calculated, scored eligible `candidates` alongside the chosen plan so reassignment comparisons do not duplicate scoring in the browser.

## Command Center

- The React landing screen is now a responsive emergency operations dashboard with operational/realtime status, current time, five data-backed KPIs, a filterable incident queue, dominant live map, entity drawer, and resource/alert/hospital summaries.
- Initial state loads concurrently from `GET /api/v1/incidents`, `/resources`, `/hospitals`, and `/alerts`. The reducer-backed store normalizes every domain by public ID and keeps selected entity and layer filters separate from server state.
- Incident filters cover priority, type, and status; sorting covers priority, severity, newest, and oldest. Selection centers the map, opens the detail drawer, joins the entity room, and loads route-bearing assignment history from the existing incident/resource assignment endpoint.
- Loading, API failure with retry, empty queues/panels, map failure, and realtime live/reconnecting/offline states are visible without erasing the last usable snapshot.

## Live Operational Map

- MapLibre uses `VITE_MAP_STYLE_URL` and GeoJSON sources/layers rather than one React marker per entity. It supports normal zoom/pan/navigation, initial entity bounds, click selection, and layer controls for incidents, resources, hospitals, and routes.
- Incident markers encode priority with label, size, and color. Resource markers encode operational status and resource-type letter; `resource.location_updated` moves the feature incrementally. Hospital markers expose concise real capacity popups.
- Selecting an incident displays every active stored normalized assignment route available for it. Selecting a resource highlights its active route. Route summaries show ETA, distance, provider, and fallback/estimated state without parsing OSRM payloads.

## Frontend Realtime Integration

- The command center subscribes to the Prompt 11 `operations` and `alerts` rooms plus the selected incident/resource room.
- Integrated events are `incident.created|updated|state_changed|resolved|escalated`, `resource.updated|location_updated|assigned|released`, `assignment.created|updated|cancelled`, `alert.created|updated|resolved`, and `hospital.updated`. They merge into normalized state without full-dashboard refetches. On reconnect, room subscriptions restore and one REST reconciliation reloads authoritative state.
- Incident and resource drawers expose only operational fields: status, severity, confidence, casualty estimates, hazards, capabilities, source count, current assignments, ETA, location, and active alerts. No raw AI prompts, chain-of-thought, event payloads, or hidden simulator truth are shown.

## Monitoring Engine

- One configurable in-process scheduler starts after PostgreSQL connects, stops during graceful shutdown, and prevents overlapping cycles. Manual runs use the same lock and service path.
- Each cycle loads active incidents with active assignments, evaluates deterministic incident/assignment rules, reuses Resource Intelligence for shortages and eligible alternatives, checks hospital capacity, reconciles alerts, and invokes escalation analysis only for newly detected high-impact conditions.
- Failures in resource intelligence, routing/optimizer fallback, hospital evaluation, or Gemini cannot erase unrelated alerts or crash the backend. Failed sub-evaluations create a `SYSTEM` condition and preserve alerts from that rule family until it can be evaluated again.
- `GET /api/v1/monitoring/status` exposes enabled/running state, interval, last run time/duration/summary, and a safe last-error code. `POST /api/v1/monitoring/run` performs one development/admin cycle.

## Synthetic SLA and Monitoring Rules

- Configurable demo arrival targets are `P0=10`, `P1=20`, `P2=35`, and `P3=60` minutes by default. They are explicitly synthetic demonstration values, not government, dispatch, or medical standards.
- Rules detect stored ETA beyond priority SLA, assignments not accepted in time, en-route units past ETA plus grace, unavailable assigned resources, and incidents stalled in `ASSESSING`, `RESOURCE_RECOMMENDED`, `RESOURCE_ASSIGNED`, or `ON_SCENE`.
- Resource shortage evaluation reuses Prompt 08 Resource Intelligence and counts currently assigned capable resources before declaring uncovered demand.
- Hospital rules detect explicit `OVERLOADED` state and configurable low ICU/emergency-capacity percentages. Hospital thresholds are also synthetic/demo values.
- Multiple simultaneous problems for one incident create a deterministic escalation condition.

## Alerts

- Existing alert types and lifecycle are now operational: `ACTIVE → ACKNOWLEDGED → RESOLVED`; `DISMISSED` remains schema-supported for future policy/UI use.
- A controlled public severity taxonomy maps `INFO`, `WARNING`, `HIGH`, and `CRITICAL` to the existing bounded integer storage field.
- Monitoring alerts carry a deterministic deduplication key. A PostgreSQL partial unique index permits only one active/acknowledged alert per key, while allowing a cleared condition to alert again later.
- Existing alerts are refreshed instead of duplicated. Conditions absent from a successful evaluation are automatically resolved; acknowledgement does not suppress condition tracking.
- Alert creation, acknowledgement, resolution, escalation requests/results, and rejected recommendations are audited.

## Escalation Agent

- Deterministic rules decide whether escalation analysis is warranted; routine warnings do not call Gemini.
- The focused Gemini agent receives structured incident, assignment, alert, eligible-alternative, route-condition, and shortage data and returns strict JSON with urgency, concise reason, and up to five controlled actions.
- The model cannot mutate state. Resource recommendations are accepted only when the resource still exists, is `AVAILABLE`, has no current incident, covers a required capability, and appears in the current ETA-ranked eligible alternatives.
- Invalid actions and malformed/unavailable AI responses fail safely and are audited. Deterministic alerts remain active even when Gemini is unavailable.
- Validated output is recommendation-only. Any later assignment/reassignment must still pass the Prompt 09 orchestrator's transaction and concurrency checks.

## Alert and Monitoring APIs

- `GET /api/v1/alerts`
- `GET /api/v1/alerts/:alertId`
- `PATCH /api/v1/alerts/:alertId/acknowledge`
- `PATCH /api/v1/alerts/:alertId/resolve`
- `POST /api/v1/monitoring/run`
- `GET /api/v1/monitoring/status`

## Monitoring Realtime Events

- `alert.created`, `alert.updated`, and `alert.resolved` carry the existing versioned safe envelope.
- `incident.escalated` contains only incident/alert IDs, urgency, concise reason, validated actions, and `recommendationOnly: true`; hidden model reasoning and raw operational payloads are never broadcast.

## Response Orchestration

- `responseOrchestrator` is the single application-service boundary for assignment creation, bulk assignment, status changes, cancellation, reassignment, and explicit incident resolution. Controllers validate transport input and do not mutate operational state directly.
- Assignment creation calculates the route through the existing routing service, then uses one PostgreSQL transaction to reload the incident, conditionally claim every resource, create assignment history, advance `RESOURCE_RECOMMENDED → RESOURCE_ASSIGNED`, and append audits. Any failure rolls back the whole bulk operation.
- A resource claim is an atomic conditional `UPDATE ... WHERE status = AVAILABLE AND current_incident_id IS NULL`; concurrent requests therefore cannot both claim it. A partial unique index on active assignment statuses is a second database invariant against more than one active assignment per resource.
- Route distance, travel seconds, estimated arrival, provider, geometry, degraded-estimate marker/basis, and road-impact metadata are preserved on each assignment.
- Assignment origin is controlled by `MANUAL`, `OPTIMIZER`, `ESCALATION`, and `SYSTEM`; roles and reasons remain auditable operator inputs.

## Assignment and Incident Lifecycle

- Valid assignment progression is `ASSIGNED → ACCEPTED → EN_ROUTE → ON_SCENE → COMPLETED`, with cancellation or reassignment from non-terminal states. Existing schema status `REASSIGNED` preserves replacement history; no conflicting `FAILED` status was added.
- One centralized mapping drives resource state: assigned/accepted remain `ASSIGNED`, then `EN_ROUTE`, `ON_SCENE`, and back to `AVAILABLE` on completion, cancellation, or reassignment.
- Assignment movement advances incidents to `EN_ROUTE` and `ON_SCENE` through the existing audited incident state service. Completing one assignment never resolves the incident.
- Explicit resolution is allowed only from `RESOLVING`; it marks remaining active assignments complete, releases their resources, records audits, and transitions the incident to `RESOLVED` with its resolution timestamp.
- Reassignment closes the old record as `REASSIGNED`, releases the old resource, atomically claims the replacement, and creates a new assignment linked through metadata. No assignment history is overwritten.

## Realtime and Operational Events

- Committed domain changes publish once through the in-process bus. One explicit bridge maps incident, resource, assignment, alert, hospital, simulation, and system events to the client taxonomy; domain services no longer also emit directly.
- Every message carries `event`, `timestamp`, `entityType`, `entityId`, `data`, `version`, a process-local `sequence`, and safe source/instance/correlation metadata. Compatibility `eventId` and `aggregateId` fields remain available.
- Supported rooms are `operations`, `alerts`, `incident:<id>`, `resource:<id>`, and `simulation:<id>`. Acknowledged subscribe/unsubscribe requests reject all other names.
- Resource location updates validate WGS84 coordinates, persist and audit transactionally, then publish a compact latest-position event. Per-resource throttling/coalescing prevents location bursts from flooding clients.
- Optional Redis adapter fan-out is controlled by `REALTIME_REDIS_ENABLED`. Redis startup failure falls back to single-instance in-memory delivery; runtime errors surface as degraded status rather than crashing the API.
- `GET /api/v1/realtime/status` reports safe transport status. The React application owns one socket singleton through `RealtimeProvider` and `useRealtime`; room subscriptions are restored on reconnect and `reconnectVersion` signals consumers to reload REST state.

## Orchestration APIs

- `POST /api/v1/incidents/:incidentId/assignments`
- `POST /api/v1/incidents/:incidentId/assignments/bulk`
- `GET /api/v1/incidents/:incidentId/assignments`
- `GET /api/v1/assignments/:assignmentId`
- `PATCH /api/v1/assignments/:assignmentId/status`
- `POST /api/v1/assignments/:assignmentId/cancel`
- `POST /api/v1/assignments/:assignmentId/reassign`
- `GET /api/v1/resources/:resourceId/assignments`
- `PATCH /api/v1/resources/:resourceId/location`
- `POST /api/v1/incidents/:incidentId/resolve`

## Resource Intelligence

- Recommendation requests load persisted incidents and capability quantities, then use the existing PostGIS discovery and routing services.
- Candidates must be `AVAILABLE`, have no active assignment, have positive usable capacity, and match at least one required capability.
- Centralized scoring weights cover capability match, ETA, distance, capacity, availability, workload, and incident priority. Every recommendation includes deterministic score factors and concise reasons.
- Multi-resource coverage is supported: one incident can receive separate fire, medical, rescue, or hazmat recommendations, with covered and uncovered capabilities reported explicitly.
- Shortages report required and available counts per incident/capability. No-resource cases return a valid partial plan.

## Optimization

- A minimal Python sidecar uses Google OR-Tools CP-SAT and never queries PostgreSQL.
- Node supplies normalized incidents, eligible resources, and incident/resource candidates with ETA and score.
- Constraints enforce resource exclusivity, capability compatibility, eligibility, and capability coverage quantities.
- The documented objective minimizes priority-weighted response time, suitability/mismatch/resource-use costs, and heavily penalized uncovered capabilities.
- `OPTIMAL`, `FEASIBLE`, `PARTIAL`, `INFEASIBLE`, and `FAILED` are normalized result states.
- If the sidecar times out, fails, or returns malformed output, a deterministic priority/capability/ETA greedy plan is returned as `FALLBACK_GREEDY`.
- Recommendations are read-only. No `ResourceAssignment` is created and no resource or incident state is mutated.

## Optimization API

- `POST /api/v1/optimization/recommend` accepts one to twenty unique incident IDs.

## Existing Geospatial Intelligence

- PostGIS performs radius filtering and distance ordering for resources, hospitals, and active incidents; result sets are not fetched and filtered in application memory.
- Resource discovery defaults to `AVAILABLE` and supports resource-type and all-required-capability filters.
- Hospital discovery supports operational-only filtering and returns current bed, ICU, and emergency capacity.
- `geoService.findCandidateResources()` provides the internal discovery contract for Prompt 08 without exposing PostGIS details.

## Routing and ETA

- OSRM route responses are normalized to stable route IDs, GeoJSON geometry, distance, duration, rounded-up ETA minutes, provider, estimate basis, and road-impact status.
- Multi-resource ranking uses the OSRM table endpoint in one request and falls back to concurrent individual estimates when the matrix is unavailable.
- Timeouts, HTTP failures, no-route responses, and malformed payloads degrade to a straight-line geodesic distance and configurable assumed-speed estimate.
- Route results use a short in-process TTL cache keyed by rounded endpoints, profile, and the current road-state version.
- Synthetic `ROAD_UPDATE` events provide `OPEN`, `CONGESTED`, `BLOCKED`, or `CLOSED` state. Known blocked/closed synthetic road segments can mark route geometry as potentially impacted; OSRM is not dynamically rerouted.

## Geo APIs

- `GET /api/v1/geo/resources/nearby`
- `GET /api/v1/geo/hospitals/nearby`
- `GET /api/v1/geo/incidents/nearby`
- `POST /api/v1/geo/route`

## Existing Incident Correlation

- Every completed candidate is passed to a deterministic correlation service; Gemini is not used for duplicate detection.
- Central configuration controls a 5 km spatial window, 30-minute time window, signal weights, and match thresholds.
- Explainable scoring combines PostGIS distance, time, incident-type compatibility, deterministic text similarity, and hazard/capability overlap.
- New evidence is classified as `PRIMARY_SIGNAL`, `DUPLICATE`, `CORROBORATING_SIGNAL`, `FIELD_UPDATE`, or `SUPPORTING_SIGNAL`.
- A stable incident ID is derived from the first canonical event. Candidate correlation state and metadata are persisted for auditing.
- Reprocessing a candidate or an already-linked event returns the existing incident without creating duplicate rows.

## Incident Aggregation and State

- Corroborating evidence can raise severity, priority, confidence, casualty estimates, hazards, and required capabilities; it does not overwrite stronger known information with weaker values.
- State changes follow an explicit transition map from `CREATED` through assessment, assignment, response, escalation/reoptimization, resolution, or cancellation.
- Each accepted transition updates the incident and writes an `INCIDENT_STATE_CHANGED` audit record in one transaction.
- Invalid transitions return `409 INVALID_INCIDENT_TRANSITION` and leave state unchanged.

## Database and APIs

- Migration `20260919150000_incident_correlation` adds candidate correlation status/linkage/metadata and incident-event correlation score/metadata.
- Migration `20260919160000_response_orchestration` adds assignment origin/role and the active-resource partial unique index. It is checked in but was not applied in this session because the local Docker daemon was unavailable.
- Migration `20260919170000_monitoring_alert_dedup` adds alert deduplication keys and the partial unique active-alert index. It is checked in but was not applied because the local Docker daemon remained unavailable.
- Implemented `GET /api/v1/incidents`, `GET /api/v1/incidents/:incidentId`, `GET /api/v1/incidents/:incidentId/events`, and `POST /api/v1/incidents/:incidentId/transition`.
- The event timeline exposes relationship type and explainable score metadata without hidden AI reasoning.

## Verification

- 63 Node tests are discovered. All 56 environment-independent tests pass; seven database-gated suites require `RUN_DATABASE_TESTS=true` and a live PostGIS instance.
- Three Python tests pass against the actual OR-Tools CP-SAT package, covering multi-capability allocation, exclusivity/priority under scarcity, and partial incompatible plans.
- The optimizer sidecar health endpoint was verified over its real local HTTP server.
- Prompt 09 coverage includes the transition/resource mapping contract and Socket.IO envelope on every run. The database-gated orchestration suite covers assignment validation, route/ETA persistence, concurrent claims, lifecycle coordination, reassignment history, cancellation, resolution, audit entries, location updates, APIs, and emitted events.
- Seeded PostGIS integration coverage is present but could not be executed in the current session because the local Docker daemon was unavailable.
- Lint and the production frontend build pass.
- Prompt 10 explicitly prohibited adding or running testing work. No tests were added or executed; Prisma generation/validation and lint were used as implementation checks.
- Prompt 11 also prohibited testing work. No tests were added or run; backend/frontend lint, backend syntax checking, and the production frontend build were used as static verification.
- Prompt 12 prohibited testing work. No tests were added or run; frontend lint and the production build were used as static verification.
- Prompt 13 explicitly prohibited testing work. No tests were added or run; workspace lint, JavaScript syntax checking, and the frontend production build were used as static verification.
- Prompt 14 explicitly prohibited testing work. No tests were added, changed, or run; workspace lint, focused backend syntax checking, diff whitespace validation, and the frontend production build were used as static verification.
- Prompt 15 explicitly prohibited testing work. No tests were added, changed, or run; workspace lint, complete backend JavaScript syntax checking, and the frontend production build were used as static verification.
- Prompt 16 explicitly prohibited testing work. No tests were added, changed, or run; workspace lint, backend JavaScript syntax checking, Prisma schema validation, diff whitespace validation, and the frontend production build were used as static verification.

## Known Issues and Deferred Work

- `EVENT_RECEIVED` and asynchronous intelligence remain process-local and non-durable; recovery/outbox work is deferred.
- Live Gemini analysis requires local `GEMINI_API_KEY` and `GEMINI_MODEL` configuration.
- Situation-analysis and Copilot session caches are process-local and reset on backend restart; analysis persistence and distributed session storage are deferred.
- Copilot retrieval is a bounded deterministic intent router rather than unrestricted provider-native function calling. It covers the current demo query families and fails safely for unsupported questions.
- Notification read state is browser-local and not synchronized across operators/devices. Notifications derive from alerts/realtime events and do not yet have a durable inbox or replay history.
- Analytics aggregates the full current demo dataset in one request; time-range filters, materialized aggregates, and pagination are deferred until dataset scale requires them.
- Citizen images use process-local temporary disk and are deleted after the asynchronous intelligence attempt. Multi-instance shared object storage, malware scanning, orphan cleanup after a process crash, retention policy, and authenticated report access remain hardening work.
- Evaluation reconstructs observation ownership from the deterministic current scenario definitions. Changing a scenario definition after a historical run would require versioned scenario manifests for stable reevaluation.
- Synthetic correlation metrics cover linked observations; non-incident weather/hospital/road observations and unlinked signals are reported but excluded from pairwise precision/recall.
- No nearest-resource-versus-optimizer baseline is emitted because both strategies are not yet captured from the same immutable run snapshot.
- The current semantic signal is deterministic token similarity; embeddings may be added later behind the scorer without changing correlation authority.
- Authentication/authorization remains deferred. Alert workflows are implemented, but the manual monitoring and advisory AI endpoints are not yet role-protected and remain development/operator-demo oriented.
- Road closures currently annotate matching synthetic route geometry; they do not modify OSRM's graph or guarantee alternate routing.
- Route caching is process-local and is cleared on restart; Redis can replace it when shared caching is needed.
- Fallback ETA uses geodesic distance and an assumed speed. It is explicitly estimated and is not a navigable route or live-traffic prediction.
- The optimizer sidecar must be deployed and supervised separately; Node falls back safely when it is unavailable.
- Existing resource capacity JSON is heterogeneous. It contributes to suitability and zero capacity excludes a candidate; capability quantities remain unit-based until typed per-resource capacity semantics are introduced.
- Recommendations remain unreserved until the orchestrator conditionally claims the resource. A stale recommendation returns `409 RESOURCE_NOT_AVAILABLE` without a partial assignment.
- Internal domain events remain process-local and non-durable; an outbox/replay log remains deferred. Redis scales Socket.IO fan-out only and does not make domain events durable.
- Realtime sequence values and location throttles are per backend instance. Clients must refetch authoritative REST state after reconnect and must not treat sequence as a cross-replica global order.
- Socket identity metadata is only an authentication-ready boundary; authentication, authorization, and room access policy remain deferred.
- Route calculation occurs before the database transaction to avoid holding locks during an external OSRM request. Resource and incident eligibility are revalidated inside the transaction, so a stale route can never bypass assignment concurrency controls.
- Monitoring uses stored assignment ETA/route metadata; it does not continuously poll OSRM or detect material route-duration changes yet.
- The scheduler lock is process-local. Multiple backend replicas could run duplicate cycles, although the partial unique alert index prevents duplicate active alerts. Distributed scheduling/leases belong to operational hardening.
- Hospital records are not yet linked as assignment destinations, so hospital overload creates facility alerts but cannot identify or escalate a specific affected incident.
- A failed escalation-provider call does not remove its deterministic alert; automatic AI retry/backoff beyond the next new trigger is deferred.
- MapLibre and Recharts are currently included in the shared Vite bundle, producing a large initial JavaScript chunk. Route-level lazy loading remains deferred.
- Assignment routes are loaded on entity selection rather than in the initial snapshot. An assignment created while an unselected entity is off-screen has compact realtime state but gains full geometry when that entity is selected.
- Sensor overlays, risk zones, operational clustering, geofences, authentication, and tiny-mobile field UX remain deferred. Synthetic road-state and Command Center hotspot overlays are implemented.
- Authentication is still deferred. Operational controls are grouped behind provider actions but are not yet hidden or authorized by role.
- Recommendation refresh calls routing/optimization when an incident drawer opens; caching/debouncing beyond the current backend route cache is deferred.
- The incident list API exposes active incidents only, so incident history is not yet browsable in the UI. Assignment and alert history are available.

## Next Recommended Prompt

Production readiness: authentication/authorization, durable event delivery/outbox, deployment topology, observability, backups, and rollback operations.

# Service boundaries

ResQai remains one deployable backend while keeping these domain boundaries explicit:

- `ai` — Gemini adapters, schemas, and tool execution
- `incidents` — incident application services and lifecycle data
- `correlation` — deterministic duplicate and relationship scoring
- `resources` — responder resources, capabilities, and assignments
- `optimization` — allocation interface and future OR-Tools adapter
- `geo` — PostGIS queries, geofencing, and routing adapters
- `monitoring` — SLA/ETA rules and alert candidates
- `orchestration` — validated response state transitions
- `notifications` — operator and responder delivery adapters
- `simulator` — seeded synthetic-world scenarios and events

Create a domain directory only when implementing that domain. Keep HTTP, persistence, and third-party details behind the appropriate boundary instead of importing them across services.

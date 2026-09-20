"""Deterministic CP-SAT resource recommendation solver."""

from ortools.sat.python import cp_model

PRIORITY_WEIGHTS = {"P0": 16, "P1": 8, "P2": 4, "P3": 2}
RESPONSE_TIME_WEIGHT = 10
SUITABILITY_WEIGHT = 2
CAPABILITY_MISMATCH_PENALTY = 50
UNCOVERED_CAPABILITY_PENALTY = 10_000
RESOURCE_USE_PENALTY = 5


def _requirements(incident):
    return incident.get("requirements") or [
        {"capability": capability, "quantity": 1}
        for capability in incident.get("requiredCapabilities", [])
    ]


def optimize(payload):
    incidents = payload.get("incidents", [])
    resources = payload.get("resources", [])
    candidates = payload.get("candidates", [])
    incident_by_id = {item["incidentId"]: item for item in incidents}
    resource_by_id = {item["resourceId"]: item for item in resources}
    candidate_by_pair = {
        (item["incidentId"], item["resourceId"]): item for item in candidates
    }

    model = cp_model.CpModel()
    selected = {}
    covered = {}
    unmet = {}

    for pair, candidate in candidate_by_pair.items():
        incident_id, resource_id = pair
        incident = incident_by_id.get(incident_id)
        resource = resource_by_id.get(resource_id)
        if not incident or not resource or resource.get("capacity", 1) <= 0:
            continue
        required = {item["capability"] for item in _requirements(incident)}
        compatible = required.intersection(resource.get("capabilities", []))
        if not compatible:
            continue
        selected[pair] = model.new_bool_var(f"select__{incident_id}__{resource_id}")
        capability_vars = []
        for capability in sorted(compatible):
            variable = model.new_bool_var(
                f"cover__{incident_id}__{resource_id}__{capability}"
            )
            model.add(variable <= selected[pair])
            covered[(incident_id, resource_id, capability)] = variable
            capability_vars.append(variable)
        model.add(sum(capability_vars) >= selected[pair])

    for resource_id in resource_by_id:
        assignments = [
            variable for (incident_id, candidate_resource_id), variable in selected.items()
            if candidate_resource_id == resource_id
        ]
        if assignments:
            model.add(sum(assignments) <= 1)

    for incident in incidents:
        incident_id = incident["incidentId"]
        for requirement in _requirements(incident):
            capability = requirement["capability"]
            quantity = max(1, int(requirement.get("quantity", 1)))
            variable = model.new_int_var(0, quantity, f"unmet__{incident_id}__{capability}")
            contributions = [
                coverage for (candidate_incident_id, _resource_id, candidate_capability), coverage in covered.items()
                if candidate_incident_id == incident_id and candidate_capability == capability
            ]
            model.add(sum(contributions) + variable >= quantity)
            unmet[(incident_id, capability)] = variable

    objective_terms = []
    for pair, variable in selected.items():
        incident_id, resource_id = pair
        incident = incident_by_id[incident_id]
        resource = resource_by_id[resource_id]
        candidate = candidate_by_pair[pair]
        priority_weight = PRIORITY_WEIGHTS.get(incident.get("priority"), 1)
        eta_cost = max(0, round(float(candidate.get("etaMinutes", 0)) * 10))
        score_penalty = max(0, 1000 - round(float(candidate.get("score", 0)) * 1000))
        missing = len(set(incident.get("requiredCapabilities", [])) - set(resource.get("capabilities", [])))
        cost = (
            eta_cost * RESPONSE_TIME_WEIGHT * priority_weight
            + score_penalty * SUITABILITY_WEIGHT
            + missing * CAPABILITY_MISMATCH_PENALTY
            + RESOURCE_USE_PENALTY
        )
        objective_terms.append(variable * cost)
    for (incident_id, _capability), variable in unmet.items():
        priority_weight = PRIORITY_WEIGHTS.get(incident_by_id[incident_id].get("priority"), 1)
        objective_terms.append(variable * UNCOVERED_CAPABILITY_PENALTY * priority_weight)
    model.minimize(sum(objective_terms))

    solver = cp_model.CpSolver()
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = 0
    solver.parameters.max_time_in_seconds = 5
    result = solver.solve(model)
    if result not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {
            "status": "INFEASIBLE" if result == cp_model.INFEASIBLE else "FAILED",
            "assignments": [],
            "unfulfilledRequirements": [
                {"incidentId": incident["incidentId"], "capability": requirement["capability"]}
                for incident in incidents for requirement in _requirements(incident)
            ],
            "objectiveValue": 0,
        }

    assignments = []
    for (incident_id, resource_id), variable in sorted(selected.items()):
        if not solver.boolean_value(variable):
            continue
        candidate = candidate_by_pair[(incident_id, resource_id)]
        capabilities = sorted(
            capability for (candidate_incident_id, candidate_resource_id, capability), coverage in covered.items()
            if candidate_incident_id == incident_id
            and candidate_resource_id == resource_id
            and solver.boolean_value(coverage)
        )
        assignments.append({
            "incidentId": incident_id,
            "resourceId": resource_id,
            "capabilitiesCovered": capabilities,
            "etaMinutes": candidate.get("etaMinutes", 0),
            "score": candidate.get("score", 0),
            "reasonFactors": candidate.get("reasonFactors", []),
        })

    unfulfilled = []
    for (incident_id, capability), variable in sorted(unmet.items()):
        unfulfilled.extend(
            {"incidentId": incident_id, "capability": capability}
            for _ in range(solver.value(variable))
        )
    status = "PARTIAL" if unfulfilled else (
        "OPTIMAL" if result == cp_model.OPTIMAL else "FEASIBLE"
    )
    return {
        "status": status,
        "assignments": assignments,
        "unfulfilledRequirements": unfulfilled,
        "objectiveValue": round(solver.objective_value / 100, 2),
    }

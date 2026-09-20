import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from optimizer import optimize


def candidate(incident_id, resource_id, eta, score=0.8):
    return {
        "incidentId": incident_id,
        "resourceId": resource_id,
        "etaMinutes": eta,
        "score": score,
        "reasonFactors": ["deterministic test candidate"],
    }


class OptimizerTests(unittest.TestCase):
    def test_single_incident_covers_multiple_capabilities(self):
        result = optimize({
            "incidents": [{
                "incidentId": "INC-1", "priority": "P0", "severity": 5,
                "requiredCapabilities": ["fire_response", "medical"],
            }],
            "resources": [
                {"resourceId": "FIRE-1", "capabilities": ["fire_response"], "capacity": 1},
                {"resourceId": "AMB-1", "capabilities": ["medical"], "capacity": 2},
            ],
            "candidates": [candidate("INC-1", "FIRE-1", 6), candidate("INC-1", "AMB-1", 4)],
        })
        self.assertEqual(result["status"], "OPTIMAL")
        self.assertEqual({item["resourceId"] for item in result["assignments"]}, {"FIRE-1", "AMB-1"})
        self.assertEqual(result["unfulfilledRequirements"], [])

    def test_resource_exclusivity_and_priority_under_scarcity(self):
        result = optimize({
            "incidents": [
                {"incidentId": "INC-P0", "priority": "P0", "severity": 5, "requiredCapabilities": ["medical"]},
                {"incidentId": "INC-P2", "priority": "P2", "severity": 3, "requiredCapabilities": ["medical"]},
            ],
            "resources": [{"resourceId": "AMB-1", "capabilities": ["medical"], "capacity": 2}],
            "candidates": [candidate("INC-P0", "AMB-1", 8), candidate("INC-P2", "AMB-1", 2)],
        })
        self.assertEqual(result["status"], "PARTIAL")
        self.assertEqual(len(result["assignments"]), 1)
        self.assertEqual(result["assignments"][0]["incidentId"], "INC-P0")
        self.assertEqual(result["unfulfilledRequirements"], [{"incidentId": "INC-P2", "capability": "medical"}])

    def test_incompatible_resource_returns_partial_plan(self):
        result = optimize({
            "incidents": [{"incidentId": "INC-1", "priority": "P1", "severity": 4, "requiredCapabilities": ["hazmat"]}],
            "resources": [{"resourceId": "AMB-1", "capabilities": ["medical"], "capacity": 2}],
            "candidates": [candidate("INC-1", "AMB-1", 2)],
        })
        self.assertEqual(result["status"], "PARTIAL")
        self.assertEqual(result["assignments"], [])
        self.assertEqual(result["unfulfilledRequirements"][0]["capability"], "hazmat")


if __name__ == "__main__":
    unittest.main()

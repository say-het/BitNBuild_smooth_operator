"""Minimal HTTP wrapper for the ResQai OR-Tools optimizer."""

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from optimizer import optimize


class Handler(BaseHTTPRequestHandler):
    def _json(self, status, body):
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"status": "ok", "service": "resqai-optimizer"})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/optimize":
            self._json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("content-length", "0"))
            if length <= 0 or length > 1_000_000:
                raise ValueError("invalid request size")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("request must be an object")
            self._json(200, optimize(payload))
        except (ValueError, json.JSONDecodeError, KeyError, TypeError) as error:
            self._json(400, {"error": str(error)})
        except Exception:
            self._json(500, {"error": "optimization failed"})

    def log_message(self, message, *args):
        print(json.dumps({"service": "resqai-optimizer", "message": message % args}))


if __name__ == "__main__":
    port = int(os.environ.get("OPTIMIZER_PORT", "8081"))
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()

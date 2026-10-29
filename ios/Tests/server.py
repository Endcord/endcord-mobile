"""The bundle server for the simulator test (run.sh), like raw.githubusercontent.com: files with ETags, 304 for an
unchanged one. GET /__mode/<mode> switches what it serves, and every request is logged to the log file as
"<path> <If-None-Match> <status>".

Modes: normal; nohbc (no precompiled bundle); wronghbc (the other Hermes version's bytecode as this one's); down (every
request fails); throws (no precompiled bundle, and the plain one throws); real (the published bundle as the
precompiled one).

    python3 server.py <port> <folder> <log file>
"""

import hashlib
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT, ROOT, LOG = int(sys.argv[1]), sys.argv[2], sys.argv[3]
state = {"mode": "normal"}


def resolve(name):
    """The file served for a name in the current mode, or None for a 404"""
    mode = state["mode"]
    if name.endswith(".hbc"):
        if mode in ("nohbc", "throws"):
            return None
        if mode == "wronghbc":
            return "other-version.hbc"
        if mode == "real":
            return "real.hbc"
    if name == "endcord.min.js" and mode == "throws":
        return "throws.js"
    return name


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def answer(self, status, body=b"", headers=None):
        self.send_response(status)
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        with open(LOG, "a") as log:
            log.write(f"{self.path} {self.headers.get('If-None-Match', '-')} {status}\n")

    def do_GET(self):
        if self.path.startswith("/__mode/"):
            state["mode"] = self.path[len("/__mode/"):]
            return self.answer(200, state["mode"].encode())
        if state["mode"] == "down":
            return self.answer(503)

        name = resolve(os.path.basename(self.path))
        path = os.path.join(ROOT, name) if name else None
        if not path or not os.path.isfile(path):
            return self.answer(404)
        with open(path, "rb") as f:
            body = f.read()
        etag = '"' + hashlib.sha1(body).hexdigest() + '"'
        if self.headers.get("If-None-Match") == etag:
            return self.answer(304, headers={"ETag": etag})
        self.answer(200, body, {"ETag": etag, "Content-Type": "application/octet-stream"})


ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()

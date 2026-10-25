#!/usr/bin/env python3
"""Static dev server for MyCalculator.

    python3 tools/serve.py [port]

Sends Cache-Control: no-store on everything. Without it the browser keeps
serving the previous copy of an edited ES module from its disk cache, and you
end up debugging code you already changed.

This is for development only. In production the service worker handles caching
and its cache name is a content hash — see tools/build-sw.mjs.
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Some of these are not in the stdlib's default map, and a service worker
# served as text/plain will not register.
TYPES = {
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml",
}


class Handler(SimpleHTTPRequestHandler):
    # HTTP/1.0 is the stdlib default, and browsers refuse to fetch a service
    # worker script over it — registration fails with an opaque "unknown error".
    protocol_version = "HTTP/1.1"

    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, **TYPES}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Service-Worker-Allowed", "/")
        super().end_headers()

    def log_message(self, fmt, *args):
        # One line per request is enough; the default logs the full request line.
        if args and str(args[1]).startswith(("4", "5")):
            super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4191
    handler = partial(Handler, directory=str(ROOT))
    with ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"serving {ROOT} at http://127.0.0.1:{port}/")
        print(f"tests at   http://127.0.0.1:{port}/tests/")
        httpd.serve_forever()


if __name__ == "__main__":
    main()

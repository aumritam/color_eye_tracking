#!/usr/bin/env python3
"""Tiny local web server for the eye-tracking app.

Run it from inside this folder:   python3 serve.py
(or pick another port:            python3 serve.py 8001)

It does the same job as `python3 -m http.server 8000`, with two extras:
  * It tells the browser never to keep old copies of the files, so after you
    replace index.html a normal refresh always shows the new version.
  * It prints which folder and which version of index.html it is serving, so
    you can tell at a glance if you are looking at an old copy.
"""
import contextlib
import http.server
import os
import re
import socket
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()


class DualStackServer(http.server.ThreadingHTTPServer):
    """Listens on both IPv6 and IPv4, so http://localhost:PORT always works."""
    address_family = socket.AF_INET6

    def server_bind(self):
        with contextlib.suppress(Exception):
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        return super().server_bind()


def describe_folder():
    folder = os.getcwd()
    print(f"Serving this folder: {folder}")

    if not os.path.exists("index.html"):
        print("  WARNING: there is no index.html here. You started the server in the wrong folder.")
        return

    with open("index.html", encoding="utf-8", errors="replace") as f:
        match = re.search(r"Version\s+([0-9]{4}-[0-9]{2}-[0-9]{2}[a-z]?)", f.read())

    if match:
        print(f"  index.html version: {match.group(1)}")
    else:
        print("  index.html version: OLD (no version tag, so this is an out-of-date copy)")

    if not os.path.isdir(os.path.join("mediapipe", "face_mesh")):
        print("  WARNING: the mediapipe/face_mesh folder is missing. Eye tracking will not start.")


def make_server():
    try:
        return DualStackServer(("::", PORT), NoCacheHandler)
    except OSError as error:
        if error.errno in (48, 98, 10048):  # address already in use
            raise
        # No IPv6 on this machine: fall back to IPv4 only.
        return http.server.ThreadingHTTPServer(("0.0.0.0", PORT), NoCacheHandler)


def main():
    try:
        server = make_server()
    except OSError:
        print(f"Port {PORT} is already in use. An older server is probably still running.")
        print("Stop it (click its terminal and press Ctrl+C), or use another port:")
        print(f"    python3 serve.py {PORT + 1}")
        sys.exit(1)

    describe_folder()
    print(f"\nOpen  http://localhost:{PORT}  in Chrome.  Press Ctrl+C here to stop.\n")

    with server:
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
import argparse
import http.server
import os
import socketserver
from pathlib import Path

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Origin-Agent-Cluster', '?1')
        self.send_header('Permissions-Policy', 'tools=(self)')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        target = Path(self.directory) / self.path.lstrip('/').split('?', 1)[0]
        if self.path != '/' and not target.exists() and '.' not in target.name:
            self.path = '/index.html'
        super().do_GET()

parser = argparse.ArgumentParser()
parser.add_argument('--root', default='dist')
parser.add_argument('--port', type=int, default=4173)
args = parser.parse_args()
os.chdir(args.root)
with socketserver.ThreadingTCPServer(('127.0.0.1', args.port), Handler) as httpd:
    print(f'BRANCHLINE serving http://127.0.0.1:{args.port}')
    httpd.serve_forever()

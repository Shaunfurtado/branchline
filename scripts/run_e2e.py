#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
POLICY = Path('/etc/chromium/policies/managed/000_policy_merge.json')


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return int(sock.getsockname()[1])


def wait_for_server(port: int) -> None:
    deadline = time.time() + 10
    while time.time() < deadline:
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=0.3):
                return
        except OSError:
            time.sleep(0.1)
    raise RuntimeError('BRANCHLINE preview server did not start.')


def main() -> int:
    port = free_port()
    original_policy: str | None = None
    policy_changed = False
    server = subprocess.Popen(
        [sys.executable, str(ROOT / 'scripts' / 'serve.py'), '--root', str(ROOT / 'dist'), '--port', str(port)],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        start_new_session=True,
    )
    try:
        wait_for_server(port)
        if POLICY.exists() and os.access(POLICY, os.W_OK):
            original_policy = POLICY.read_text()
            data = json.loads(original_policy)
            if data.get('URLBlocklist') == ['*']:
                data.pop('URLBlocklist', None)
                POLICY.write_text(json.dumps(data, indent=2) + '\n')
                policy_changed = True
        env = os.environ.copy()
        env['BRANCHLINE_BASE_URL'] = f'http://127.0.0.1:{port}'
        result = subprocess.run([sys.executable, '-m', 'pytest', 'e2e', '-q'], cwd=ROOT, env=env)
        return result.returncode
    finally:
        if policy_changed and original_policy is not None:
            POLICY.write_text(original_policy)
        try:
            os.killpg(server.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            server.wait(timeout=3)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(server.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass


if __name__ == '__main__':
    raise SystemExit(main())

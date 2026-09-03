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

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
POLICY = Path('/etc/chromium/policies/managed/000_policy_merge.json')
OUTPUT = ROOT / 'submission' / 'screenshots'
TMP = ROOT / 'tmp'

sys.path.insert(0, str(ROOT))
from e2e.webmcp_mock import WEBMCP_INIT_SCRIPT  # noqa: E402


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


def call(page, name: str, payload: dict) -> dict:
    result = page.evaluate("([toolName, input]) => window.__branchlineNativeTools.call(toolName, input)", [name, payload])
    if not result.get('ok'):
        raise RuntimeError(f'{name} failed: {result}')
    return result


def capture(page, filename: str) -> None:
    page.screenshot(path=str(OUTPUT / filename), animations='allow')
    print(f'Captured submission/screenshots/{filename}')


def main() -> int:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    TMP.mkdir(parents=True, exist_ok=True)
    port = free_port()
    server = subprocess.Popen(
        [sys.executable, str(ROOT / 'scripts' / 'serve.py'), '--root', str(ROOT / 'dist'), '--port', str(port)],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        start_new_session=True,
    )
    original_policy: str | None = None
    policy_changed = False
    try:
        wait_for_server(port)
        if POLICY.exists() and os.access(POLICY, os.W_OK):
            original_policy = POLICY.read_text()
            data = json.loads(original_policy)
            if data.get('URLBlocklist') == ['*']:
                data.pop('URLBlocklist', None)
                POLICY.write_text(json.dumps(data, indent=2) + '\n')
                policy_changed = True

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path='/usr/bin/chromium',
                headless=True,
                args=['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
            )
            context = browser.new_context(viewport={'width': 1600, 'height': 900}, device_scale_factor=1)
            context.add_init_script(WEBMCP_INIT_SCRIPT)
            page = context.new_page()
            errors: list[str] = []
            page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{port}/?fresh=1', wait_until='networkidle')
            page.wait_for_function("() => window.__branchlineNativeTools.names().then(names => names.length === 6)")
            page.wait_for_timeout(300)
            capture(page, '01-healthy.png')

            page.locator('[data-action="trigger-shock"]').first.click()
            page.wait_for_function("() => window.__branchlineNativeTools.names().then(names => names.includes('create_branch'))")
            page.wait_for_timeout(650)
            capture(page, '02-disrupted.png')

            call(page, 'trace_impact', {'source_id': 'sup_nori', 'direction': 'downstream', 'max_depth': 5})
            created_ids: list[str] = []
            for name, strategy in [
                ('Service First', 'service_first'),
                ('Cost Guard', 'cost_guard'),
                ('Balanced Recovery', 'balanced'),
            ]:
                branch = call(page, 'create_branch', {'name': name, 'strategy': strategy})
                branch_id = branch['data']['id']
                created_ids.append(branch_id)
                call(page, 'simulate_branch', {'branch_id': branch_id, 'horizon_days': 30})
            page.wait_for_timeout(500)
            capture(page, '03-branches.png')

            call(page, 'compare_branches', {'branch_ids': created_ids})
            page.wait_for_timeout(600)
            capture(page, '04-compare.png')

            page.locator('[data-action="protect-apex"]').click()
            balanced_id = created_ids[2]
            call(page, 'simulate_branch', {'branch_id': balanced_id, 'horizon_days': 30})
            staged = call(page, 'stage_plan', {
                'branch_id': balanced_id,
                'rationale': 'Best current service-cost tradeoff after the human Apex lock.',
            })
            page.wait_for_timeout(500)
            capture(page, '05-staged-approval.png')

            page.locator('[data-action="approve-plan"]').click()
            page.wait_for_function("() => window.__branchlineNativeTools.names().then(names => names.includes('apply_plan'))")
            snapshot = call(page, 'get_ops_snapshot', {})
            applied = call(page, 'apply_plan', {
                'plan_id': staged['data']['plan_id'],
                'expected_context_version': snapshot['context_version'],
            })
            page.wait_for_timeout(700)
            capture(page, '06-executed.png')

            call(page, 'verify_plan', {'plan_id': staged['data']['plan_id']})
            page.wait_for_timeout(500)
            capture(page, '07-verified-recovery.png')

            page.locator('[data-action="toggle-capabilities"]').first.click()
            page.wait_for_timeout(400)
            capture(page, '08-capability-surface.png')
            page.keyboard.press('Escape')

            page.locator('[data-action="toggle-about"]').click()
            page.wait_for_timeout(400)
            capture(page, '09-about-architecture.png')
            page.keyboard.press('Escape')

            call(page, 'rollback_plan', {
                'checkpoint_id': applied['data']['checkpoint_id'],
                'reason': 'Supplier agreement was not signed.',
            })
            page.wait_for_timeout(400)

            if errors:
                raise RuntimeError('Browser errors during capture:\n' + '\n'.join(errors))
            context.close()
            browser.close()
        return 0
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

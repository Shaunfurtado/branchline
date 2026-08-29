from __future__ import annotations

import re

import pytest
from playwright.sync_api import Page, expect


def tool_names(page: Page) -> list[str]:
    return page.evaluate("window.__branchlineNativeTools.names()")


def call_tool(page: Page, name: str, payload: dict) -> dict:
    return page.evaluate("([name, payload]) => window.__branchlineNativeTools.call(name, payload)", [name, payload])


def wait_for_tool(page: Page, name: str, present: bool = True) -> None:
    page.wait_for_function(
        "([name, present]) => window.__branchlineNativeTools.names().then(names => present ? names.includes(name) : !names.includes(name))",
        arg=[name, present],
    )


def test_canonical_native_webmcp_flow(page: Page, base_url: str) -> None:
    console_errors: list[str] = []
    page.on('console', lambda message: console_errors.append(message.text) if message.type == 'error' else None)
    page.on('pageerror', lambda error: console_errors.append(str(error)))

    page.goto(f'{base_url}/?fresh=1', wait_until='networkidle')
    expect(page.get_by_text('BRANCHLINE', exact=True)).to_be_visible()
    expect(page.get_by_text('Synthetic operational twin. No real orders, purchases, shipments, or production systems are changed.')).to_be_visible()
    page.wait_for_function("() => window.__branchlineNativeTools.names().then(names => names.length === 6)")
    assert tool_names(page) == [
        'find_substitutes', 'get_ops_snapshot', 'inspect_entity', 'list_constraints', 'read_external_alerts', 'trace_impact'
    ]

    page.locator('[data-action="trigger-shock"]').first.click()
    expect(page.get_by_text('NoriCell production unavailable')).to_be_visible()
    expect(page.locator('.impact-number').filter(has_text='Affected orders').locator('strong')).to_have_text('16')
    expect(page.get_by_label('Computed headline impact').get_by_text('$28.43M')).to_be_visible()
    wait_for_tool(page, 'create_branch')

    trace = call_tool(page, 'trace_impact', {'source_id': 'sup_nori', 'direction': 'downstream', 'max_depth': 5})
    assert trace['ok'] is True
    expect(page.locator('.atlas-stage')).to_have_attribute('data-view', 'causality')

    created_ids: list[str] = []
    for name, strategy in [
        ('Service First', 'service_first'),
        ('Cost Guard', 'cost_guard'),
        ('Balanced Recovery', 'balanced'),
    ]:
        created = call_tool(page, 'create_branch', {'name': name, 'strategy': strategy})
        assert created['ok'] is True
        branch_id = created['data']['id']
        created_ids.append(branch_id)
        wait_for_tool(page, 'simulate_branch')
        simulated = call_tool(page, 'simulate_branch', {'branch_id': branch_id, 'horizon_days': 30})
        assert simulated['ok'] is True

    wait_for_tool(page, 'compare_branches')
    compared = call_tool(page, 'compare_branches', {'branch_ids': created_ids})
    assert compared['ok'] is True
    expect(page.locator('.future-lane')).to_have_count(3)
    expect(page.get_by_role('heading', name='Parallel recovery futures')).to_be_visible()

    cost_card = page.locator('.branch-card.strategy-cost_guard')
    expect(cost_card).to_contain_text('Cost Guard')
    expect(cost_card.locator('.branch-metric-grid div').filter(has_text='Delayed').locator('strong')).to_have_text('2')

    page.locator('[data-action="protect-apex"]').click()
    expect(page.get_by_text('HUMAN AUTHORED')).to_be_visible()
    expect(page.locator('.branch-card.status-stale')).to_have_count(3)
    wait_for_tool(page, 'stage_plan', present=False)
    wait_for_tool(page, 'apply_plan', present=False)

    balanced_id = created_ids[2]
    resimulated = call_tool(page, 'simulate_branch', {'branch_id': balanced_id, 'horizon_days': 30})
    assert resimulated['ok'] is True
    expect(page.locator('.branch-card.strategy-balanced')).to_contain_text('CURRENT')
    wait_for_tool(page, 'stage_plan')

    staged = call_tool(page, 'stage_plan', {'branch_id': balanced_id, 'rationale': 'Best current service-cost tradeoff after the human Apex lock.'})
    assert staged['ok'] is True
    plan_id = staged['data']['plan_id']
    expect(page.get_by_role('heading', name='Approve a simulated future')).to_be_visible()
    wait_for_tool(page, 'apply_plan', present=False)

    page.locator('[data-action="approve-plan"]').click()
    wait_for_tool(page, 'apply_plan')
    assert 'apply_plan' in tool_names(page)

    context_version = call_tool(page, 'get_ops_snapshot', {})['context_version']
    applied = call_tool(page, 'apply_plan', {'plan_id': plan_id, 'expected_context_version': context_version})
    assert applied['ok'] is True
    checkpoint_id = applied['data']['checkpoint_id']
    expect(page.get_by_role('heading', name='Reality committed')).to_be_visible()
    expect(page.get_by_text(re.compile(r'\$25[0-9],|\$26[0-9],'))).to_be_visible()
    wait_for_tool(page, 'verify_plan')
    wait_for_tool(page, 'rollback_plan')

    verified = call_tool(page, 'verify_plan', {'plan_id': plan_id})
    assert verified['ok'] is True
    assert verified['data']['hard_constraints_passed'] is True
    assert verified['data']['actual']['protected_apex_on_time'] is True
    expect(page.get_by_role('heading', name='Recovery verified')).to_be_visible()
    expect(page.get_by_text('0', exact=True).last).to_be_visible()

    page.get_by_label('Recovery verified').get_by_role('button', name='Causal proof').click()
    expect(page.get_by_text('Causal Proof', exact=True)).to_be_visible()
    expect(page.get_by_text(re.compile('Voltra is excluded from ORION-X'))).to_be_visible()
    page.locator('[data-action="close-proof"]').click()

    rolled_back = call_tool(page, 'rollback_plan', {'checkpoint_id': checkpoint_id, 'reason': 'Supplier agreement was not signed.'})
    assert rolled_back['ok'] is True
    expect(page.locator('.atlas-live-key').get_by_text('Checkpoint restored', exact=True)).to_be_visible()
    assert 'apply_plan' not in tool_names(page)

    page.locator('[data-action="reset-demo"]').click()
    expect(page.get_by_text('Operationally stable')).to_be_visible()
    expect(page.locator('.branch-card')).to_have_count(0)
    page.wait_for_function("() => window.__branchlineNativeTools.names().then(names => names.length === 6)")

    assert not console_errors, '\n'.join(console_errors)


@pytest.mark.parametrize('width,height', [(1024, 768), (1440, 900), (1920, 1080)])
def test_responsive_command_center(browser, base_url: str, width: int, height: int) -> None:
    from .webmcp_mock import WEBMCP_INIT_SCRIPT

    context = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion='reduce')
    context.add_init_script(WEBMCP_INIT_SCRIPT)
    page = context.new_page()
    try:
        page.goto(f'{base_url}/?fresh=1', wait_until='networkidle')
        expect(page.locator('.command-bar')).to_be_visible()
        expect(page.locator('.atlas-stage')).to_be_visible()
        expect(page.get_by_label('Branch Chamber')).to_be_visible()
        overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        assert overflow <= 2
        page.locator('[data-action="trigger-shock"]').first.click()
        expect(page.get_by_label('Computed headline impact').get_by_text('$28.43M')).to_be_visible()
        assert page.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches") is True
    finally:
        context.close()


def test_approval_modal_keyboard_and_untrusted_alerts(page: Page, base_url: str) -> None:
    page.goto(f'{base_url}/?fresh=1', wait_until='networkidle')
    page.locator('[data-action="show-alerts"]').click()
    drawer = page.get_by_role('dialog', name='External alerts')
    expect(drawer).to_be_visible()
    expect(drawer.get_by_text('<img src=x onerror=alert(1)>', exact=False)).to_be_visible()
    assert page.locator('img[src="x"]').count() == 0
    page.keyboard.press('Escape')
    expect(drawer).not_to_be_visible()

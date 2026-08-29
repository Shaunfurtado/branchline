from __future__ import annotations

import os
from collections.abc import Iterator

import pytest
from playwright.sync_api import Browser, BrowserContext, Page, sync_playwright

from .webmcp_mock import WEBMCP_INIT_SCRIPT


@pytest.fixture(scope='session')
def base_url() -> str:
    return os.environ.get('BRANCHLINE_BASE_URL', 'http://127.0.0.1:4173')


@pytest.fixture(scope='session')
def browser() -> Iterator[Browser]:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path='/usr/bin/chromium',
            headless=True,
            args=['--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage'],
        )
        yield browser
        browser.close()


@pytest.fixture
def context(browser: Browser) -> Iterator[BrowserContext]:
    context = browser.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='no-preference')
    context.add_init_script(WEBMCP_INIT_SCRIPT)
    yield context
    context.close()


@pytest.fixture
def page(context: BrowserContext) -> Iterator[Page]:
    page = context.new_page()
    yield page

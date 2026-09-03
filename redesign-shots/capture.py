import os
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:4173"
OUT = os.path.join(os.path.dirname(__file__))
os.makedirs(OUT, exist_ok=True)

CONSOLE_ERRORS = []

def shot(page, name):
    page.screenshot(path=os.path.join(OUT, name))
    print("saved", name)

def realclick(page, sel, wait=700):
    try:
        page.click(sel, timeout=4000)
        page.wait_for_timeout(wait)
        return True
    except Exception as e:
        print("realclick failed", sel, "->", e)
        return False

def jsclick(page, sel, wait=700):
    try:
        page.evaluate("""(s)=>{const el=document.querySelector(s); if(el){el.click(); return true;} return false;}""", sel)
        page.wait_for_timeout(wait)
        return True
    except Exception as e:
        print("jsclick failed", sel, "->", e)
        return False

with sync_playwright() as p:
    browser = p.chromium.launch(args=["--no-sandbox"])
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    ctx.add_init_script("try{localStorage.removeItem('branchline_tour_done')}catch(e){}")
    page = ctx.new_page()
    page.on("console", lambda m: CONSOLE_ERRORS.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: CONSOLE_ERRORS.append("PAGEERROR: " + str(e)))

    page.goto(BASE + "/?fresh=1", wait_until="networkidle")
    page.wait_for_selector(".command-bar", timeout=8000)
    page.wait_for_timeout(1600)

    # Tour
    shot(page, "01-tour-welcome.png")
    realclick(page, ".bl-tour-next", wait=900); shot(page, "02-tour-commandbar.png")
    realclick(page, ".bl-tour-next", wait=900); shot(page, "03-tour-incident.png")
    realclick(page, ".bl-tour-skip", wait=600)

    # Healthy
    page.wait_for_timeout(500); shot(page, "04-healthy.png")
    page.set_viewport_size({"width": 1920, "height": 1080}); page.wait_for_timeout(400)
    shot(page, "04b-healthy-1920.png")
    page.set_viewport_size({"width": 1440, "height": 900})

    # Canonical flow (real user clicks)
    realclick(page, '[data-action="trigger-shock"]', wait=1400); shot(page, "05-disrupted.png")
    realclick(page, '[data-action="create-demo-trio"]', wait=2600); shot(page, "06-branches.png")
    realclick(page, '[data-action="compare-current"]', wait=900); shot(page, "07-compare.png")
    realclick(page, '[data-action="stage-branch"]', wait=1200); shot(page, "08-staged-approval.png")
    realclick(page, '[data-action="approve-plan"]', wait=900)
    realclick(page, '[data-action="manual-apply"]', wait=1600); shot(page, "09-executed.png")
    jsclick(page, '[data-action="manual-verify"]', wait=1600); shot(page, "10-verified-recovery.png")

    # Capability surface (WebMCP tools)
    jsclick(page, '[data-action="close-recovery"]', wait=500)
    jsclick(page, '[data-action="toggle-capabilities"]', wait=1000); shot(page, "11-capability-surface.png")
    jsclick(page, '[data-action="close-capabilities"]', wait=500)

    # About / architecture
    jsclick(page, '[data-action="toggle-about"]', wait=900); shot(page, "12-about-architecture.png")

    browser.close()

print("CONSOLE ERRORS:", len(CONSOLE_ERRORS))
for e in CONSOLE_ERRORS[:20]:
    print(" -", e)

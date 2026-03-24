import asyncio
import logging
from typing import List, Optional
from fastapi import FastAPI, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import os

# Import trusted sites agent for intelligent site opening
from trusted_sites_agent.utils import lookup_trusted_site, normalize_site_name
from trusted_sites_agent.browser_site_agent import (
    open_site as trusted_open_site,
    search_unknown_site,
    add_trusted_site,
    list_trusted_sites,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="JARVIS YouTube Agent")

# Global variables
driver = None
last_extracted_elements = []

class BrowserCommand(BaseModel):
    type: str # 'open_tab' | 'search_site' | 'media_control' | 'scroll' | 'analyze_page' | 'click' | 'type' | 'wait' | 'youtube_like' | 'youtube_subscribe' | 'youtube_comment' | 'type_secure'
    url: Optional[str] = None
    query: Optional[str] = None
    site: Optional[str] = None
    target_tab: Optional[str] = None
    force_new_tab: Optional[bool] = False
    action: Optional[str] = None # 'play' | 'pause' | 'skip_forward' | 'skip_backward' | 'seek' (legacy)
    command: Optional[str] = None # 'play' | 'pause' | 'skip_forward' | 'skip_backward' (new standard to avoid JSON key collision)
    seconds: Optional[float] = None
    direction: Optional[str] = None # 'up' | 'down'
    amount: Optional[float] = None
    jarvis_id: Optional[int] = None # ID of the element to interact with
    text: Optional[str] = None # Text to type

class CommandRequest(BaseModel):
    commands: List[BrowserCommand]

def is_driver_alive(d) -> bool:
    """Checks if the WebDriver session is still valid."""
    try:
        _ = d.title  # Will throw if session is dead
        return True
    except Exception:
        return False

def _create_driver():
    """Internal: boots a fresh undetected-chromedriver instance."""
    logger.info("[Browser] Initializing new WebDriver session...")
    options = uc.ChromeOptions()
    profile_dir = os.path.join(os.getcwd(), "chrome_profile")
    options.add_argument(f"--user-data-dir={profile_dir}")
    options.add_argument("--profile-directory=Default")
    options.add_argument('--autoplay-policy=no-user-gesture-required')
    new_driver = uc.Chrome(options=options, use_subprocess=True)
    new_driver.set_page_load_timeout(30)
    logger.info("[Browser] WebDriver session started successfully.")
    return new_driver

def get_driver():
    """Lazy factory: returns live driver, auto-recovering from dead sessions."""
    global driver
    if driver is None or not is_driver_alive(driver):
        if driver is not None:
            logger.warning("[Browser] Dead session detected. Restarting WebDriver...")
            try: driver.quit()
            except: pass
            driver = None
        driver = _create_driver()
    return driver

@app.on_event("shutdown")
def shutdown_event():
    global driver
    if driver is not None:
        logger.info("[Browser] Shutting down WebDriver...")
        try: driver.quit()
        except: pass
        driver = None

def get_tab_by_name(target_name: Optional[str]) -> Optional[str]:
    """Finds a window handle based on matching title or URL to target_name"""
    d = get_driver()
    if not d or not target_name:
        return None
        
    current = d.current_window_handle
    for handle in d.window_handles:
        d.switch_to.window(handle)
        title = d.title.lower()
        url = d.current_url.lower()
        target = target_name.lower()
        if target in title or target in url:
             return handle
    d.switch_to.window(current)
    return None

def execute_single_command(cmd: BrowserCommand):
    global driver
    logger.info(f"Executing command: {cmd.type} - {cmd.model_dump_json()}")
    
    # close_browser: graceful session teardown
    if cmd.type == "close_browser":
        if driver is not None:
            try: driver.quit()
            except: pass
            driver = None
        logger.info('{"action": "close_browser", "success": true, "details": "Session terminated"}')
        return
    
    # Ensure a live session exists (lazy init + auto-recovery)
    d = get_driver()
    
    # Simple tab resolution logic
    target_name = cmd.target_tab or cmd.site
    if not target_name and cmd.url:
        target_name = cmd.url
        
    if cmd.type == "open_tab":
        url = cmd.url
        
        # If no URL provided, resolve from trusted sites
        if not url and (cmd.site or target_name):
            site = (cmd.site or target_name or "").lower().strip()
            # Use trusted_sites_agent for smart lookup
            trusted_url = lookup_trusted_site(site)
            if trusted_url:
                url = trusted_url
                logger.info(f"Trusted site found: '{site}' -> {url}")
            else:
                # Fallback: Google search for the site name
                url = f"https://www.google.com/search?q={site}+official+website"
                logger.info(f"Unknown site '{site}', falling back to Google search")
            
        if not url:
            logger.warning("open_tab: No URL or site name provided, skipping.")
            return
            
        handle = None if cmd.force_new_tab else (get_tab_by_name(target_name) if target_name else None)
        if handle:
            d.switch_to.window(handle)
            d.get(url)
        else:
            # Open new tab
            if len(d.window_handles) == 1 and d.current_url == "data:,":
                 d.get(url)
            else:
                 d.switch_to.new_window('tab')
                 d.get(url)
                 
    elif cmd.type == "new_tab":
        url = cmd.url
        d.switch_to.new_window('tab')
        if url:
            d.get(url)
            
    elif cmd.type == "go_back":
        d.back()
        logger.info("Executing browser back navigation")
        
    elif cmd.type == "skip_ad":
        # Broad script to try and click standard YouTube and generic ad skip buttons
        script = """
            const adBtn = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern');
            if (adBtn) {
                adBtn.click();
                return true;
            }
            return false;
        """
        d.execute_script(script)
        logger.info("Attempted to skip ad")
        
                 
    elif cmd.type == "search_site":
        if not cmd.query:
            return
        
        query_str = cmd.query or ""
        url = ""
        target = (target_name or "").lower()
        if "youtube" in target:
            url = f"https://www.youtube.com/results?search_query={query_str.replace(' ', '+')}"
        elif "google" in target:
            url = f"https://www.google.com/search?q={query_str.replace(' ', '+')}"
        else:
            url = f"https://duckduckgo.com/?q={query_str.replace(' ', '+')}"
            
        handle = None if cmd.force_new_tab else (get_tab_by_name(target_name) if target_name else None)
        if handle:
            d.switch_to.window(handle)
            d.get(url)
        else:
            # New tab
            if len(d.window_handles) == 1 and d.current_url == "data:,":
                 d.get(url)
            else:
                 d.switch_to.new_window('tab')
                 d.get(url)
                 
            if "youtube" in target:
                try:
                    WebDriverWait(d, 5).until(
                        EC.presence_of_element_located((By.CSS_SELECTOR, "ytd-video-renderer a#video-title"))
                    )
                    d.execute_script("document.querySelector('ytd-video-renderer a#video-title').click();")
                except Exception as e:
                    logger.warning(f"Failed to auto-play first video: {e}")
                    
    elif cmd.type == "media_control":
        # Make sure we are on the right tab if specified, but if not just try current tab
        if target_name:
            handle = get_tab_by_name(target_name)
            if handle:
                d.switch_to.window(handle)
                
        # Inject Javascript to control the standard HTML5 video player
        js_code = ""
        # Accept 'command' (new standard) OR 'action' (legacy fallback) to avoid JSON key collisions
        action = cmd.command or cmd.action
        
        # Ensure we have a video element first
        check_js = "return document.querySelector('video') !== null"
        if not d.execute_script(check_js):
            logger.warning("No video element found on current page for media_control")
            return
            
        if action == "play":
            js_code = "document.querySelector('video').play();"
        elif action == "pause":
            js_code = "document.querySelector('video').pause();"
        elif action == "skip_forward":
            sec = cmd.seconds or 10
            js_code = f"document.querySelector('video').currentTime += {sec};"
        elif action == "skip_backward":
            sec = cmd.seconds or 10
            js_code = f"document.querySelector('video').currentTime -= {sec};"
        elif action == "seek":
            if cmd.seconds is not None:
                js_code = f"document.querySelector('video').currentTime = {cmd.seconds};"
            
        if js_code:
            d.execute_script(js_code)
            
    elif cmd.type == "scroll":
        if target_name:
            handle = get_tab_by_name(target_name)
            if handle:
                d.switch_to.window(handle)
                
        amount = cmd.amount or 500
        if cmd.direction == "up":
            amount = -amount
            
        d.execute_script(f"window.scrollBy(0, {amount});")
        
    elif cmd.type == "click":
        if cmd.jarvis_id is not None:
            # Smart element matching from globally cached DOM
            target_info = {"id": cmd.jarvis_id}
            for el in last_extracted_elements:
                if el.get("id") == cmd.jarvis_id:
                    target_info = el
                    break
                    
            res = safe_click(target_info)
            if not res["success"]:
                raise Exception(f"Failed to click element: {res['details']}")
    elif cmd.type == "type":
        if cmd.jarvis_id is not None and cmd.text is not None:
            # Escape double quotes and backslashes in text for JS
            text_val = str(cmd.text)
            safe_text = text_val.replace('\\', '\\\\').replace('"', '\\"')
            script = f"""
                const el = document.querySelector('[jarvis_id="{cmd.jarvis_id}"]');
                if (el) {{
                    el.scrollIntoView({{behavior: 'smooth', block: 'center'}});
                    el.focus();
                    el.value = "{safe_text}";
                    // Trigger events so React/Vue notice the change
                    el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                    return true;
                }}
                return false;
            """
            result = d.execute_script(script)
            if not result:
                raise Exception(f"Element with jarvis_id {cmd.jarvis_id} not found yet")
                
    elif cmd.type == "type_secure":
        if cmd.jarvis_id is not None and cmd.text is not None:
            # Resolves from Environment Variables for Security Mock
            text_val = str(cmd.text)
            deciphered = os.environ.get(text_val, text_val)
            safe_text = str(deciphered).replace('\\', '\\\\').replace('"', '\\"')
            script = f"""
                const el = document.querySelector('[jarvis_id="{cmd.jarvis_id}"]');
                if (el) {{
                    el.scrollIntoView({{behavior: 'smooth', block: 'center'}});
                    el.focus();
                    el.value = "{safe_text}";
                    el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                    return true;
                }}
                return false;
            """
            result = d.execute_script(script)
            logger.info(f"Executed type_secure successfully (plaintext masked)")
            if not result:
                raise Exception(f"Element with jarvis_id {cmd.jarvis_id} not found yet")
                
    elif cmd.type == "youtube_like":
        script = """
        const btn = document.querySelector('ytd-menu-renderer .yt-spec-button-shape-next--tonal');
        if (btn) { btn.click(); return true; } return false;
        """
        d.execute_script(script)
        logger.info("Executed youtube_like")
        
    elif cmd.type == "youtube_subscribe":
        script = """
        const btn = document.querySelector('ytd-subscribe-button-renderer button');
        if (btn) { btn.click(); return true; } return false;
        """
        d.execute_script(script)
        logger.info("Executed youtube_subscribe")
        
    elif cmd.type == "youtube_comment":
        if cmd.text is not None:
            text_val = str(cmd.text)
            safe_text = text_val.replace('\\', '\\\\').replace('"', '\\"')
            script = f"""
            const box = document.querySelector('ytd-comment-simplebox-renderer #placeholder-area');
            if (box) {{
                box.click();
                setTimeout(() => {{
                    const input = document.querySelector('#contenteditable-root');
                    if (input) {{
                         input.innerText = "{safe_text}";
                         input.dispatchEvent(new Event('input', {{bubbles:true}}));
                         setTimeout(() => {{
                             const submit = document.querySelector('#submit-button');
                             if (submit) submit.click();
                         }}, 500);
                    }}
                }}, 500);
                return true;
            }}
            return false;
            """
            d.execute_script(script)
            logger.info("Executed youtube_comment")
            
    elif cmd.type == "wait":
        sec = cmd.seconds or 2
        import time
        time.sleep(sec)

def process_commands(commands: List[BrowserCommand]):
    import time
    for cmd in commands:
        max_retries = 3
        for attempt in range(max_retries):
            try:
                execute_single_command(cmd)
                break # Success, move to next command
            except Exception as e:
                # If it's a DOM element not found exception, wait and retry
                if "not found yet" in str(e) and attempt < max_retries - 1:
                    logger.warning(f"[{attempt+1}/{max_retries}] {e} — retrying in 2 seconds...")
                    time.sleep(2)
                else:
                    logger.error(f"Error executing command {cmd.type}: {e}")
                    break
@app.post("/execute")
async def execute_commands(req: Request, background_tasks: BackgroundTasks):
    """
    Receives commands and processes them. To avoid blocking the J.A.R.V.I.S LLM
    event loop, we run them as a background task.
    
    IMPORTANT: Normalizes Planner's 'action' field to Python's 'type' field.
    Also maps Planner action names (open_url) to Python action names (open_tab).
    """
    # Accept request and let get_driver() handle lazy init on first command
    body = await req.json()
    raw_commands = body.get("commands", [])
    
    # Action name translation map: Planner → Python Agent
    ACTION_MAP = {
        "open_url": "open_tab",
        "click": "click",
        "type": "type",
        "type_secure": "type_secure",
        "scroll": "scroll",
        "press": "press",
        "youtube_search": "search_site",
        "youtube_click_video": "search_site",
        "youtube_like": "youtube_like",
        "youtube_subscribe": "youtube_subscribe",
        "youtube_comment": "youtube_comment",
        "open_tab": "open_tab",
        "switch_tab": "switch_tab",
        "close_tab": "close_tab",
        "analyze_page": "analyze_page",
        "media_control": "media_control",
        "skip_ad": "skip_ad",
        "go_back": "go_back",
        "wait": "wait",
        "close_browser": "close_browser",
    }
    
    normalized = []
    for raw in raw_commands:
        # Normalize: use 'action' field if 'type' is missing
        action_key = raw.get("type") or raw.get("action") or ""
        # Map to known Python type
        python_type = ACTION_MAP.get(action_key, action_key)
        
        cmd_dict = {
            "type": python_type,
            "url": raw.get("url"),
            "query": raw.get("query"),
            "site": raw.get("site"),
            "target_tab": raw.get("target_tab"),
            "force_new_tab": raw.get("force_new_tab", False),
            "action": raw.get("action_param") or raw.get("media_action"),
            "seconds": raw.get("seconds"),
            "direction": raw.get("direction"),
            "amount": raw.get("amount"),
            "jarvis_id": raw.get("jarvis_id"),
            "text": raw.get("text"),
        }
        
        # For youtube_search, set site=youtube and query from 'query'
        if action_key == "youtube_search":
            cmd_dict["site"] = "youtube"
            cmd_dict["query"] = raw.get("query", "")
            
        try:
            normalized.append(BrowserCommand(**cmd_dict))
        except Exception as e:
            logger.error(f"Failed to normalize command {raw}: {e}")
    
    if not normalized:
        raise HTTPException(status_code=422, detail="No valid commands after normalization")
    
    # THIS WAS THE BUG — commands were accepted but never executed!
    background_tasks.add_task(process_commands, normalized)
         
    return {"status": "accepted", "message": f"Processing {len(normalized)} commands in background."}


from selenium.webdriver.common.action_chains import ActionChains
import time
import json

def safe_click(element_info: dict):
    d = get_driver()
    if not d:
        return {"success": False, "action": "click", "target": element_info.get("text"), "details": "Driver not available"}
        
    jarvis_id = element_info.get('id')
    selector = element_info.get('selector')
    xpath = element_info.get('xpath')
    text = element_info.get('text')
    
    target_name = text or str(jarvis_id)
    old_url = d.current_url
    
    max_retries = 3
    for attempt in range(max_retries):
        try:
            el = None
            if jarvis_id:
                try: el = d.find_element(By.CSS_SELECTOR, f'[jarvis_id="{jarvis_id}"]')
                except: pass
            if not el and selector:
                try: el = d.find_element(By.CSS_SELECTOR, selector)
                except: pass
            if not el and xpath:
                try: el = d.find_element(By.XPATH, xpath)
                except: pass
            if not el and text:
                try: el = d.find_element(By.XPATH, f"//*[contains(text(), '{text}')]")
                except: pass
                    
            if not el:
                logger.warning(f"Attempt {attempt+1}: Element {target_name} not found by any locator")
                time.sleep(1)
                continue
                
            d.execute_script("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", el)
            time.sleep(0.5)
            
            methods = ['normal', 'js', 'action_chains']
            clicked = False
            used_method = ""
            
            for method in methods:
                try:
                    if method == 'normal':
                        el.click()
                    elif method == 'js':
                        d.execute_script("arguments[0].click();", el)
                    elif method == 'action_chains':
                        ActionChains(d).move_to_element(el).click().perform()
                    
                    clicked = True
                    used_method = method
                    break
                except Exception as click_err:
                    continue
                    
            if not clicked:
                logger.warning(f"Attempt {attempt+1}: All click methods failed for {target_name}")
                time.sleep(1)
                continue
                
            time.sleep(1.5)
            new_url = d.current_url
            
            is_element_gone = False
            try:
                if jarvis_id:
                    el_check = d.find_element(By.CSS_SELECTOR, f'[jarvis_id="{jarvis_id}"]')
                    is_element_gone = not el_check.is_displayed()
                else:
                    is_element_gone = True
            except:
                is_element_gone = True
                
            if new_url != old_url or is_element_gone:
                result = {"success": True, "action": "click", "target": target_name, "details": f"Success via {used_method} click (Attempt {attempt+1})"}
                logger.info(f"ACTION RESULT: {json.dumps(result)}")
                return result
            else:
                logger.warning(f"Attempt {attempt+1}: Click executed but DOM/URL state unchanged")
                
        except Exception as e:
            logger.warning(f"Attempt {attempt+1}: Safe click error: {e}")
            time.sleep(1)
            
    result = {"success": False, "action": "click", "target": target_name, "details": "Exhausted all retries"}
    logger.info(f"ACTION RESULT: {json.dumps(result)}")
    return result

DOM_EXTRACTOR_JS = """
function getInteractiveElements() {
    let result = { elements: [] };
    let idCounter = 1;
    
    const selectors = 'a, button, input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"]), h1, h2, p';
    const nodes = document.querySelectorAll(selectors);
    
    function getXPath(element) {
        if (element.id !== '') return 'id("' + element.id + '")';
        if (element === document.body) return element.tagName;
        let ix = 0;
        let siblings = element.parentNode ? element.parentNode.childNodes : [];
        for (let i = 0; i < siblings.length; i++) {
            let sibling = siblings[i];
            if (sibling === element) return getXPath(element.parentNode) + '/' + element.tagName + '[' + (ix + 1) + ']';
            if (sibling.nodeType === 1 && sibling.tagName === element.tagName) ix++;
        }
    }
    
    function getCSSSelector(el) {
        if (el.tagName.toLowerCase() == "html") return "html";
        let str = el.tagName.toLowerCase();
        str += (el.id != "") ? "#" + el.id : "";
        if (el.className && typeof el.className === 'string') {
            let classes = el.className.trim().split(/\s+/);
            for (let i = 0; i < classes.length; i++) {
                if (classes[i]) str += "." + classes[i];
            }
        }
        return str;
    }

    nodes.forEach(node => {
        const rect = node.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0 && 
                          window.getComputedStyle(node).visibility !== 'hidden' && 
                          window.getComputedStyle(node).display !== 'none';
        
        if (node.tagName.toLowerCase() === 'input' && node.type === 'hidden') return;
        
        if (isVisible) {
            node.setAttribute('jarvis_id', idCounter);
            
            let text = node.innerText || node.value || node.getAttribute('aria-label') || node.getAttribute('placeholder') || node.getAttribute('title') || '';
            text = text.trim().substring(0, 80).replace(/\\n/g, ' ');
            
            let type = node.tagName.toLowerCase();
            let role = node.getAttribute('role') || type;
            let selector = getCSSSelector(node);
            let xpath = getXPath(node);
            
            if (text || ['input', 'select', 'textarea'].includes(type) || ['button', 'link'].includes(role) || type === 'button' || type === 'a') {
                result.elements.push({
                    id: idCounter,
                    text: text,
                    role: role,
                    selector: selector,
                    xpath: xpath
                });
                idCounter++;
            }
        }
    });

    result.elements = result.elements.slice(0, 100);
    return JSON.stringify(result);
}
return getInteractiveElements();
"""

class AnalyzeRequest(BaseModel):
    target_tab: Optional[str] = None

@app.post("/analyze")
async def analyze_page(req: AnalyzeRequest):
    """
    Scans the current page and returns a numbered list of interactive elements.
    Lazy-initializes the browser if not already running.
    """
    try:
        d = get_driver() # lazy init: spins up browser on first analyze call
        
        if req.target_tab:
            handle = get_tab_by_name(req.target_tab)
            if handle:
                d.switch_to.window(handle)
                
        # Wait for page to be mostly loaded
        d.execute_script("return document.readyState") == "complete"
        
        result_text = d.execute_script(DOM_EXTRACTOR_JS)
        
        if not result_text:
            return {"status": "success", "elements": {"status": "empty", "message": "No interactive elements found."}}
            
        import json
        try:
            parsed_elements = json.loads(result_text)
            global last_extracted_elements
            last_extracted_elements = parsed_elements.get("elements", [])
            
            # STRIP HEAVY DATA TO SAVE LLM TOKENS
            # We keep selector/xpath in last_extracted_elements for safe_click, 
            # but don't send them back to Node/Groq.
            llm_payload = []
            for el in last_extracted_elements:
                llm_payload.append({
                    "id": el.get("id"),
                    "text": el.get("text"),
                    "role": el.get("role")
                })
                
            return {"status": "success", "url": d.current_url, "title": d.title, "elements": llm_payload}
        except:
            return {"status": "success", "elements": {"error": "Failed to parse elements payload"}}
        
    except Exception as e:
        logger.error(f"Error analyzing page: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

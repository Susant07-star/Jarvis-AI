import asyncio
import logging
from typing import List, Optional
from fastapi import FastAPI, BackgroundTasks, HTTPException
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

class BrowserCommand(BaseModel):
    type: str # 'open_tab' | 'search_site' | 'media_control' | 'scroll' | 'analyze_page' | 'click' | 'type' | 'wait'
    url: Optional[str] = None
    query: Optional[str] = None
    site: Optional[str] = None
    target_tab: Optional[str] = None
    force_new_tab: Optional[bool] = False
    action: Optional[str] = None # 'play' | 'pause' | 'skip_forward' | 'skip_backward' | 'seek'
    seconds: Optional[float] = None
    direction: Optional[str] = None # 'up' | 'down'
    amount: Optional[float] = None
    jarvis_id: Optional[int] = None # ID of the element to interact with
    text: Optional[str] = None # Text to type

class CommandRequest(BaseModel):
    commands: List[BrowserCommand]

def init_driver():
    global driver
    if driver is None:
        logger.info("Initializing Selenium WebDriver (undetected-chromedriver)...")
        options = uc.ChromeOptions()
        # Use a dedicated profile for JARVIS so login persists
        profile_dir = os.path.join(os.getcwd(), "chrome_profile")
        options.add_argument(f"--user-data-dir={profile_dir}")
        options.add_argument("--profile-directory=Default")
        
        # Optimize for automation/media
        options.add_argument('--autoplay-policy=no-user-gesture-required')
        
        try:
            driver = uc.Chrome(options=options, use_subprocess=True)
            # Prevent infinite hanging on slow websites
            driver.set_page_load_timeout(30)
            logger.info("WebDriver initialized successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize WebDriver: {e}")
            raise e

@app.on_event("startup")
async def startup_event():
    # Run initialization in a thread block since it's blocking
    await asyncio.to_thread(init_driver)

@app.on_event("shutdown")
def shutdown_event():
    global driver
    if driver is not None:
        logger.info("Shutting down WebDriver...")
        try:
            driver.quit()
        except:
            pass
        driver = None

def get_tab_by_name(target_name: Optional[str]) -> Optional[str]:
    """Finds a window handle based on matching title or URL to target_name"""
    if not driver or not target_name:
        return None
        
    current = driver.current_window_handle
    for handle in driver.window_handles:
        driver.switch_to.window(handle)
        title = driver.title.lower()
        url = driver.current_url.lower()
        target = target_name.lower()
        if target in title or target in url:
             return handle
    driver.switch_to.window(current)
    return None

def execute_single_command(cmd: BrowserCommand):
    global driver
    if not driver:
        raise Exception("WebDriver not initialized")
        
    logger.info(f"Executing command: {cmd.type} - {cmd.model_dump_json()}")
    
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
            driver.switch_to.window(handle)
            driver.get(url)
        else:
            # Open new tab
            if len(driver.window_handles) == 1 and driver.current_url == "data:,":
                 driver.get(url)
            else:
                 driver.switch_to.new_window('tab')
                 driver.get(url)
                 
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
            driver.switch_to.window(handle)
            driver.get(url)
        else:
            # New tab
            if len(driver.window_handles) == 1 and driver.current_url == "data:,":
                 driver.get(url)
            else:
                 driver.switch_to.new_window('tab')
                 driver.get(url)
                 
            if "youtube" in target:
                try:
                    WebDriverWait(driver, 5).until(
                        EC.presence_of_element_located((By.CSS_SELECTOR, "ytd-video-renderer a#video-title"))
                    )
                    driver.execute_script("document.querySelector('ytd-video-renderer a#video-title').click();")
                except Exception as e:
                    logger.warning(f"Failed to auto-play first video: {e}")
                    
    elif cmd.type == "media_control":
        # Make sure we are on the right tab if specified, but if not just try current tab
        if target_name:
            handle = get_tab_by_name(target_name)
            if handle:
                driver.switch_to.window(handle)
                
        # Inject Javascript to control the standard HTML5 video player
        js_code = ""
        action = cmd.action
        
        # Ensure we have a video element first
        check_js = "return document.querySelector('video') !== null"
        if not driver.execute_script(check_js):
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
            driver.execute_script(js_code)
            
    elif cmd.type == "scroll":
        if target_name:
            handle = get_tab_by_name(target_name)
            if handle:
                driver.switch_to.window(handle)
                
        amount = cmd.amount or 500
        if cmd.direction == "up":
            amount = -amount
            
        driver.execute_script(f"window.scrollBy(0, {amount});")
        
    elif cmd.type == "click":
        if cmd.jarvis_id is not None:
            script = f"""
                const el = document.querySelector('[jarvis_id="{cmd.jarvis_id}"]');
                if (el) {{
                    el.scrollIntoView({{behavior: 'smooth', block: 'center'}});
                    // Slight delay to allow scrolling
                    setTimeout(() => el.click(), 300);
                    return true;
                }}
                return false;
            """
            result = driver.execute_script(script)
            if not result:
                raise Exception(f"Element with jarvis_id {cmd.jarvis_id} not found yet")
    elif cmd.type == "type":
        if cmd.jarvis_id is not None and cmd.text is not None:
            # Escape double quotes and backslashes in text for JS
            safe_text = cmd.text.replace('\\', '\\\\').replace('"', '\\"')
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
            result = driver.execute_script(script)
            if not result:
                raise Exception(f"Element with jarvis_id {cmd.jarvis_id} not found yet")
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
async def execute_commands(req: CommandRequest, background_tasks: BackgroundTasks):
    """
    Receives commands and processes them. To avoid blocking the J.A.R.V.I.S LLM
    event loop, we run them as a background task.
    """
    if driver is None:
         raise HTTPException(status_code=503, detail="WebDriver not ready")
    
    # THIS WAS THE BUG — commands were accepted but never executed!
    background_tasks.add_task(process_commands, req.commands)
         
    return {"status": "accepted", "message": f"Processing {len(req.commands)} commands in background."}

DOM_EXTRACTOR_JS = """
function getInteractiveElements() {
    let elements = [];
    let idCounter = 1;
    const viewportHeight = window.innerHeight;
    
    // Selectors for interactive elements
    const selectors = 'a, button, input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])';
    const nodes = document.querySelectorAll(selectors);
    
    nodes.forEach(node => {
        // Check if visible
        const rect = node.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(node).visibility !== 'hidden' && window.getComputedStyle(node).display !== 'none';
        
        // Skip hidden inputs
        if (node.tagName.toLowerCase() === 'input' && node.type === 'hidden') return;
        
        if (isVisible) {
            node.setAttribute('jarvis_id', idCounter);
            
            let text = node.innerText || node.value || node.getAttribute('aria-label') || node.getAttribute('placeholder') || node.getAttribute('title') || '';
            text = text.trim().substring(0, 120).replace(/\\n/g, ' ');
            
            // Determine element type
            let type = node.tagName.toLowerCase();
            if (type === 'a') type = 'LINK';
            else if (type === 'button' || node.getAttribute('role') === 'button') type = 'BUTTON';
            else if (type === 'input') type = 'INPUT[' + (node.type || 'text') + ']';
            else if (type === 'select') type = 'SELECT';
            else if (type === 'textarea') type = 'TEXTAREA';
            else type = type.toUpperCase();
            
            // Get href for links
            let href = '';
            if (node.tagName.toLowerCase() === 'a' && node.href) {
                href = ' -> ' + node.href.substring(0, 80);
            }
            
            // Position hint (top/middle/bottom of viewport)
            let pos = '';
            if (rect.top < viewportHeight * 0.33) pos = '[TOP]';
            else if (rect.top < viewportHeight * 0.66) pos = '[MID]';
            else pos = '[BOT]';
            
            // Only add if it has identifiable text or is an input
            if (text || type.includes('INPUT') || type === 'SELECT' || type === 'TEXTAREA') {
                elements.push('[' + idCounter + '] ' + pos + ' ' + type + ': "' + text + '"' + href);
                idCounter++;
            }
        }
    });
    
    return elements.slice(0, 80).join('\\n');
}
return getInteractiveElements();
"""

class AnalyzeRequest(BaseModel):
    target_tab: Optional[str] = None

@app.post("/analyze")
async def analyze_page(req: AnalyzeRequest):
    """
    Scans the current page and returns a numbered list of interactive elements.
    """
    global driver
    if driver is None:
         raise HTTPException(status_code=503, detail="WebDriver not ready")
         
    try:
        if req.target_tab:
            handle = get_tab_by_name(req.target_tab)
            if handle:
                driver.switch_to.window(handle)
                
        # Wait for page to be mostly loaded
        driver.execute_script("return document.readyState") == "complete"
        
        result_text = driver.execute_script(DOM_EXTRACTOR_JS)
        
        if not result_text:
            return {"status": "success", "elements": "No interactive elements found on the screen."}
            
        current_url = driver.current_url
        current_title = driver.title
        
        map_response = f"Current URL: {current_url}\\nPage Title: {current_title}\\n\\nVisible Interactive Elements:\\n{result_text}"
        return {"status": "success", "elements": map_response}
        
    except Exception as e:
        logger.error(f"Error analyzing page: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

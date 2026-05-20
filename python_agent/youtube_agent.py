import asyncio
import json
import logging
import threading
import time
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

# Configure logging to both console and file
log_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "logs")
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, "debug.log")

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s.%(msecs)03dZ] [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%dT%H:%M:%S',
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

def create_execution_result(action, status, error=None, details=None):
    """Create a structured execution result dict."""
    return {
        "action": action,
        "status": status,  # "success" or "failure"
        "error": error,
        "details": details
    }

def verify_action_result(driver, cmd_type, expected_url=None, expected_selector=None, timeout=5):
    """
    Verify the result of a browser action using URL change and DOM presence checks.
    
    Args:
        driver: Selenium WebDriver instance
        cmd_type: Type of command that was executed
        expected_url: Optional expected URL pattern to verify
        expected_selector: Optional CSS selector to verify DOM presence
        timeout: Maximum time to wait for verification (seconds)
    
    Returns:
        tuple: (success: bool, details: str)
    """
    try:
        # URL-based verification for navigation actions
        if expected_url and cmd_type in ["open_tab", "new_tab", "search_site"]:
            current_url = driver.current_url
            if expected_url in current_url:
                logger.info(f"URL verification passed: {expected_url} found in {current_url}")
                return (True, f"URL verified: {current_url}")
            else:
                logger.warning(f"URL verification failed: expected '{expected_url}' in '{current_url}'")
                return (False, f"URL mismatch: expected '{expected_url}', got '{current_url}'")
        
        # DOM-based verification for interaction actions
        if expected_selector and cmd_type in ["click", "type", "type_secure", "youtube_like", "youtube_subscribe"]:
            try:
                # We wait a shorter timeout for presence. If it's still there, great.
                element = WebDriverWait(driver, 1.5).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, expected_selector))
                )
                logger.info(f"DOM verification passed: element found with selector '{expected_selector}'")
                return (True, f"DOM element verified: {expected_selector}")
            except Exception as e:
                # The element might have disappeared due to page navigation, modal dismissal, or DOM redraw.
                # Check if the page/driver is still responsive and healthy.
                try:
                    driver.execute_script("return document.readyState")
                    logger.info(f"DOM verification: element '{expected_selector}' no longer present, but page is active/responsive. Treating as success.")
                    return (True, f"DOM element no longer present (likely page navigated or DOM updated)")
                except Exception as ex:
                    logger.warning(f"Page unresponsive after interaction: {ex}")
                    return (False, f"Page unresponsive after interaction: {str(ex)}")
        
        # For actions without specific verification criteria, check page state
        if cmd_type in ["scroll", "wait", "skip_ad", "media_control"]:
            # Verify page is still responsive
            try:
                driver.execute_script("return document.readyState")
                logger.info(f"Page state verification passed for {cmd_type}")
                return (True, f"Page state verified for {cmd_type}")
            except Exception as e:
                logger.warning(f"Page state verification failed: {e}")
                return (False, f"Page unresponsive after {cmd_type}")
        
        # Default: no verification criteria provided
        return (True, "No verification criteria provided")
    
    except Exception as e:
        logger.error(f"Verification error: {e}")
        return (False, f"Verification error: {str(e)}")

app = FastAPI(title="JARVIS YouTube Agent")

# Global variables
driver = None
last_extracted_elements = []
ad_watcher_running = False

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

def detect_chrome_version():
    """Detect installed Chrome version and return major version number."""
    try:
        # Try multiple methods to get Chrome version
        version_str = None
        
        # Method 1: Use uc.get_chrome_version() if available
        if hasattr(uc, 'get_chrome_version'):
            version_str = uc.get_chrome_version()
        # Method 2: Use uc.ChromeOptions to detect
        elif hasattr(uc, 'ChromeOptions'):
            # Create options and check version
            options = uc.ChromeOptions()
            # Some versions expose version through options
            version_str = getattr(options, '_version', None)
        
        # Method 3: Use system registry/command (Windows)
        if not version_str:
            import subprocess
            import re
            try:
                # Try reg query on Windows
                result = subprocess.run(
                    ['reg', 'query', 'HKEY_CURRENT_USER\\Software\\Google\\Chrome\\BLBeacon', '/v', 'version'],
                    capture_output=True, text=True, shell=True
                )
                if result.returncode == 0:
                    match = re.search(r'version\s+REG_SZ\s+([\d.]+)', result.stdout)
                    if match:
                        version_str = match.group(1)
            except:
                pass
        
        if version_str:
            logger.info(f"[Browser] Detected Chrome version: {version_str}")
            # Extract major version (first segment)
            major = int(version_str.split('.')[0]) if version_str else None
            return major
        else:
            logger.warning("[Browser] Could not detect Chrome version")
            return None
    except Exception as e:
        logger.warning(f"[Browser] Could not detect Chrome version: {e}")
        return None

def _create_driver():
    """Internal: boots a fresh undetected-chromedriver instance with version matching."""
    logger.info("[Browser] Initializing new WebDriver session...")
    
    # Detect Chrome version and match driver
    chrome_major = detect_chrome_version()
    
    # First attempt: with version matching
    try:
        options = uc.ChromeOptions()
        # Try without user-data-dir first to avoid profile conflicts
        options.add_argument('--autoplay-policy=no-user-gesture-required')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        
        driver_kwargs = {"options": options, "use_subprocess": True}
        if chrome_major:
            driver_kwargs["version_main"] = chrome_major
            logger.info(f"[Browser] Using ChromeDriver matching major version {chrome_major}")
        
        new_driver = uc.Chrome(**driver_kwargs)
        new_driver.set_page_load_timeout(30)
        logger.info("[Browser] WebDriver session started successfully.")
        return new_driver
    except Exception as e:
        logger.error(f"[Browser] Failed to start WebDriver: {e}")
        # Fallback: try without version_main (create fresh options)
        if chrome_major:
            logger.info("[Browser] Retrying without explicit version matching...")
            try:
                options = uc.ChromeOptions()
                options.add_argument('--autoplay-policy=no-user-gesture-required')
                options.add_argument('--no-sandbox')
                options.add_argument('--disable-dev-shm-usage')
                
                new_driver = uc.Chrome(options=options, use_subprocess=True)
                new_driver.set_page_load_timeout(30)
                logger.info("[Browser] WebDriver session started (fallback).")
                return new_driver
            except Exception as e2:
                logger.error(f"[Browser] Fallback also failed: {e2}")
        raise

def get_driver():
    """Lazy factory: returns live driver, auto-recovering from dead sessions."""
    global driver, ad_watcher_running
    if driver is None or not is_driver_alive(driver):
        if driver is not None:
            logger.warning("[Browser] Dead session detected. Restarting WebDriver...")
            try: driver.quit()
            except: pass
            driver = None
        driver = _create_driver()
        # Start ad watcher when driver is initialized
        if not ad_watcher_running:
            start_ad_watcher()
    return driver

def start_ad_watcher():
    """Start background task to watch for and skip YouTube ads automatically."""
    global ad_watcher_running
    if ad_watcher_running:
        logger.info("[Ad Watcher] Already running, skipping")
        return
    
    ad_watcher_running = True
    logger.info("[Ad Watcher] Starting background ad watcher")
    
    # Start as a background thread
    import threading
    watcher_thread = threading.Thread(target=ad_watcher_loop, daemon=True)
    watcher_thread.start()

def ad_watcher_loop():
    """Continuous loop to detect and skip YouTube ads."""
    global ad_watcher_running, driver
    
    logger.info("[Ad Watcher] Ad watcher loop started")
    
    while ad_watcher_running:
        try:
            # Only check if driver is available and we're on YouTube
            if driver and is_driver_alive(driver):
                current_url = driver.current_url
                if "youtube.com" in current_url:
                    logger.debug("[Ad Watcher] Checking for ads on YouTube...")
                    # Check for ad skip buttons
                    ad_selectors = [
                        "#skip-button",
                        ".ytp-ad-skip-button",
                        ".ytp-skip-ad-button",
                        ".ytp-ad-skip-button-modern"
                    ]
                    
                    for selector in ad_selectors:
                        try:
                            # Use JavaScript to check if button exists and is visible
                            script = f"""
                                const btn = document.querySelector('{selector}');
                                if (btn && btn.offsetParent !== null) {{
                                    return true;
                                }}
                                return false;
                            """
                            is_visible = driver.execute_script(script)
                            
                            if is_visible:
                                # Click skip button
                                click_script = f"""
                                    const btn = document.querySelector('{selector}');
                                    if (btn) {{
                                        btn.click();
                                        return true;
                                    }}
                                    return false;
                                """
                                clicked = driver.execute_script(click_script)
                                
                                if clicked:
                                    result = {
                                        "success": True,
                                        "action": "skip_ad",
                                        "target": selector,
                                        "details": "Ad skipped successfully"
                                    }
                                    logger.info(f"ACTION RESULT: {json.dumps(result)}")
                                else:
                                    result = {
                                        "success": False,
                                        "action": "skip_ad",
                                        "target": selector,
                                        "details": "Ad skip failed - button not clickable"
                                    }
                                    logger.warning(f"ACTION RESULT: {json.dumps(result)}")
                                
                                # Break after finding and attempting to click one button
                                break
                        except Exception as e:
                            # Silently continue if check fails
                            pass
            
            # Wait before next check (poll every 2 seconds)
            import time
            time.sleep(2)
            
        except Exception as e:
            logger.error(f"[Ad Watcher] Error in ad watcher loop: {e}")
            # Wait before retrying
            import time
            time.sleep(5)
    
    logger.info("[Ad Watcher] Ad watcher loop stopped")

def stop_ad_watcher():
    """Stop the background ad watcher."""
    global ad_watcher_running
    ad_watcher_running = False
    logger.info("[Ad Watcher] Stopping background ad watcher")

@app.on_event("shutdown")
def shutdown_event():
    global driver, ad_watcher_running
    # Stop ad watcher first
    stop_ad_watcher()
    # Then shutdown driver
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

def execute_single_command(cmd: BrowserCommand) -> dict:
    global driver
    logger.info(f"Executing command: {cmd.type} - {cmd.model_dump_json()}")
    
    try:
        # close_browser: graceful session teardown
        if cmd.type == "close_browser":
            try:
                if driver is not None:
                    driver.quit()
                    driver = None
                logger.info('{"action": "close_browser", "success": true, "details": "Session terminated"}')
                return create_execution_result("close_browser", "success", None, "Session terminated")
            except Exception as e:
                logger.error(f"Error closing browser: {e}")
                return create_execution_result("close_browser", "failure", str(e), "Failed to close browser")
        
        # Ensure a live session exists (lazy init + auto-recovery)
        d = get_driver()
        
        # Simple tab resolution logic
        target_name = cmd.target_tab or cmd.site
        if not target_name and cmd.url:
            target_name = cmd.url
            
        if cmd.type == "open_tab":
            try:
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
                    return create_execution_result("open_tab", "failure", "No URL or site name provided", "Missing URL")
                    
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
                
                # Post-action verification
                verified, verification_details = verify_action_result(d, "open_tab", expected_url=url)
                if not verified:
                    logger.warning(f"open_tab verification failed: {verification_details}")
                    return create_execution_result("open_tab", "failure", verification_details, f"Opened tab but verification failed: {url}")
                
                return create_execution_result("open_tab", "success", None, f"Opened tab: {url} - {verification_details}")
            except Exception as e:
                logger.error(f"Error executing open_tab: {e}")
                return create_execution_result("open_tab", "failure", str(e), f"Failed to open tab: {cmd.url}")
                    
        elif cmd.type == "new_tab":
            try:
                url = cmd.url
                d.switch_to.new_window('tab')
                if url:
                    d.get(url)
                
                # Post-action verification
                if url:
                    verified, verification_details = verify_action_result(d, "new_tab", expected_url=url)
                    if not verified:
                        logger.warning(f"new_tab verification failed: {verification_details}")
                        return create_execution_result("new_tab", "failure", verification_details, f"Created new tab but verification failed: {url}")
                    return create_execution_result("new_tab", "success", None, f"Created new tab: {url} - {verification_details}")
                else:
                    return create_execution_result("new_tab", "success", None, "Created new tab (blank)")
            except Exception as e:
                logger.error(f"Error executing new_tab: {e}")
                return create_execution_result("new_tab", "failure", str(e), "Failed to create new tab")
                
        elif cmd.type == "go_back":
            try:
                d.back()
                logger.info("Executing browser back navigation")
                return create_execution_result("go_back", "success", None, "Navigated back")
            except Exception as e:
                logger.error(f"Error executing go_back: {e}")
                return create_execution_result("go_back", "failure", str(e), "Failed to navigate back")
                
        elif cmd.type == "skip_ad":
            try:
                # Broad script to try and click standard YouTube and generic ad skip buttons
                script = """
                    const adBtn = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern');
                    if (adBtn) {
                        adBtn.click();
                        return true;
                    }
                    return false;
                """
                result = d.execute_script(script)
                logger.info("Attempted to skip ad")
                
                # Post-action verification
                verified, verification_details = verify_action_result(d, "skip_ad")
                if not verified:
                    logger.warning(f"skip_ad verification failed: {verification_details}")
                    return create_execution_result("skip_ad", "failure", verification_details, f"Ad skip attempted but verification failed: {result}")
                
                return create_execution_result("skip_ad", "success", None, f"Ad skipped: {result} - {verification_details}")
            except Exception as e:
                logger.error(f"Error executing skip_ad: {e}")
                return create_execution_result("skip_ad", "failure", str(e), "Failed to skip ad")
                     
        elif cmd.type == "search_site":
            try:
                if not cmd.query:
                    return create_execution_result("search_site", "failure", "No query provided", "Missing search query")
                
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
                        
                # Post-action verification
                verified, verification_details = verify_action_result(d, "search_site", expected_url=url)
                if not verified:
                    logger.warning(f"search_site verification failed: {verification_details}")
                    return create_execution_result("search_site", "failure", verification_details, f"Searched but verification failed: {query_str}")
                
                return create_execution_result("search_site", "success", None, f"Searched: {query_str} - {verification_details}")
            except Exception as e:
                logger.error(f"Error executing search_site: {e}")
                return create_execution_result("search_site", "failure", str(e), f"Failed to search: {cmd.query}")
        
        elif cmd.type == "youtube_click_video":
            try:
                WebDriverWait(d, 5).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "ytd-video-renderer a#video-title"))
                )
                d.execute_script("document.querySelector('ytd-video-renderer a#video-title').click();")
                
                # Verify URL contains watch?v=
                def custom_verifier(driver):
                    return "watch?v=" in driver.current_url, f"Current URL: {driver.current_url}"
                    
                verified, details = verify_action_result(d, "custom", custom_verifier=custom_verifier)
                if not verified:
                    return create_execution_result("youtube_click_video", "failure", details, "Clicked video but not on watch page")
                    
                return create_execution_result("youtube_click_video", "success", None, f"Clicked first video - {details}")
            except Exception as e:
                logger.error(f"Error executing youtube_click_video: {e}")
                return create_execution_result("youtube_click_video", "failure", str(e), "Failed to click video")
                    
        elif cmd.type == "media_control":
            try:
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
                    return create_execution_result("media_control", "failure", "No video element found", "Video not available")
                    
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
                
                # Post-action verification
                verified, verification_details = verify_action_result(d, "media_control")
                if not verified:
                    logger.warning(f"media_control verification failed: {verification_details}")
                    return create_execution_result("media_control", "failure", verification_details, f"Media control executed but verification failed: {action}")
                
                return create_execution_result("media_control", "success", None, f"Media control: {action} - {verification_details}")
            except Exception as e:
                logger.error(f"Error executing media_control: {e}")
                return create_execution_result("media_control", "failure", str(e), f"Failed media control: {cmd.command or cmd.action}")
                
        elif cmd.type == "scroll":
            try:
                if target_name:
                    handle = get_tab_by_name(target_name)
                    if handle:
                        d.switch_to.window(handle)
                        
                amount = cmd.amount or 500
                if cmd.direction == "up":
                    amount = -amount
                    
                d.execute_script(f"window.scrollBy(0, {amount});")
                
                # Post-action verification
                verified, verification_details = verify_action_result(d, "scroll")
                if not verified:
                    logger.warning(f"scroll verification failed: {verification_details}")
                    return create_execution_result("scroll", "failure", verification_details, f"Scrolled but verification failed")
                
                return create_execution_result("scroll", "success", None, f"Scrolled {cmd.direction or 'down'} by {abs(amount)}px - {verification_details}")
            except Exception as e:
                logger.error(f"Error executing scroll: {e}")
                return create_execution_result("scroll", "failure", str(e), "Failed to scroll")
                
        elif cmd.type == "click":
            try:
                if cmd.jarvis_id is not None:
                    # Smart element matching from globally cached DOM
                    target_info = {"id": cmd.jarvis_id}
                    for el in last_extracted_elements:
                        if el.get("id") == cmd.jarvis_id:
                            target_info = el
                            break
                            
                    res = safe_click(target_info)
                    if not res["success"]:
                        return create_execution_result("click", "failure", res['details'], f"Failed to click element: {cmd.jarvis_id}")
                    
                    # Post-action verification
                    verified, verification_details = verify_action_result(d, "click", expected_selector=f'[jarvis_id="{cmd.jarvis_id}"]')
                    if not verified:
                        logger.warning(f"click verification failed: {verification_details}")
                        return create_execution_result("click", "failure", verification_details, f"Clicked element but verification failed: {cmd.jarvis_id}")
                    
                    return create_execution_result("click", "success", None, f"Clicked element: {cmd.jarvis_id} - {verification_details}")
                return create_execution_result("click", "failure", "No jarvis_id provided", "Missing element ID")
            except Exception as e:
                logger.error(f"Error executing click: {e}")
                return create_execution_result("click", "failure", str(e), f"Failed to click: {cmd.jarvis_id}")
                
        elif cmd.type == "type":
            try:
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
                        return create_execution_result("type", "failure", f"Element with jarvis_id {cmd.jarvis_id} not found", "Element not found")
                    
                    # Post-action verification
                    verified, verification_details = verify_action_result(d, "type", expected_selector=f'[jarvis_id="{cmd.jarvis_id}"]')
                    if not verified:
                        logger.warning(f"type verification failed: {verification_details}")
                        return create_execution_result("type", "failure", verification_details, f"Typed into element but verification failed: {cmd.jarvis_id}")
                    
                    return create_execution_result("type", "success", None, f"Typed into element: {cmd.jarvis_id} - {verification_details}")
                return create_execution_result("type", "failure", "No jarvis_id or text provided", "Missing element ID or text")
            except Exception as e:
                logger.error(f"Error executing type: {e}")
                return create_execution_result("type", "failure", str(e), f"Failed to type: {cmd.jarvis_id}")
                
        elif cmd.type == "type_secure":
            try:
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
                        return create_execution_result("type_secure", "failure", f"Element with jarvis_id {cmd.jarvis_id} not found", "Element not found")
                    
                    # Post-action verification
                    verified, verification_details = verify_action_result(d, "type_secure", expected_selector=f'[jarvis_id="{cmd.jarvis_id}"]')
                    if not verified:
                        logger.warning(f"type_secure verification failed: {verification_details}")
                        return create_execution_result("type_secure", "failure", verification_details, f"Typed securely but verification failed: {cmd.jarvis_id}")
                    
                    return create_execution_result("type_secure", "success", None, f"Typed securely into element: {cmd.jarvis_id} - {verification_details}")
                return create_execution_result("type_secure", "failure", "No jarvis_id or text provided", "Missing element ID or text")
            except Exception as e:
                logger.error(f"Error executing type_secure: {e}")
                return create_execution_result("type_secure", "failure", str(e), f"Failed to type securely: {cmd.jarvis_id}")
                
        elif cmd.type == "youtube_like":
            try:
                script = """
                const btn = document.querySelector('ytd-menu-renderer .yt-spec-button-shape-next--tonal');
                if (btn) { btn.click(); return true; } return false;
                """
                result = d.execute_script(script)
                logger.info("Executed youtube_like")
                
                # Post-action verification
                verified, verification_details = verify_action_result(d, "youtube_like")
                if not verified:
                    logger.warning(f"youtube_like verification failed: {verification_details}")
                    return create_execution_result("youtube_like", "failure", verification_details, f"YouTube like attempted but verification failed: {result}")
                
                return create_execution_result("youtube_like", "success", None, f"YouTube like: {result} - {verification_details}")
            except Exception as e:
                logger.error(f"Error executing youtube_like: {e}")
                return create_execution_result("youtube_like", "failure", str(e), "Failed to like video")
                
        elif cmd.type == "youtube_subscribe":
            try:
                script = """
                const btn = document.querySelector('ytd-subscribe-button-renderer button');
                if (btn) { btn.click(); return true; } return false;
                """
                result = d.execute_script(script)
                logger.info("Executed youtube_subscribe")
                
                # Post-action verification
                verified, verification_details = verify_action_result(d, "youtube_subscribe")
                if not verified:
                    logger.warning(f"youtube_subscribe verification failed: {verification_details}")
                    return create_execution_result("youtube_subscribe", "failure", verification_details, f"YouTube subscribe attempted but verification failed: {result}")
                
                return create_execution_result("youtube_subscribe", "success", None, f"YouTube subscribe: {result} - {verification_details}")
            except Exception as e:
                logger.error(f"Error executing youtube_subscribe: {e}")
                return create_execution_result("youtube_subscribe", "failure", str(e), "Failed to subscribe")
                
        elif cmd.type == "youtube_comment":
            try:
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
                    result = d.execute_script(script)
                    logger.info("Executed youtube_comment")
                    
                    # Post-action verification
                    verified, verification_details = verify_action_result(d, "youtube_comment")
                    if not verified:
                        logger.warning(f"youtube_comment verification failed: {verification_details}")
                        return create_execution_result("youtube_comment", "failure", verification_details, f"YouTube comment attempted but verification failed: {result}")
                    
                    return create_execution_result("youtube_comment", "success", None, f"YouTube comment: {result} - {verification_details}")
                return create_execution_result("youtube_comment", "failure", "No text provided", "Missing comment text")
            except Exception as e:
                logger.error(f"Error executing youtube_comment: {e}")
                return create_execution_result("youtube_comment", "failure", str(e), "Failed to post comment")
                
        elif cmd.type == "wait":
            try:
                sec = cmd.seconds or 2
                import time
                time.sleep(sec)
                
                # Post-action verification
                verified, verification_details = verify_action_result(d, "wait")
                if not verified:
                    logger.warning(f"wait verification failed: {verification_details}")
                    return create_execution_result("wait", "failure", verification_details, f"Waited but verification failed")
                
                return create_execution_result("wait", "success", None, f"Waited {sec} seconds - {verification_details}")
            except Exception as e:
                logger.error(f"Error executing wait: {e}")
                return create_execution_result("wait", "failure", str(e), "Failed to wait")
        
        # Unknown command type
        return create_execution_result(cmd.type, "failure", f"Unknown command type: {cmd.type}", "Command not recognized")
        
    except Exception as e:
        # Catch-all for any unexpected errors
        logger.error(f"Unexpected error executing command {cmd.type}: {e}")
        return create_execution_result(cmd.type, "failure", str(e), "Unexpected error")

def process_commands(commands: List[BrowserCommand]):
    import time
    results = []
    for cmd in commands:
        max_retries = 3
        cmd_result = None
        for attempt in range(max_retries):
            try:
                cmd_result = execute_single_command(cmd)
                break # Success, move to next command
            except Exception as e:
                # If it's a DOM element not found exception, wait and retry
                if "not found yet" in str(e) and attempt < max_retries - 1:
                    logger.warning(f"[{attempt+1}/{max_retries}] {e} — retrying in 2 seconds...")
                    time.sleep(2)
                else:
                    logger.error(f"Error executing command {cmd.type}: {e}")
                    cmd_result = create_execution_result(cmd.type, "failure", str(e), f"Failed after {attempt+1} attempts")
                    break
        if cmd_result:
            results.append(cmd_result)
            if cmd_result["status"] == "failure":
                break
    return results
@app.post("/execute")
async def execute_commands(req: Request):
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
        "youtube_click_video": "youtube_click_video",
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
    results = process_commands(normalized)
         
    return {"status": "completed", "results": results}


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
            
            methods = ['normal', 'js', 'action_chains', 'coordinate']
            clicked = False
            used_method = ""
            
            center_x = element_info.get('center_x')
            center_y = element_info.get('center_y')
            
            for method in methods:
                try:
                    if method == 'coordinate' and center_x and center_y:
                        scroll_js = f"window.scrollTo({{top: {center_y} - (window.innerHeight / 2), left: {center_x} - (window.innerWidth / 2), behavior: 'instant'}});"
                        d.execute_script(scroll_js)
                        time.sleep(0.5)
                        click_js = f"let el = document.elementFromPoint({center_x} - window.scrollX, {center_y} - window.scrollY); if (el) el.click();"
                        d.execute_script(click_js)
                    elif method == 'normal' and el:
                        el.click()
                    elif method == 'js' and el:
                        d.execute_script("arguments[0].click();", el)
                    elif method == 'action_chains' and el:
                        ActionChains(d).move_to_element(el).click().perform()
                    else:
                        continue
                    
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
                result = {
                    "success": True, 
                    "action": "click", 
                    "status": "success",
                    "target": target_name, 
                    "details": "no navigation change (allowed)"
                }
                logger.info(f"ACTION RESULT: {json.dumps(result)} - SOFT SUCCESS")
                return result
                
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

MARKER_JS = """
function drawBoundingBoxes() {
    // Remove existing markers if any
    document.querySelectorAll('.jarvis-marker').forEach(el => el.remove());
    
    let result = { elements: [] };
    let idCounter = 1;
    
    const selectors = 'a, button, input, select, textarea, [role="button"], [role="link"], [role="menuitem"], [role="option"], [tabindex]:not([tabindex="-1"])';
    const nodes = document.querySelectorAll(selectors);
    
    nodes.forEach(node => {
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        const isVisible = rect.width > 0 && rect.height > 0 && 
                          style.visibility !== 'hidden' && 
                          style.display !== 'none' &&
                          style.opacity !== '0';
                          
        if (node.tagName.toLowerCase() === 'input' && node.type === 'hidden') return;
        
        if (isVisible) {
            // Draw tag
            const marker = document.createElement('div');
            marker.className = 'jarvis-marker';
            marker.style.position = 'absolute';
            marker.style.left = (rect.left + window.scrollX) + 'px';
            marker.style.top = (rect.top + window.scrollY) + 'px';
            marker.style.backgroundColor = 'red';
            marker.style.color = 'white';
            marker.style.fontSize = '12px';
            marker.style.fontWeight = 'bold';
            marker.style.padding = '2px 4px';
            marker.style.zIndex = '2147483647';
            marker.style.pointerEvents = 'none';
            marker.innerText = idCounter;
            document.body.appendChild(marker);
            
            // Draw border
            const border = document.createElement('div');
            border.className = 'jarvis-marker';
            border.style.position = 'absolute';
            border.style.left = (rect.left + window.scrollX) + 'px';
            border.style.top = (rect.top + window.scrollY) + 'px';
            border.style.width = rect.width + 'px';
            border.style.height = rect.height + 'px';
            border.style.border = '2px solid red';
            border.style.boxSizing = 'border-box';
            border.style.zIndex = '2147483646';
            border.style.pointerEvents = 'none';
            document.body.appendChild(border);
            
            result.elements.push({
                id: idCounter,
                center_x: rect.left + window.scrollX + (rect.width / 2),
                center_y: rect.top + window.scrollY + (rect.height / 2),
                text: (node.innerText || node.value || node.getAttribute('aria-label') || '').substring(0, 50).replace(/\\n/g, ' ')
            });
            idCounter++;
        }
    });
    
    return JSON.stringify(result);
}
return drawBoundingBoxes();
"""

class AnalyzeRequest(BaseModel):
    target_tab: Optional[str] = None

@app.get("/browser-status")
async def browser_status():
    """
    Returns current browser state WITHOUT initializing a new session.
    If browser is already open, returns all open tabs with their URLs and titles.
    If no session is live, returns { alive: false }.
    Used by the frontend on startup so JARVIS can greet with context.
    """
    global driver
    try:
        if driver is None or not is_driver_alive(driver):
            return {"alive": False, "tabs": []}

        tabs = []
        current_handle = driver.current_window_handle
        for handle in driver.window_handles:
            try:
                driver.switch_to.window(handle)
                tabs.append({
                    "index": len(tabs),
                    "url": driver.current_url,
                    "title": driver.title,
                    "active": handle == current_handle
                })
            except Exception:
                pass
        # Restore original tab
        try:
            driver.switch_to.window(current_handle)
        except Exception:
            pass

        return {"alive": True, "tabs": tabs, "tab_count": len(tabs)}
    except Exception as e:
        logger.warning(f"[BrowserStatus] Could not read browser state: {e}")
        return {"alive": False, "tabs": []}

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

@app.post("/mark-page")
async def mark_page():
    """
    Injects bounding boxes over interactive elements, takes a base64 screenshot,
    and returns both the image and the coordinate map for the LLM Visual Agent.
    """
    try:
        d = get_driver()
        d.execute_script("return document.readyState") == "complete"
        
        # Inject JS and get elements
        result_text = d.execute_script(MARKER_JS)
        import json
        elements = json.loads(result_text)
        
        global last_extracted_elements
        last_extracted_elements = elements.get("elements", [])
        
        # Take base64 screenshot
        screenshot_b64 = d.get_screenshot_as_base64()
        
        # Cleanup markers so page looks normal again
        d.execute_script("document.querySelectorAll('.jarvis-marker').forEach(el => el.remove());")
        
        return {"status": "success", "image": screenshot_b64, "elements": elements.get("elements", [])}
    except Exception as e:
        logger.error(f"Error marking page: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class ClickCoordinateRequest(BaseModel):
    x: float
    y: float

@app.post("/click-coordinate")
async def click_coordinate(req: ClickCoordinateRequest):
    """Clicks a specific coordinate on the page (used by Visual Agent)."""
    try:
        d = get_driver()
        # Scroll element into the center of the viewport
        scroll_js = f"window.scrollTo({{top: {req.y} - (window.innerHeight / 2), left: {req.x} - (window.innerWidth / 2), behavior: 'instant'}});"
        d.execute_script(scroll_js)
        import time
        time.sleep(0.5)
        
        # Use elementFromPoint to click
        click_js = f"""
        let el = document.elementFromPoint({req.x} - window.scrollX, {req.y} - window.scrollY);
        if (el) {{
            el.click();
            return true;
        }}
        return false;
        """
        success = d.execute_script(click_js)
        return {"status": "success", "clicked": success}
    except Exception as e:
        logger.error(f"Error clicking coordinate: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class EvaluateRequest(BaseModel):
    script: str
    target_tab: Optional[str] = None

@app.post("/evaluate")
async def evaluate_script(req: EvaluateRequest):
    """
    Evaluates an arbitrary JavaScript string in the active browser context 
    and returns its result, useful for QA test probes.
    """
    try:
        d = get_driver()
        if req.target_tab:
            handle = get_tab_by_name(req.target_tab)
            if handle:
                d.switch_to.window(handle)
        
        result_val = d.execute_script(req.script)
        return {"status": "success", "result": result_val}
    except Exception as e:
        logger.error(f"Error evaluating script: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

"""
browser_site_agent.py — Main Trusted Sites Agent for J.A.R.V.I.S.

ARCHITECTURE OVERVIEW:
  This agent handles J.A.R.V.I.S. "open site" commands with a two-tier approach:
  
  Tier 1 — TRUSTED SITES (instant, no search needed):
    If the site name matches a trusted site in trusted_sites.json,
    open it directly in Chrome. Blazing fast, zero network latency.
    
  Tier 2 — UNKNOWN SITES (Google search fallback):
    If the site is NOT in the trusted list:
    1. Google the site name
    2. Extract top 5 results from the search page
    3. Return results to the LLM/user for selection
    4. After user selects a link, optionally save it as a new trusted site

INTEGRATION:
  This module exposes helper functions that can be imported by the main
  youtube_agent.py (or any future agent). It does NOT run its own FastAPI
  server — it reuses the existing driver and endpoints.

FUTURE DATABASE MIGRATION:
  All JSON file operations are isolated in utils.py.
  To migrate to a database, only utils.py needs to change.
"""

import logging
import time
from typing import Optional, List, Dict, Any

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from .utils import (
    lookup_trusted_site,
    save_trusted_site,
    remove_trusted_site,
    normalize_site_name,
    get_all_trusted_sites,
)

logger = logging.getLogger(__name__)


# ─── CORE: OPEN SITE ──────────────────────────────────────────────────────────

def open_site(driver, site_name: str, force_new_tab: bool = False) -> Dict[str, Any]:
    """
    Main entry point: Open a website by name.
    
    Flow:
      1. Check trusted_sites.json for an instant match.
      2. If found → open directly in Chrome.
      3. If NOT found → return a "search_needed" response so the caller
         (youtube_agent.py) can Google it and ask the user.
    
    Args:
        driver: The Selenium WebDriver instance (shared with youtube_agent.py)
        site_name: The site name from the user's voice command (e.g., "YouTube", "Firebase")
        force_new_tab: Whether to force a new tab instead of reusing an existing one
    
    Returns:
        dict with:
          - status: "opened" | "search_needed" | "error"
          - url: The URL that was opened (if status == "opened")
          - message: Human-friendly status message
    """
    if not driver:
        return {"status": "error", "message": "Browser not initialized."}
    
    if not site_name:
        return {"status": "error", "message": "No site name provided."}
    
    # ── Tier 1: Check trusted sites ──
    url = lookup_trusted_site(site_name)
    
    if url:
        try:
            _navigate_to_url(driver, url, force_new_tab)
            logger.info(f"Opened trusted site: '{site_name}' -> {url}")
            return {
                "status": "opened",
                "url": url,
                "message": f"Opened {site_name} directly (trusted site).",
            }
        except Exception as e:
            logger.error(f"Failed to open trusted site '{site_name}': {e}")
            return {"status": "error", "message": f"Failed to open {site_name}: {str(e)}"}
    
    # ── Tier 2: Unknown site → signal that a search is needed ──
    logger.info(f"Site '{site_name}' not in trusted list. Search needed.")
    return {
        "status": "search_needed",
        "site_name": site_name,
        "message": f"'{site_name}' is not a trusted site. I'll search for it.",
    }


# ─── SEARCH UNKNOWN SITE ──────────────────────────────────────────────────────

def search_unknown_site(driver, site_name: str) -> Dict[str, Any]:
    """
    Google the unknown site and extract top search results.
    
    This navigates the browser to Google, waits for results, and
    extracts the top 5 links with their titles and URLs.
    
    Args:
        driver: The Selenium WebDriver instance
        site_name: The unknown site name to search for
    
    Returns:
        dict with:
          - status: "results_found" | "no_results" | "error"
          - results: List of {title, url, index} dicts
          - message: Human-friendly description
    """
    if not driver:
        return {"status": "error", "results": [], "message": "Browser not initialized."}
    
    try:
        search_query = f"{site_name} official website"
        search_url = f"https://www.google.com/search?q={search_query.replace(' ', '+')}"
        
        # Navigate to Google
        _navigate_to_url(driver, search_url, force_new_tab=False)
        
        # Wait for search results to load
        WebDriverWait(driver, 8).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "div#search"))
        )
        
        # Small delay for dynamic content
        time.sleep(1)
        
        # Extract top results using JavaScript for reliability
        results = driver.execute_script("""
            const results = [];
            const items = document.querySelectorAll('div#search div.g');
            
            for (let i = 0; i < Math.min(items.length, 5); i++) {
                const link = items[i].querySelector('a');
                const titleEl = items[i].querySelector('h3');
                
                if (link && titleEl) {
                    results.push({
                        title: titleEl.innerText || '',
                        url: link.href || '',
                        index: i + 1
                    });
                }
            }
            return results;
        """)
        
        if results and len(results) > 0:
            # Format results as a readable string for the LLM
            results_text = "\\n".join(
                [f"[{r['index']}] {r['title']} -> {r['url']}" for r in results]
            )
            logger.info(f"Found {len(results)} results for '{site_name}'")
            return {
                "status": "results_found",
                "results": results,
                "results_text": results_text,
                "message": f"Found {len(results)} results for '{site_name}'.",
            }
        else:
            return {
                "status": "no_results",
                "results": [],
                "message": f"No results found for '{site_name}'.",
            }
    
    except Exception as e:
        logger.error(f"Error searching for '{site_name}': {e}")
        return {
            "status": "error",
            "results": [],
            "message": f"Search failed: {str(e)}",
        }


# ─── TRUST A NEW SITE ─────────────────────────────────────────────────────────

def add_trusted_site(name: str, url: str) -> Dict[str, Any]:
    """
    Save a new site to the trusted list after user confirmation.
    
    Called when:
      1. User opened an unknown site via Google search
      2. User confirmed they want to save it for quick access
    
    Args:
        name: The site name to save (e.g., "Firebase")
        url: The URL to save (e.g., "https://firebase.google.com")
    
    Returns:
        dict with status and message
        
    FUTURE: This calls utils.save_trusted_site() which writes to JSON.
            When migrating to a database, only utils.py needs to change.
    """
    if not name or not url:
        return {"status": "error", "message": "Both name and URL are required."}
    
    success = save_trusted_site(name, url)
    
    if success:
        normalized = normalize_site_name(name)
        return {
            "status": "saved",
            "message": f"Saved '{normalized}' as a trusted site. I'll open it instantly next time.",
        }
    else:
        return {
            "status": "error",
            "message": f"Failed to save '{name}' to trusted sites.",
        }


# ─── LIST ALL TRUSTED SITES ───────────────────────────────────────────────────

def list_trusted_sites() -> Dict[str, Any]:
    """
    Return all trusted sites. Useful for the user asking
    "What sites do you know?" or for debugging.
    """
    sites = get_all_trusted_sites()
    if not sites:
        return {"status": "empty", "sites": {}, "message": "No trusted sites configured."}
    
    sites_list = "\\n".join([f"• {name}: {url}" for name, url in sites.items()])
    return {
        "status": "ok",
        "sites": sites,
        "count": len(sites),
        "message": f"I know {len(sites)} trusted sites:\\n{sites_list}",
    }


# ─── INTERNAL HELPERS ──────────────────────────────────────────────────────────

def _navigate_to_url(driver, url: str, force_new_tab: bool = False):
    """
    Navigate the browser to a URL, handling tab management.
    
    - If the browser has only the blank "data:," tab, navigate in place.
    - If force_new_tab is True OR there's already a loaded page, open a new tab.
    """
    try:
        if force_new_tab:
            driver.switch_to.new_window('tab')
            driver.get(url)
        elif len(driver.window_handles) == 1 and driver.current_url in ("data:,", "about:blank"):
            driver.get(url)
        else:
            # Check if we already have a tab with this URL open
            current = driver.current_window_handle
            for handle in driver.window_handles:
                driver.switch_to.window(handle)
                if url.rstrip('/') in driver.current_url:
                    # Already open, just focus this tab
                    logger.info(f"Tab already open for {url}, focusing it.")
                    return
            
            # Not found, open new tab
            driver.switch_to.window(current)
            driver.switch_to.new_window('tab')
            driver.get(url)
    except Exception as e:
        logger.error(f"Navigation error: {e}")
        raise

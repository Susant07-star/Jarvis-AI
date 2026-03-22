"""
utils.py — Helper functions for the Trusted Sites Agent.

This module handles:
  - Reading / writing trusted_sites.json (can be swapped for a database later)
  - Normalizing site names for consistent lookup
  - Fuzzy matching for imprecise voice commands

NOTE: All functions that touch trusted_sites.json are isolated here so that
      migrating to a database (Supabase, SQLite, PostgreSQL, etc.) only
      requires changing THIS file — the rest of the agent stays the same.
"""

import json
import os
import re
import logging
from typing import Optional, Dict

logger = logging.getLogger(__name__)

# Path to the JSON file (relative to this file's directory)
SITES_FILE = os.path.join(os.path.dirname(__file__), "trusted_sites.json")


# ─── READ / WRITE ─────────────────────────────────────────────────────────────
# FUTURE DATABASE MIGRATION:
#   Replace load_trusted_sites() with a DB query like:
#     SELECT url FROM trusted_sites WHERE name = :name
#   Replace save_trusted_site() with:
#     INSERT INTO trusted_sites (name, url) VALUES (:name, :url)
# ──────────────────────────────────────────────────────────────────────────────

def load_trusted_sites() -> Dict[str, str]:
    """
    Load the trusted sites dictionary from JSON.
    Returns a dict of { normalized_name: url }.
    
    FUTURE: Replace with a database SELECT query.
    """
    try:
        if not os.path.exists(SITES_FILE):
            logger.warning(f"Trusted sites file not found at {SITES_FILE}, creating empty one.")
            _write_sites_file({"_comment": "Trusted sites for J.A.R.V.I.S.", "sites": {}})
            return {}
        
        with open(SITES_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        return data.get("sites", {})
    
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse trusted_sites.json: {e}")
        return {}
    except Exception as e:
        logger.error(f"Error loading trusted sites: {e}")
        return {}


def save_trusted_site(name: str, url: str) -> bool:
    """
    Add a new trusted site to the JSON file.
    Returns True if successfully saved.
    
    FUTURE: Replace with a database INSERT/UPSERT query.
    """
    try:
        # Load existing data
        if os.path.exists(SITES_FILE):
            with open(SITES_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
        else:
            data = {"_comment": "Trusted sites for J.A.R.V.I.S.", "sites": {}}
        
        # Add or update the site
        normalized = normalize_site_name(name)
        data["sites"][normalized] = url
        
        _write_sites_file(data)
        logger.info(f"Saved trusted site: '{normalized}' -> {url}")
        return True
    
    except Exception as e:
        logger.error(f"Error saving trusted site '{name}': {e}")
        return False


def remove_trusted_site(name: str) -> bool:
    """
    Remove a trusted site from the JSON file.
    Returns True if the site existed and was removed.
    
    FUTURE: Replace with a database DELETE query.
    """
    try:
        if not os.path.exists(SITES_FILE):
            return False
        
        with open(SITES_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        normalized = normalize_site_name(name)
        if normalized in data.get("sites", {}):
            del data["sites"][normalized]
            _write_sites_file(data)
            logger.info(f"Removed trusted site: '{normalized}'")
            return True
        
        return False
    
    except Exception as e:
        logger.error(f"Error removing trusted site '{name}': {e}")
        return False


def _write_sites_file(data: dict):
    """Internal helper to write the JSON file atomically."""
    with open(SITES_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


# ─── NORMALIZATION & MATCHING ──────────────────────────────────────────────────

def normalize_site_name(name: str) -> str:
    """
    Normalize a site name for consistent lookup.
    Examples:
      "YouTube"     -> "youtube"
      "Google Maps" -> "google maps"
      "  FACE book " -> "facebook"
      "stack overflow" -> "stackoverflow"
    """
    if not name:
        return ""
    
    # Lowercase and strip whitespace
    normalized = name.lower().strip()
    
    # Remove special characters except spaces
    normalized = re.sub(r'[^\w\s]', '', normalized)
    
    # Collapse multiple spaces into one
    normalized = re.sub(r'\s+', ' ', normalized)
    
    return normalized


def lookup_trusted_site(name: str) -> Optional[str]:
    """
    Look up a site name in the trusted sites registry.
    Tries exact match first, then fuzzy partial matching.
    
    Returns the URL if found, None otherwise.
    """
    sites = load_trusted_sites()
    normalized = normalize_site_name(name)
    
    if not normalized:
        return None
    
    # 1. Exact match
    if normalized in sites:
        logger.info(f"Exact match found: '{normalized}' -> {sites[normalized]}")
        return sites[normalized]
    
    # 2. Partial match — check if the user's query is contained in a site name
    #    e.g., "google drive" matches "google drive", "stack" matches "stackoverflow"
    for site_name, url in sites.items():
        if normalized in site_name or site_name in normalized:
            logger.info(f"Partial match found: '{normalized}' ~ '{site_name}' -> {url}")
            return url
    
    # 3. No match found
    logger.info(f"No trusted site found for: '{normalized}'")
    return None


def get_all_trusted_sites() -> Dict[str, str]:
    """Return all trusted sites. Useful for listing or debugging."""
    return load_trusted_sites()

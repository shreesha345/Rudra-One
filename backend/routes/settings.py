"""
Agency settings routes.
"""
from __future__ import annotations

import logging
import traceback

from fastapi import APIRouter, HTTPException

from backend.db_helpers import load_settings_db, save_settings_db
from backend.routes.schemas import AgencySettings, SettingsResponse

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/api/settings", response_model=SettingsResponse)
async def get_settings():
    try:
        db_settings = await load_settings_db()
        return SettingsResponse(status="success", message="Settings retrieved successfully", settings=db_settings)
    except Exception as e:
        logger.error("Error getting settings: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve settings: {str(e)}")


@router.post("/api/settings", response_model=SettingsResponse)
async def update_settings(settings: AgencySettings):
    try:
        logger.info("Settings update request: %s", settings.dict())
        updated = await save_settings_db(settings.dict(exclude_unset=True))
        logger.info("Settings saved: %s", updated)
        return SettingsResponse(status="success", message="Settings updated successfully", settings=updated)
    except ValueError as e:
        logger.error("Validation error: %s", e)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Error updating settings: %s", e)
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to update settings: {str(e)}")

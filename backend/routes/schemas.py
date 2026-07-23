"""
Shared Pydantic request/response models for the API.
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator
import base64


class AudioStreamRequest(BaseModel):
    audio: str = Field(..., description="Base64 encoded audio data")
    caller_number: str = Field(..., description="Caller phone number")

    @field_validator('audio')
    def validate_audio(cls, v):
        try:
            base64.b64decode(v)
            return v
        except Exception:
            raise ValueError("Invalid base64 audio data")


class HealthResponse(BaseModel):
    status: str
    timestamp: str
    environment: str
    deepgram_configured: bool
    twilio_configured: bool


class RecordingRequest(BaseModel):
    date: str = Field(..., description="Date in YYYY-MM-DD format")
    call_sid: Optional[str] = Field(None, description="Specific Call SID (optional)")


class RecordingResponse(BaseModel):
    status: str
    message: str
    recordings_saved: int
    recordings: list


class TrainingStartRequest(BaseModel):
    session_id: str = Field(..., description="Unique session identifier")


class TrainingMessageRequest(BaseModel):
    session_id: str = Field(..., description="Training session ID")
    message: str = Field(..., description="Dispatcher message")


class TrainingEndRequest(BaseModel):
    session_id: str = Field(..., description="Training session ID")


class TrainingResponse(BaseModel):
    status: str
    session_id: str
    message: str
    caller_response: Optional[str] = None
    confidence_score: Optional[int] = None
    evaluation: Optional[str] = None


class LocationRequest(BaseModel):
    latitude: Optional[float] = Field(None, description="Latitude coordinate")
    longitude: Optional[float] = Field(None, description="Longitude coordinate")
    accuracy: Optional[float] = Field(None, description="Location accuracy in meters")
    timestamp: Optional[str] = Field(None, description="Timestamp of location capture")
    caller_number: Optional[str] = Field(None, description="Caller phone number")


class LocationResponse(BaseModel):
    status: str
    message: str
    location: dict


class EmergencySMSRequest(BaseModel):
    to_number: str = Field(..., description="Emergency service phone number")
    emergency_type: str = Field(..., description="Type of emergency (hospital, police, fire)")
    location_address: str = Field(..., description="Full address of emergency location")
    station_name: Optional[str] = Field(None, description="Name of emergency station")
    insights_data: dict = Field(..., description="Insights data from the call")
    maps_link: Optional[str] = Field(None, description="Google Maps link for the location (optional)")


class EmergencySMSResponse(BaseModel):
    status: str
    message: str
    message_sid: Optional[str] = None
    to_number: Optional[str] = None
    sms_body: Optional[str] = None


class EmergencyCallRequest(BaseModel):
    to_number: str = Field(..., description="Emergency service phone number")
    emergency_type: str = Field(..., description="Type of emergency (hospital, police, fire)")
    location_address: str = Field(..., description="Full address of emergency location")
    station_name: Optional[str] = Field(None, description="Name of emergency station")
    insights_data: dict = Field(..., description="Insights data from the call")


class EmergencyCallResponse(BaseModel):
    status: str
    message: str
    call_sid: Optional[str] = None
    to_number: Optional[str] = None
    call_message: Optional[str] = None


class LocationDataRequest(BaseModel):
    latitude: float
    longitude: float
    accuracy: float
    caller_number: Optional[str] = None
    request_id: Optional[str] = None


class AgencySettings(BaseModel):
    call_forward_number: Optional[str] = Field(None, description="Phone number to forward calls to")
    default_translation_language: str = Field("en", description="Default language for translation (ISO 639-1 code)")
    emergency_hospital: Optional[str] = Field(None, description="Emergency contact for Hospital")
    emergency_police: Optional[str] = Field(None, description="Emergency contact for Police")
    emergency_fire: Optional[str] = Field(None, description="Emergency contact for Fire")

    @field_validator('default_translation_language')
    def validate_language_code(cls, v):
        valid_codes = ['en', 'hi', 'bn', 'te', 'mr', 'ta', 'gu', 'kn', 'ml', 'pa', 'or']
        if v not in valid_codes:
            raise ValueError(f"Language code must be one of: {', '.join(valid_codes)}")
        return v


class SettingsResponse(BaseModel):
    status: str
    message: str
    settings: Optional[dict] = None


class SMSRequest(BaseModel):
    to: str
    body: str


class LoginRequest(BaseModel):
    username: str
    password: str


class AnalyticsRequest(BaseModel):
    message: str

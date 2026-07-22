from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, Float, JSON
from sqlalchemy.sql import func
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password = Column(String) # In production, hash this!
    is_active = Column(Boolean, default=True)

class LoginLog(Base):
    __tablename__ = "login_logs"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, index=True)
    ip_address = Column(String)
    user_agent = Column(String)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    success = Column(Boolean, default=False)

class Call(Base):
    __tablename__ = "calls"

    id = Column(Integer, primary_key=True, index=True)
    call_sid = Column(String, unique=True, index=True)
    caller_number = Column(String, index=True)
    to_number = Column(String)
    caller_name = Column(String, nullable=True)
    caller_city = Column(String, nullable=True)
    caller_state = Column(String, nullable=True)
    caller_country = Column(String, nullable=True)
    language = Column(String, default="English")
    start_time = Column(DateTime(timezone=True), server_default=func.now())
    end_time = Column(DateTime(timezone=True), nullable=True)
    duration = Column(Integer, nullable=True)  # Duration in seconds
    is_live = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class Transcript(Base):
    __tablename__ = "transcripts"

    id = Column(Integer, primary_key=True, index=True)
    call_sid = Column(String, index=True)
    speaker = Column(String)  # "Caller" or "Dispatch"
    message = Column(Text)
    translated_message = Column(Text, nullable=True)
    language = Column(String, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    is_final = Column(Boolean, default=True)

class CallInsight(Base):
    __tablename__ = "call_insights"

    id = Column(Integer, primary_key=True, index=True)
    call_sid = Column(String, unique=True, index=True)
    summary = Column(Text, nullable=True)
    location = Column(JSON, nullable=True)  # Store as JSON array
    persons_described = Column(JSON, nullable=True)  # Store as JSON array
    additional_info = Column(JSON, nullable=True)  # Store as JSON array
    incident = Column(JSON, nullable=True)  # Store as JSON object
    time_info = Column(JSON, nullable=True)  # Store as JSON object
    protocol_questions = Column(JSON, nullable=True)  # Store as JSON array
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class LocationData(Base):
    __tablename__ = "location_data"

    id = Column(Integer, primary_key=True, index=True)
    call_sid = Column(String, index=True)
    caller_number = Column(String, index=True)
    latitude = Column(Float)
    longitude = Column(Float)
    address = Column(String, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

class AgencySetting(Base):
    __tablename__ = "agency_settings"

    id = Column(Integer, primary_key=True, index=True)
    call_forward_number = Column(String, nullable=True)
    default_translation_language = Column(String, default="en")
    emergency_hospital = Column(String, nullable=True)
    emergency_police = Column(String, nullable=True)
    emergency_fire = Column(String, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

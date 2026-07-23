"""
Training routes — start, message, end, and get session.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime

from fastapi import APIRouter, HTTPException

from backend import state
from backend.routes.schemas import (
    TrainingStartRequest, TrainingMessageRequest, TrainingEndRequest, TrainingResponse,
)
from backend.services.training import load_scenarios, select_random_scenario

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/training/start", response_model=TrainingResponse)
async def start_training_session(request: TrainingStartRequest):
    if not state.training_scenarios or not state.training_client:
        raise HTTPException(status_code=500, detail="Training system not initialized")

    session_id = request.session_id
    if session_id in state.training_sessions:
        raise HTTPException(status_code=400, detail="Session already exists")

    scenario = select_random_scenario(state.training_scenarios)
    title = scenario.get("title", "Unknown Emergency")
    desc = scenario.get("desc", "No description")
    location = scenario.get("twp", "Unknown Location")

    intro_prompt = f"""
You are simulating an emergency call for a 911 dispatcher training. Your role is to be the CALLER.

**CRITICAL INSTRUCTIONS FOR YOUR ROLE:**
1.  **NO DESCRIPTIVE ACTIONS:** Do NOT use parentheses or asterisks to describe sounds, actions, or emotions (e.g., no `(sobbing)`, `*sirens wail*`, `(gasping)`).
2.  **STRAIGHT CONVERSATION ONLY:** Your responses must only contain the words spoken by the caller. It should be a direct, back-and-forth conversation.
3.  **BE A DESCRIPTIVE REPORTER:** Act as a person urgently reporting an emergency. When you answer, provide relevant details about what you see, hear, and know. Your goal is to paint a clear picture of the scene with your words.
4.  **ELABORATE WHEN ASKED:** Start with an urgent opening line. When the dispatcher asks a question, answer it fully. For example, if they ask for the location, don't just say "the train tracks." Say something like, "It's under the train tracks on Maple Avenue, just past the old factory." Provide the important details you have.

**SCENARIO BRIEFING:**
*   **INCIDENT TYPE:** {title}
*   **DESCRIPTION:** {desc}
*   **LOCATION:** {location}

Begin the call now with your opening line. It should be urgent and give a key detail about the emergency.
        """

    chat = state.training_client.chats.create()
    response = chat.send_message(intro_prompt)

    state.training_sessions[session_id] = {
        "scenario": scenario, "chat": chat, "conversation": [],
        "started_at": datetime.now().isoformat(), "status": "active",
    }
    state.training_sessions[session_id]["conversation"].append({
        "sender": "Caller", "message": response.text, "timestamp": datetime.now().isoformat(),
    })

    logger.info("Started training session %s with scenario: %s", session_id, title)
    return TrainingResponse(status="success", session_id=session_id, message="Training session started", caller_response=response.text)


@router.post("/training/message", response_model=TrainingResponse)
async def send_training_message(request: TrainingMessageRequest):
    session_id = request.session_id
    if session_id not in state.training_sessions:
        raise HTTPException(status_code=404, detail="Training session not found")

    session = state.training_sessions[session_id]
    if session["status"] != "active":
        raise HTTPException(status_code=400, detail="Training session is not active")

    chat = session["chat"]
    session["conversation"].append({
        "sender": "Dispatch", "message": request.message, "timestamp": datetime.now().isoformat(),
    })
    response = chat.send_message(request.message)
    session["conversation"].append({
        "sender": "Caller", "message": response.text, "timestamp": datetime.now().isoformat(),
    })

    logger.info("Training session %s: message exchanged", session_id)
    return TrainingResponse(status="success", session_id=session_id, message="Message sent and response received", caller_response=response.text)


@router.post("/training/end", response_model=TrainingResponse)
async def end_training_session(request: TrainingEndRequest):
    session_id = request.session_id
    if session_id not in state.training_sessions:
        raise HTTPException(status_code=404, detail="Training session not found")

    session = state.training_sessions[session_id]
    chat = session["chat"]

    grading_prompt = """
You are evaluating a 911 DISPATCHER/OPERATOR trainee's performance in handling an emergency call.
Focus ONLY on the dispatcher's responses and actions, NOT the caller.

Analyze based on:
1. Information Gathering (25 points)
2. Communication Clarity (20 points)
3. Response Speed & Efficiency (15 points)
4. Calmness & Composure (15 points)
5. Empathy & Reassurance (10 points)
6. Protocol Adherence (10 points)
7. Problem-Solving (5 points)

**OUTPUT FORMAT:**
Score: [XX]%

**Evaluation:**
**Strengths:**
- [List 2-3 things done well]
**Areas for Improvement:**
- [List 2-3 areas to improve]
**Key Observations:**
- [2-3 specific examples]
**Overall Assessment:**
[1-2 sentences]

IMPORTANT: Evaluate ONLY the dispatcher's performance, NOT the caller. Be specific with examples. Be actionable.
        """

    eval_response = chat.send_message(grading_prompt)

    confidence_score = 75
    try:
        score_match = re.search(r'(\d{1,3})%', eval_response.text)
        if score_match:
            confidence_score = int(score_match.group(1))
    except (ValueError, AttributeError, TypeError) as e:
        logger.warning("Could not parse score: %s", e)

    session["status"] = "completed"
    session["ended_at"] = datetime.now().isoformat()
    session["evaluation"] = eval_response.text
    session["confidence_score"] = confidence_score

    logger.info("Ended training session %s with score: %s%%", session_id, confidence_score)
    return TrainingResponse(
        status="success", session_id=session_id, message="Training session ended",
        confidence_score=confidence_score, evaluation=eval_response.text,
    )


@router.get("/training/session/{session_id}")
async def get_training_session(session_id: str):
    if session_id not in state.training_sessions:
        raise HTTPException(status_code=404, detail="Training session not found")
    session = state.training_sessions[session_id]
    return {
        "session_id": session_id, "scenario": session["scenario"],
        "conversation": session["conversation"], "status": session["status"],
        "started_at": session["started_at"], "ended_at": session.get("ended_at"),
        "confidence_score": session.get("confidence_score"), "evaluation": session.get("evaluation"),
    }

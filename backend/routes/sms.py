"""
SMS and emergency call routes.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request

from backend import config
from backend.routes.schemas import (
    EmergencySMSRequest, EmergencySMSResponse,
    EmergencyCallRequest, EmergencyCallResponse, SMSRequest,
)
from backend.services.twilio import send_emergency_alert, send_sms, format_call_message

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/sms/emergency", response_model=EmergencySMSResponse)
async def send_emergency_sms(request: EmergencySMSRequest):
    try:
        logger.info("Emergency SMS request: %s to %s", request.emergency_type, request.to_number)

        if request.emergency_type not in ['hospital', 'police', 'fire']:
            raise HTTPException(status_code=400, detail="Invalid emergency type. Must be 'hospital', 'police', or 'fire'")

        result = send_emergency_alert(
            to_number=request.to_number, insights_data=request.insights_data,
            location_address=request.location_address, emergency_type=request.emergency_type,
            station_name=request.station_name, maps_link=request.maps_link,
        )

        if result['status'] == 'success':
            return EmergencySMSResponse(
                status="success", message="Emergency SMS sent successfully",
                message_sid=result.get('message_sid'), to_number=result.get('to_number'),
                sms_body=result.get('sms_body'),
            )
        raise HTTPException(status_code=500, detail=result.get('message', 'Failed to send SMS'))
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error sending emergency SMS: %s", e)
        raise HTTPException(status_code=500, detail=f"Error sending emergency SMS: {str(e)}")


@router.post("/call/emergency", response_model=EmergencyCallResponse)
async def initiate_emergency_call(request: EmergencyCallRequest):
    try:
        logger.info("Emergency call request: %s to %s", request.emergency_type, request.to_number)

        if request.emergency_type not in ['hospital', 'police', 'fire']:
            raise HTTPException(status_code=400, detail="Invalid emergency type")

        if not all([config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN, config.TWILIO_PHONE_NUMBER]):
            raise HTTPException(status_code=500, detail="Twilio not configured for making calls")

        call_message = format_call_message(
            insights_data=request.insights_data, location_address=request.location_address,
            emergency_type=request.emergency_type,
        )
        logger.info("Formatted call message: %s", call_message)

        try:
            from twilio.rest import Client
            client = Client(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN)

            twiml_message = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice" language="en-US">{call_message}</Say>
    <Pause length="2"/>
    <Say voice="alice" language="en-US">Thank you. This call will now end.</Say>
</Response>"""

            call = client.calls.create(twiml=twiml_message, to=request.to_number, from_=config.TWILIO_PHONE_NUMBER)
            logger.info("Emergency call initiated to %s, SID: %s", request.to_number, call.sid)

            return EmergencyCallResponse(
                status="success", message="Emergency call initiated successfully",
                call_sid=call.sid, to_number=request.to_number, call_message=call_message,
            )
        except ImportError:
            raise HTTPException(status_code=500, detail="Twilio library not installed")
        except Exception as e:
            logger.error("Failed to initiate call: %s", e)
            raise HTTPException(status_code=500, detail=f"Failed to initiate call: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error initiating emergency call: %s", e)
        raise HTTPException(status_code=500, detail=f"Error initiating emergency call: {str(e)}")


@router.post("/api/send-sms")
async def send_sms_endpoint(request: SMSRequest):
    try:
        result = send_sms(request.to, request.body)
        if result['status'] == 'error':
            raise HTTPException(status_code=500, detail=result['message'])
        return result
    except Exception as e:
        logger.error("Error sending SMS: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/sms/status")
async def twilio_sms_status_callback(request: Request):
    try:
        form_data = await request.form()
        message_sid = form_data.get("MessageSid")
        message_status = form_data.get("MessageStatus")
        to_number = form_data.get("To")
        error_code = form_data.get("ErrorCode")
        error_message = form_data.get("ErrorMessage")

        logger.info("SMS Status Callback: SID=%s, Status=%s, To=%s, ErrorCode=%s, ErrorMessage=%s",
                    message_sid, message_status, to_number, error_code, error_message)

        # Broadcast to websocket notification clients
        from backend import state
        from datetime import datetime
        
        event = {
            "type": "sms_status",
            "message_sid": message_sid,
            "to_number": to_number,
            "status": message_status,
            "error_code": error_code,
            "error_message": error_message,
            "timestamp": datetime.now().isoformat(),
        }
        
        # Expose common twilio error code explanations
        if error_code:
            explanations = {
                "21608": "Number is not verified in Twilio Console. Trial accounts can only send to verified numbers.",
                "30006": "Landline number or unable to receive SMS.",
                "30007": "Carrier filtered / blocked as spam. Often due to links/URLs in SMS.",
                "30008": "Unknown carrier delivery failure.",
                "30004": "Message blocked by DND (Do Not Disturb) settings or carrier.",
            }
            event["explanation"] = explanations.get(str(error_code), f"Twilio error: {error_message or 'No details'}")
        
        for client in list(state.notification_clients):
            try:
                await client.send_json(event)
            except Exception as e:
                logger.error("Failed to broadcast SMS status: %s", e)
                state.notification_clients.discard(client)
                
        return {"status": "ok"}
    except Exception as e:
        logger.error("Error in SMS status callback: %s", e)
        return {"status": "error", "detail": str(e)}

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime
from typing import Any, Dict

from boto3.dynamodb.conditions import Key

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, os.pardir))
if PARENT_DIR not in sys.path:
    sys.path.append(PARENT_DIR)

from common import (  # noqa: E402
    appointments_table,
    emit_event,
    get_claim,
    health_index_table,
    json_response,
    require_role,
    users_table,
)

ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
MANDATORY_VITAL_FIELDS = {
    "heightCm",
    "weightKg",
    "bloodPressureSystolic",
    "bloodPressureDiastolic",
    "heartRate",
}
ALLOWED_COMPLAINTS = {
    "Chest pain",
    "Shortness of breath",
    "Skin rash/itch",
    "Headache/migraine",
    "Knee/shoulder/back pain",
    "Fever/cold/flu",
    "Eye irritation/blurred vision",
    "Ear pain/sore throat",
    "High blood sugar/diabetes follow-up",
    "Abdominal pain/acid reflux",
    "Anxiety/depression check-in",
    "Urinary issues",
    "Women’s health consultation",
    "Child vaccination/fever",
}


def generate_ulid() -> str:
    millis = int(time.time() * 1000)
    time_bytes = millis.to_bytes(6, byteorder="big", signed=False)
    random_bytes = os.urandom(10)
    value = int.from_bytes(time_bytes + random_bytes, "big")
    chars = []
    for _ in range(26):
        value, idx = divmod(value, 32)
        chars.append(ULID_ALPHABET[idx])
    return "".join(reversed(chars))


def parse_slot_iso(slot: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(slot.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("slotISO must be ISO-8601 timestamp") from exc
    return parsed


def compute_bmi(height_cm: float, weight_kg: float) -> float | None:
    try:
        meters = float(height_cm) / 100
        weight = float(weight_kg)
        if meters <= 0:
            return None
        return round(weight / (meters * meters), 1)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def sanitize_vitals(vitals: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(vitals, dict):
        raise ValueError("vitals must be an object")
    summary: Dict[str, Any] = {}
    for field in MANDATORY_VITAL_FIELDS:
        value = vitals.get(field)
        if value is None:
            raise ValueError(f"Missing vital: {field}")
        try:
            summary[field] = float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid numeric value for {field}") from exc

    allergies = vitals.get("allergies")
    if not isinstance(allergies, list) or not allergies:
        raise ValueError("allergies must be a non-empty list")
    summary["allergies"] = [str(item)[:80] for item in allergies]

    medications = vitals.get("medications")
    if medications:
        summary["medications"] = str(medications)[:240]

    extra_fields = vitals.get("extraFields")
    if isinstance(extra_fields, list):
        summary["extraFields"] = [str(field)[:60] for field in extra_fields]

    for key, value in vitals.items():
        if key in summary or key in {"allergies", "medications", "extraFields"}:
            continue
        if isinstance(value, (int, float)):
            summary[key] = float(value)
        elif isinstance(value, str):
            summary[key] = value

    bmi = summary.get("bmi")
    if bmi is None:
        computed = compute_bmi(summary["heightCm"], summary["weightKg"])
        if computed is not None:
            summary["bmi"] = computed

    return summary


def lambda_handler(event: Dict[str, Any], _context: Any):
    forbidden = require_role(event, ["PATIENT"])
    if forbidden:
        return forbidden

    patient_id = get_claim(event, "sub")
    if not patient_id:
        return json_response({"message": "unauthorized"}, 401)

    body = json.loads(event.get("body") or "{}")
    doctor_id = body.get("doctorId")
    slot_iso = body.get("slotISO")
    chief_complaint = body.get("chiefComplaint")
    recommended_specialty = body.get("recommendedSpecialty")
    vitals = body.get("vitals")

    if not doctor_id or not slot_iso:
        return json_response({"message": "doctorId and slotISO are required"}, 400)
    if chief_complaint not in ALLOWED_COMPLAINTS:
        return json_response({"message": "chiefComplaint required"}, 400)

    try:
        summary_vitals = sanitize_vitals(vitals or {})
    except ValueError as exc:
        return json_response({"message": str(exc)}, 400)

    try:
        slot_dt = parse_slot_iso(slot_iso)
    except ValueError as exc:
        return json_response({"message": str(exc)}, 400)
    if slot_dt <= datetime.utcnow():
        return json_response({"message": "slot must be in the future"}, 400)

    doctor = users_table.get_item(Key={"userId": doctor_id}).get("Item")
    if not doctor or doctor.get("role") != "DOCTOR":
        return json_response({"message": "doctor not found"}, 404)

    profile = doctor.get("doctorProfile") or {}
    avail_slots = profile.get("availSlots") or []
    if avail_slots and slot_dt.isoformat() not in avail_slots:
        return json_response({"message": "slot not published by doctor"}, 400)

    clashes = appointments_table.query(
        IndexName="GSI1",
        KeyConditionExpression=Key("doctorId").eq(doctor_id) & Key("slotISO").eq(slot_dt.isoformat()),
        Limit=1,
    )
    if clashes.get("Count", 0) > 0:
        return json_response({"message": "slot not available"}, 409)

    appointment_id = generate_ulid()
    created_at = datetime.utcnow().isoformat()
    item = {
        "appointmentId": appointment_id,
        "doctorId": doctor_id,
        "patientId": patient_id,
        "slotISO": slot_dt.isoformat(),
        "status": "PENDING",
        "createdAt": created_at,
        "updatedAt": created_at,
        "chiefComplaint": chief_complaint,
        "recommendedSpecialty": recommended_specialty,
        "vitalsSummary": summary_vitals,
    }

    appointments_table.put_item(Item=item)

    health_record = {
        "patientId": patient_id,
        "recordId": appointment_id,
        "updatedAt": created_at,
        "chiefComplaint": chief_complaint,
        "summary": summary_vitals,
    }
    health_index_table.put_item(Item=health_record)
    health_index_table.put_item(
        Item={
            "patientId": patient_id,
            "recordId": "latest",
            "updatedAt": created_at,
            "chiefComplaint": chief_complaint,
            "summary": summary_vitals,
        }
    )

    emit_event("BOOKED", item)

    return json_response({"appointmentId": appointment_id, "status": "PENDING"}, 201)

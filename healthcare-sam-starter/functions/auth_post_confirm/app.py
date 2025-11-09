import json
import logging
import os
from datetime import datetime
from typing import Any, Dict

import boto3

LOGGER = logging.getLogger()
LOGGER.setLevel(os.getenv("LOG_LEVEL", "INFO"))

dynamodb = boto3.resource("dynamodb")
users_table = dynamodb.Table(os.environ["USERS_TABLE_NAME"])

ALLOWED_SPECIALTIES = {
    "Cardiology",
    "General Practice",
    "Dermatology",
    "Neurology",
    "Orthopedics",
    "Pediatrics",
    "Ophthalmology",
    "ENT",
    "Endocrinology",
    "Gastroenterology",
    "Psychiatry",
    "Pulmonology",
    "Urology",
    "Gynecology",
}

ALLOWED_LANGUAGES = {"English", "French", "German", "Spanish"}
ALLOWED_CITIES = {"Paris", "Lyon", "Marseille", "Toulouse"}


def parse_doctor_profile(role: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
    if role != "DOCTOR":
        return {}
    specialty = metadata.get("doctorSpecialty")
    city = metadata.get("doctorCity")
    languages_raw = (metadata.get("doctorLanguages") or "")
    slots_raw = metadata.get("doctorSlots")

    languages = [lang.strip() for lang in languages_raw.split(",") if lang.strip()]
    languages = [lang for lang in languages if lang in ALLOWED_LANGUAGES]

    avail_slots: list[str] = []
    if slots_raw:
        try:
            decoded = json.loads(slots_raw)
            if isinstance(decoded, list):
                avail_slots = [slot for slot in decoded if isinstance(slot, str)]
        except json.JSONDecodeError:
            LOGGER.warning("Invalid slot payload in metadata")

    profile: Dict[str, Any] = {}
    if specialty in ALLOWED_SPECIALTIES:
        profile["specialty"] = specialty
    if city in ALLOWED_CITIES:
        profile["city"] = city
    if languages:
        profile["languages"] = languages
    if avail_slots:
        profile["availSlots"] = avail_slots

    return profile


def lambda_handler(event: Dict[str, Any], _context: Any) -> Dict[str, Any]:
    LOGGER.debug("Post confirmation event: %s", json.dumps(event))

    user_attributes = event.get("request", {}).get("userAttributes", {})
    client_metadata = event.get("request", {}).get("clientMetadata", {})
    sub = user_attributes.get("sub")
    email = user_attributes.get("email")
    role = user_attributes.get("custom:role") or user_attributes.get("role")
    first_name = user_attributes.get("given_name", "")
    last_name = user_attributes.get("family_name", "")

    if not sub or not email:
        LOGGER.error("Missing sub or email in post confirmation event")
        raise ValueError("Missing required user attributes")

    doctor_profile = parse_doctor_profile(role or "PATIENT", client_metadata or {})

    item = {
        "userId": sub,
        "email": email,
        "role": role or "PATIENT",
        "firstName": first_name,
        "lastName": last_name,
        "createdAt": datetime.utcnow().isoformat(),
    }

    if doctor_profile:
        item["doctorProfile"] = doctor_profile

    users_table.put_item(Item=item)

    return event

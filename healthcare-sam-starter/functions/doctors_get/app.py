import os
import sys
from typing import Any, Dict, List

from boto3.dynamodb.conditions import Attr

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, os.pardir))
if PARENT_DIR not in sys.path:
    sys.path.append(PARENT_DIR)

from common import json_response, require_role, users_table  # noqa: E402

FILTER_FIELDS = {
    "specialty": ("doctorProfile.specialty", False),
    "city": ("doctorProfile.city", False),
    "language": ("doctorProfile.languages", True),
}


def build_filter_expression(params: Dict[str, str]):
    expression = Attr("role").eq("DOCTOR")
    for key, (attr_name, is_contains) in FILTER_FIELDS.items():
        value = params.get(key)
        if not value:
            continue
        attr = Attr(attr_name)
        expression = expression & (attr.contains(value) if is_contains else attr.eq(value))
    return expression


def normalise_doctor(item: Dict[str, Any]) -> Dict[str, Any]:
    profile = item.get("doctorProfile") or {}
    if not profile:
        legacy = {
            "specialty": item.get("specialty"),
            "languages": item.get("languages"),
            "city": item.get("location"),
        }
        profile = {k: v for k, v in legacy.items() if v}
    languages = profile.get("languages")
    if isinstance(languages, str):
        profile["languages"] = [lang.strip() for lang in languages.split(",") if lang.strip()]
    profile.setdefault("languages", [])
    profile.setdefault("availSlots", [])
    result = {
        "userId": item.get("userId"),
        "firstName": item.get("firstName"),
        "lastName": item.get("lastName"),
        "email": item.get("email"),
        "doctorProfile": profile,
    }
    return result


def lambda_handler(event: Dict[str, Any], _context: Any):
    forbidden = require_role(event, ["PATIENT", "DOCTOR"])
    if forbidden:
        return forbidden

    params = event.get("queryStringParameters") or {}
    filter_expression = build_filter_expression(params)

    scan_kwargs: Dict[str, Any] = {
        "FilterExpression": filter_expression,
    }

    response = users_table.scan(**scan_kwargs)
    items: List[Dict[str, Any]] = response.get("Items", [])

    normalised = [normalise_doctor(item) for item in items]
    normalised.sort(key=lambda item: (item["doctorProfile"].get("city", ""), item.get("lastName", "")))

    return json_response({"items": normalised})

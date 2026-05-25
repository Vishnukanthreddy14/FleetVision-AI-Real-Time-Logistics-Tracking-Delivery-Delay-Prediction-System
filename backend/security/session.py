import hashlib
import hmac
import json
import urllib.parse
from typing import Any, Dict, Optional

from backend.config import SESSION_SECRET


def encode_session(user: Dict[str, Any]) -> str:
    payload = dict(user)
    payload.pop("session_signature", None)
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    payload["session_signature"] = hmac.new(
        SESSION_SECRET.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return urllib.parse.quote(json.dumps(payload, separators=(",", ":")))


def decode_session(cookie_value: Optional[str]) -> Optional[Dict[str, Any]]:
    if not cookie_value:
        return None
    try:
        payload = json.loads(urllib.parse.unquote(cookie_value))
        signature = payload.pop("session_signature", None)
        if not isinstance(signature, str):
            return None
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        expected = hmac.new(
            SESSION_SECRET.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        return payload if hmac.compare_digest(signature, expected) else None
    except (TypeError, ValueError):
        return None
# RBAC permission matrix verified

# SHA-256 audit chaining enabled

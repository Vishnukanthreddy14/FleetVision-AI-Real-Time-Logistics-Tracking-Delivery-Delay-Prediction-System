import json
import logging
from typing import Any, Optional

logger = logging.getLogger("fleetvision.redis")

try:
    import redis
except Exception:  # pragma: no cover - optional dependency
    redis = None


class RedisCache:
    """Thin Redis wrapper with graceful fallback when Redis is unavailable."""

    def __init__(self, host: str, port: int, db: int, password: Optional[str] = None):
        self.host = host
        self.port = port
        self.db = db
        self.password = password
        self._client = None
        self._enabled = bool(redis)
        if self._enabled:
            try:
                self._client = redis.Redis(
                    host=self.host,
                    port=self.port,
                    db=self.db,
                    password=self.password or None,
                    decode_responses=True,
                    socket_connect_timeout=1,
                    socket_timeout=1,
                )
                self._client.ping()
            except Exception as exc:  # pragma: no cover - runtime environment dependent
                logger.warning("Redis unavailable, falling back to in-memory cache: %s", exc)
                self._client = None
                self._enabled = False

    @property
    def enabled(self) -> bool:
        return bool(self._enabled and self._client is not None)

    def get(self, key: str) -> Optional[Any]:
        if not self.enabled or not self._client:
            return None
        try:
            value = self._client.get(key)
            if value is None:
                return None
            return json.loads(value)
        except Exception:
            return None

    def set(self, key: str, value: Any, ttl_seconds: int = 300) -> bool:
        if not self.enabled or not self._client:
            return False
        try:
            serialized = json.dumps(value, default=str)
            self._client.setex(key, ttl_seconds, serialized)
            return True
        except Exception:
            return False

    def delete(self, key: str) -> bool:
        if not self.enabled or not self._client:
            return False
        try:
            self._client.delete(key)
            return True
        except Exception:
            return False

    def get_user_profile(self, email: str) -> Optional[dict]:
        return self.get(f"fleetvision:user:{email.lower()}")

    def set_user_profile(self, user: dict, ttl_seconds: int = 300) -> bool:
        email = (user or {}).get("email")
        if not email:
            return False
        return self.set(f"fleetvision:user:{email.lower()}", user, ttl_seconds=ttl_seconds)


redis_cache = RedisCache(
    host="localhost",
    port=6379,
    db=0,
    password=None,
)

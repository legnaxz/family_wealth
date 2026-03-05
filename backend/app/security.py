import os
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET = os.getenv("APP_SECRET", "change-me")
ALG = "HS256"


def hash_password(raw: str) -> str:
    return pwd_context.hash(raw)


def verify_password(raw: str, hashed: str) -> bool:
    return pwd_context.verify(raw, hashed)


def create_access_token(user_id: int, expires_hours: int = 24) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=expires_hours)).timestamp()),
    }
    return jwt.encode(payload, SECRET, algorithm=ALG)


def decode_access_token(token: str) -> int:
    try:
        payload = jwt.decode(token, SECRET, algorithms=[ALG])
        sub = payload.get("sub")
        if not sub:
            raise ValueError("missing subject")
        return int(sub)
    except (JWTError, ValueError) as e:
        raise ValueError("invalid token") from e

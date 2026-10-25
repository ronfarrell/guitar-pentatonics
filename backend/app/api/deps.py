"""Shared request dependencies."""
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.services import auth

_bearer = HTTPBearer(auto_error=False)


def current_token(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> str:
    if creds is None:
        raise HTTPException(status_code=401, detail="Not signed in")
    return creds.credentials


def current_user(token: str = Depends(current_token)) -> dict:
    user = auth.get_user_for_token(token)
    if user is None:
        raise HTTPException(status_code=401, detail="Session expired")
    return user

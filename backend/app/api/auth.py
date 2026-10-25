from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import current_token, current_user
from app.models.auth import (
    AuthResponse,
    LoginRequest,
    PasswordChange,
    ProfileUpdate,
    RegisterRequest,
    User,
)
from app.services import auth as service

router = APIRouter()


@router.post("/register", response_model=AuthResponse, status_code=201)
def register(body: RegisterRequest):
    display_name = (body.display_name or "").strip() or None
    user = service.create_user(body.username, body.password, display_name)
    if user is None:
        raise HTTPException(status_code=409, detail="That username is taken")

    return AuthResponse(token=service.create_session(user["id"]), user=user)


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest):
    user = service.authenticate(body.username.strip(), body.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Wrong username or password")

    return AuthResponse(token=service.create_session(user["id"]), user=user)


@router.post("/logout")
def logout(token: str = Depends(current_token)):
    service.delete_session(token)
    return {"status": "signed_out"}


@router.get("/me", response_model=User)
def me(user: dict = Depends(current_user)):
    return user


@router.patch("/me", response_model=User)
def update_profile(body: ProfileUpdate, user: dict = Depends(current_user)):
    return service.update_display_name(user["id"], body.display_name.strip())


@router.post("/me/password")
def change_password(
    body: PasswordChange,
    user: dict = Depends(current_user),
    token: str = Depends(current_token),
):
    if not service.change_password(user["id"], body.current_password, body.new_password, token):
        raise HTTPException(status_code=403, detail="Current password is incorrect")

    return {"status": "changed"}

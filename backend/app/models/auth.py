from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(..., min_length=6, max_length=200)
    display_name: str | None = Field(None, max_length=60)


class LoginRequest(BaseModel):
    username: str
    password: str


class ProfileUpdate(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=60)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6, max_length=200)


class User(BaseModel):
    id: int
    username: str
    display_name: str
    created_at: str | None = None


class AuthResponse(BaseModel):
    token: str
    user: User

from pydantic import BaseModel, ConfigDict, Field, field_validator


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=1024)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        return value.strip().casefold()


class AdminRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: str


class AuthResponse(BaseModel):
    user: AdminRead
    csrf_token: str

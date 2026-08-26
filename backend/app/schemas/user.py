from pydantic import BaseModel, model_validator
from typing import Optional, List


class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    full_name: str
    role: str
    celula: Optional[str] = None
    microcelda: Optional[str] = None
    microceldas: Optional[List[str]] = None
    is_active: bool

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def normalise_microceldas(self):
        """Garantiza que microceldas sea siempre una lista (nunca None si microcelda existe)."""
        if not self.microceldas and self.microcelda:
            self.microceldas = [self.microcelda]
        return self


class UserCreate(BaseModel):
    username: str
    full_name: str
    password: str
    role: str = "supervisor_microcelda"
    celula: Optional[str] = None
    microcelda: Optional[str] = None          # legacy – se ignora si se envía microceldas
    microceldas: Optional[List[str]] = None   # nueva forma recomendada


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    celula: Optional[str] = None
    microcelda: Optional[str] = None
    microceldas: Optional[List[str]] = None
    is_active: Optional[bool] = None


class UserList(BaseModel):
    id: int
    username: str
    full_name: str
    role: str
    celula: Optional[str] = None
    microcelda: Optional[str] = None
    microceldas: Optional[List[str]] = None
    is_active: bool

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def normalise_microceldas(self):
        if not self.microceldas and self.microcelda:
            self.microceldas = [self.microcelda]
        return self


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

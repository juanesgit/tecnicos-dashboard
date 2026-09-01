from pydantic import BaseModel
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
    celulas: Optional[List[str]] = None
    is_active: bool
    disponible: bool = False

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    username: str
    full_name: str
    password: str
    role: str = "supervisor_microcelda"
    celula: Optional[str] = None
    microcelda: Optional[str] = None
    microceldas: Optional[List[str]] = None
    celulas: Optional[List[str]] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    celula: Optional[str] = None
    microcelda: Optional[str] = None
    microceldas: Optional[List[str]] = None
    celulas: Optional[List[str]] = None
    is_active: Optional[bool] = None


class UserList(BaseModel):
    id: int
    username: str
    full_name: str
    role: str
    celula: Optional[str] = None
    microcelda: Optional[str] = None
    microceldas: Optional[List[str]] = None
    celulas: Optional[List[str]] = None
    is_active: bool

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

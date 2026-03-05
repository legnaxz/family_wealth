from datetime import date
from pydantic import BaseModel, EmailStr

class UserCreate(BaseModel):
    email: EmailStr
    password: str

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class TokenOut(BaseModel):
    access_token: str

class HouseholdCreate(BaseModel):
    name: str

class AccountCreate(BaseModel):
    household_id: int
    name: str
    type: str
    currency: str = "KRW"

class AssetCreate(BaseModel):
    household_id: int
    account_id: int | None = None
    name: str
    category: str = "other"

class LiabilityCreate(BaseModel):
    household_id: int
    name: str
    lender: str | None = None

class ValuationCreate(BaseModel):
    household_id: int
    asset_id: int | None = None
    liability_id: int | None = None
    as_of_date: date
    amount: float

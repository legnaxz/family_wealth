from datetime import date
from pydantic import BaseModel, EmailStr

class UserCreate(BaseModel):
    email: EmailStr
    password: str

class LoginIn(BaseModel):
    email: EmailStr
    password: str
    otp_code: str | None = None

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
    owner_scope: str = "self"
    name: str
    category: str = "other"
    category_group: str = "other"
    source: str = "manual"

class LiabilityCreate(BaseModel):
    household_id: int
    owner_scope: str = "self"
    name: str
    lender: str | None = None
    category_group: str = "other"
    source: str = "manual"

class ValuationCreate(BaseModel):
    household_id: int
    owner_scope: str = "self"
    asset_id: int | None = None
    liability_id: int | None = None
    as_of_date: date
    amount: float

class HoldingCreate(BaseModel):
    household_id: int
    owner_scope: str = "self"
    asset_class: str
    symbol: str
    display_name: str
    quantity: float
    avg_buy_price: float | None = None
    currency: str = "KRW"
    source: str = "manual"

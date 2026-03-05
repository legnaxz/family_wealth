from datetime import date, datetime, timedelta, timezone
import hashlib
import secrets
import os
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from openpyxl import load_workbook

from .database import get_db
from .models import (
    User,
    Household,
    HouseholdMember,
    Account,
    Asset,
    Liability,
    Valuation,
    Transaction,
    InvitationToken,
    NetWorthSnapshot,
    AuditLog,
)
from .schemas import UserCreate, LoginIn, TokenOut, HouseholdCreate, AccountCreate, AssetCreate, LiabilityCreate, ValuationCreate
from .security import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
    generate_totp_secret,
    verify_totp,
    totp_uri,
)

app = FastAPI(title="Family Wealth MVP")
security = HTTPBearer(auto_error=False)
AUTH_DISABLED = os.getenv("AUTH_DISABLED", "false").lower() in {"1", "true", "yes"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ROLE_RANK = {"viewer": 1, "member": 2, "admin": 3, "owner": 4}


def excel_serial_to_date(value) -> date:
    if isinstance(value, date):
        return value
    try:
        n = float(value)
        return (datetime(1899, 12, 30) + timedelta(days=n)).date()
    except Exception:
        return date.fromisoformat(str(value))


def get_current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if AUTH_DISABLED:
        demo = db.scalar(select(User).where(User.email == "demo@local"))
        if not demo:
            demo = User(email="demo@local", password_hash=hash_password("demo"))
            db.add(demo)
            db.commit()
            db.refresh(demo)
        return demo

    if not cred:
        raise HTTPException(401, "missing access token")
    try:
        user_id = decode_access_token(cred.credentials)
    except ValueError:
        raise HTTPException(401, "invalid access token")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(401, "user not found")
    return user


def get_household_role(db: Session, household_id: int, user_id: int) -> str | None:
    m = db.scalar(
        select(HouseholdMember).where(
            HouseholdMember.household_id == household_id,
            HouseholdMember.user_id == user_id,
        )
    )
    return m.role if m else None


def require_household_role(db: Session, household_id: int, user_id: int, minimum_role: str) -> str:
    if AUTH_DISABLED:
        return "owner"
    role = get_household_role(db, household_id, user_id)
    if not role:
        raise HTTPException(403, "not a household member")
    if ROLE_RANK.get(role, 0) < ROLE_RANK.get(minimum_role, 999):
        raise HTTPException(403, f"requires role >= {minimum_role}")
    return role


def audit(db: Session, household_id: int, actor_user_id: int, action: str, target_type: str, target_id: str, detail: str | None = None):
    db.add(
        AuditLog(
            household_id=household_id,
            actor_user_id=actor_user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            detail=detail,
        )
    )


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/auth/register", response_model=TokenOut)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    exists = db.scalar(select(User).where(User.email == payload.email))
    if exists:
        raise HTTPException(400, "email already exists")
    user = User(email=payload.email, password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"access_token": create_access_token(user.id)}


@app.post("/auth/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "invalid credentials")
    if user.otp_enabled:
        if not payload.otp_code or not user.otp_secret or not verify_totp(user.otp_secret, payload.otp_code):
            raise HTTPException(401, "2fa code required or invalid")
    return {"access_token": create_access_token(user.id)}


@app.post("/auth/2fa/setup")
def setup_2fa(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.otp_enabled and user.otp_secret:
        return {"secret": user.otp_secret, "otpauth_uri": totp_uri(user.otp_secret, user.email)}
    secret = generate_totp_secret()
    user.otp_secret = secret
    db.commit()
    return {"secret": secret, "otpauth_uri": totp_uri(secret, user.email)}


@app.post("/auth/2fa/enable")
def enable_2fa(code: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.otp_secret:
        raise HTTPException(400, "2fa setup required")
    if not verify_totp(user.otp_secret, code):
        raise HTTPException(400, "invalid otp code")
    user.otp_enabled = True
    db.commit()
    return {"ok": True, "otp_enabled": True}


@app.post("/households")
def create_household(payload: HouseholdCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    h = Household(name=payload.name, owner_user_id=user.id)
    db.add(h)
    db.commit()
    db.refresh(h)

    db.add(HouseholdMember(household_id=h.id, user_id=user.id, role="owner"))
    audit(db, h.id, user.id, "create", "household", str(h.id))
    db.commit()
    return {"id": h.id, "name": h.name}


@app.post("/households/{household_id}/members")
def add_household_member(household_id: int, email: str, role: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if role not in ROLE_RANK:
        raise HTTPException(400, "invalid role")
    require_household_role(db, household_id, user.id, "admin")
    target = db.scalar(select(User).where(User.email == email))
    if not target:
        raise HTTPException(404, "target user not found")

    existing = db.scalar(select(HouseholdMember).where(HouseholdMember.household_id == household_id, HouseholdMember.user_id == target.id))
    if existing:
        existing.role = role
    else:
        db.add(HouseholdMember(household_id=household_id, user_id=target.id, role=role))
    audit(db, household_id, user.id, "upsert", "household_member", f"{target.id}:{role}")
    db.commit()
    return {"ok": True}


@app.post("/households/{household_id}/invite-tokens")
def create_invite_token(
    household_id: int,
    role: str = "member",
    expires_hours: int = 72,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_household_role(db, household_id, user.id, "admin")
    if role not in ROLE_RANK:
        raise HTTPException(400, "invalid role")
    if role == "owner":
        raise HTTPException(400, "owner invite not allowed")
    token = secrets.token_urlsafe(24)
    row = InvitationToken(
        token=token,
        household_id=household_id,
        role=role,
        created_by_user_id=user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=expires_hours),
    )
    db.add(row)
    audit(db, household_id, user.id, "create", "invitation_token", token, detail=f"role={role}")
    db.commit()
    return {"token": token, "role": role, "expiresHours": expires_hours}


@app.post("/households/join")
def join_household(token: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    inv = db.get(InvitationToken, token)
    if not inv:
        raise HTTPException(404, "invalid invite token")
    if inv.used:
        raise HTTPException(400, "invite already used")
    if inv.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(400, "invite expired")

    existing = db.scalar(select(HouseholdMember).where(HouseholdMember.household_id == inv.household_id, HouseholdMember.user_id == user.id))
    if existing:
        existing.role = inv.role
    else:
        db.add(HouseholdMember(household_id=inv.household_id, user_id=user.id, role=inv.role))

    inv.used = True
    inv.used_by_user_id = user.id
    audit(db, inv.household_id, user.id, "join", "invitation_token", token, detail=f"role={inv.role}")
    db.commit()
    return {"ok": True, "household_id": inv.household_id, "role": inv.role}


@app.post("/accounts")
def create_account(payload: AccountCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_household_role(db, payload.household_id, user.id, "member")
    row = Account(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    audit(db, row.household_id, user.id, "create", "account", str(row.id))
    db.commit()
    return {"id": row.id}


@app.post("/assets")
def create_asset(payload: AssetCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_household_role(db, payload.household_id, user.id, "member")
    row = Asset(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    audit(db, row.household_id, user.id, "create", "asset", str(row.id))
    db.commit()
    return {"id": row.id}


@app.post("/liabilities")
def create_liability(payload: LiabilityCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_household_role(db, payload.household_id, user.id, "member")
    row = Liability(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    audit(db, row.household_id, user.id, "create", "liability", str(row.id))
    db.commit()
    return {"id": row.id}


@app.post("/valuations")
def create_valuation(payload: ValuationCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_household_role(db, payload.household_id, user.id, "member")
    row = Valuation(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    audit(db, row.household_id, user.id, "create", "valuation", str(row.id))
    db.commit()
    return {"id": row.id}


@app.post("/imports/xlsx")
def import_xlsx(household_id: int, file: UploadFile = File(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_household_role(db, household_id, user.id, "member")
    wb = load_workbook(file.file, data_only=True)

    imported = 0
    skipped_duplicates = 0

    if "가계부 내역" in wb.sheetnames:
        ws = wb["가계부 내역"]
        for idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
            # 날짜,시간,타입,대분류,소분류,내용,금액,화폐,결제수단,메모
            if not row or row[0] is None or row[2] is None or row[6] is None:
                continue
            tx_date = excel_serial_to_date(row[0])
            tx_type = str(row[2]).strip()
            category = str(row[3]).strip() if row[3] else None
            subcategory = str(row[4]).strip() if row[4] else None
            content = str(row[5]).strip() if row[5] else None
            amount = float(row[6])
            currency = str(row[7]).strip() if row[7] else "KRW"
            payment_method = str(row[8]).strip() if row[8] else None

            raw_key = f"{tx_date}|{tx_type}|{category}|{subcategory}|{content}|{amount}|{currency}|{payment_method}"
            tx_hash = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
            exists = db.scalar(select(Transaction).where(Transaction.household_id == household_id, Transaction.tx_hash == tx_hash))
            if exists:
                skipped_duplicates += 1
                continue

            db.add(
                Transaction(
                    household_id=household_id,
                    tx_date=tx_date,
                    tx_type=tx_type,
                    category=category,
                    subcategory=subcategory,
                    content=content,
                    amount=amount,
                    currency=currency,
                    payment_method=payment_method,
                    tx_hash=tx_hash,
                )
            )
            imported += 1
    else:
        # fallback simple format: date,type(asset/liability),name,amount
        ws = wb.active
        for row in ws.iter_rows(min_row=2, values_only=True):
            if not row or not row[0] or not row[1] or not row[2] or row[3] is None:
                continue
            as_of_date = excel_serial_to_date(row[0])
            kind = str(row[1]).lower().strip()
            name = str(row[2]).strip()
            amount = float(row[3])
            if kind == "asset":
                target = db.scalar(select(Asset).where(Asset.household_id == household_id, Asset.name == name))
                if not target:
                    target = Asset(household_id=household_id, name=name, category="imported")
                    db.add(target)
                    db.flush()
                db.add(Valuation(household_id=household_id, asset_id=target.id, as_of_date=as_of_date, amount=amount))
                imported += 1
            elif kind == "liability":
                target = db.scalar(select(Liability).where(Liability.household_id == household_id, Liability.name == name))
                if not target:
                    target = Liability(household_id=household_id, name=name)
                    db.add(target)
                    db.flush()
                db.add(Valuation(household_id=household_id, liability_id=target.id, as_of_date=as_of_date, amount=amount))
                imported += 1

    audit(
        db,
        household_id,
        user.id,
        "import",
        "xlsx",
        file.filename or "upload",
        detail=f"imported={imported}, skipped_duplicates={skipped_duplicates}",
    )
    db.commit()
    return {"imported": imported, "skipped_duplicates": skipped_duplicates}


@app.post("/snapshots/recompute")
def recompute_snapshots(household_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_household_role(db, household_id, user.id, "member")
    dates = db.scalars(select(Valuation.as_of_date).where(Valuation.household_id == household_id).distinct()).all()
    count = 0
    for d in dates:
        assets_total = db.scalar(
            select(func.coalesce(func.sum(Valuation.amount), 0)).where(
                Valuation.household_id == household_id,
                Valuation.as_of_date == d,
                Valuation.asset_id.is_not(None),
            )
        )
        liabilities_total = db.scalar(
            select(func.coalesce(func.sum(Valuation.amount), 0)).where(
                Valuation.household_id == household_id,
                Valuation.as_of_date == d,
                Valuation.liability_id.is_not(None),
            )
        )
        net = float(assets_total) - float(liabilities_total)
        existing = db.scalar(
            select(NetWorthSnapshot).where(NetWorthSnapshot.household_id == household_id, NetWorthSnapshot.snapshot_date == d)
        )
        if existing:
            existing.assets_total = assets_total
            existing.liabilities_total = liabilities_total
            existing.net_worth = net
        else:
            db.add(
                NetWorthSnapshot(
                    household_id=household_id,
                    snapshot_date=d,
                    assets_total=assets_total,
                    liabilities_total=liabilities_total,
                    net_worth=net,
                )
            )
        count += 1

    audit(db, household_id, user.id, "recompute", "net_worth_snapshots", str(count))
    db.commit()
    return {"snapshots": count}


@app.get("/households/{household_id}/reports/monthly")
def monthly_report(
    household_id: int,
    year: int,
    month: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_household_role(db, household_id, user.id, "viewer")
    prefix = f"{year:04d}-{month:02d}-"

    income = db.scalar(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.household_id == household_id,
            Transaction.tx_type == "수입",
            func.to_char(Transaction.tx_date, "YYYY-MM-DD").like(f"{prefix}%"),
        )
    )
    expense = db.scalar(
        select(func.coalesce(func.sum(func.abs(Transaction.amount)), 0)).where(
            Transaction.household_id == household_id,
            Transaction.tx_type == "지출",
            func.to_char(Transaction.tx_date, "YYYY-MM-DD").like(f"{prefix}%"),
        )
    )

    by_category_rows = db.execute(
        select(Transaction.category, func.coalesce(func.sum(Transaction.amount), 0))
        .where(
            Transaction.household_id == household_id,
            Transaction.tx_type == "지출",
            func.to_char(Transaction.tx_date, "YYYY-MM-DD").like(f"{prefix}%"),
        )
        .group_by(Transaction.category)
        .order_by(func.sum(Transaction.amount).asc())
    ).all()

    by_category = [
        {"category": r[0] or "미분류", "amount": abs(float(r[1]))}
        for r in by_category_rows
    ]

    return {
        "year": year,
        "month": month,
        "income": float(income),
        "expense": float(expense),
        "cashflow": float(income) - float(expense),
        "expenseByCategory": by_category,
    }


@app.get("/households/{household_id}/balances/by-payment-method")
def balances_by_payment_method(
    household_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_household_role(db, household_id, user.id, "viewer")
    rows = db.execute(
        select(Transaction.payment_method, func.coalesce(func.sum(Transaction.amount), 0))
        .where(Transaction.household_id == household_id)
        .group_by(Transaction.payment_method)
        .order_by(func.sum(Transaction.amount).desc())
    ).all()
    return [
        {"paymentMethod": r[0] or "(미지정)", "balance": float(r[1])}
        for r in rows
    ]


@app.get("/households/{household_id}/net-worth")
def net_worth(household_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_household_role(db, household_id, user.id, "viewer")
    rows = db.scalars(
        select(NetWorthSnapshot).where(NetWorthSnapshot.household_id == household_id).order_by(NetWorthSnapshot.snapshot_date.asc())
    ).all()
    return [
        {
            "date": r.snapshot_date.isoformat(),
            "assets": float(r.assets_total),
            "liabilities": float(r.liabilities_total),
            "netWorth": float(r.net_worth),
        }
        for r in rows
    ]

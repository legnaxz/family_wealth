from datetime import date
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from openpyxl import load_workbook

from .database import Base, engine, get_db
from .models import User, Household, HouseholdMember, Account, Asset, Liability, Valuation, NetWorthSnapshot, AuditLog
from .schemas import UserCreate, LoginIn, TokenOut, HouseholdCreate, AccountCreate, AssetCreate, LiabilityCreate, ValuationCreate
from .security import hash_password, verify_password, create_access_token

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Family Wealth MVP")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    return {"access_token": create_access_token(user.id)}

@app.post("/households")
def create_household(payload: HouseholdCreate, user_id: int = 1, db: Session = Depends(get_db)):
    h = Household(name=payload.name, owner_user_id=user_id)
    db.add(h)
    db.commit()
    db.refresh(h)
    db.add(HouseholdMember(household_id=h.id, user_id=user_id, role="owner"))
    db.add(AuditLog(household_id=h.id, actor_user_id=user_id, action="create", target_type="household", target_id=str(h.id)))
    db.commit()
    return {"id": h.id, "name": h.name}

@app.post("/accounts")
def create_account(payload: AccountCreate, user_id: int = 1, db: Session = Depends(get_db)):
    row = Account(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    db.add(AuditLog(household_id=row.household_id, actor_user_id=user_id, action="create", target_type="account", target_id=str(row.id)))
    db.commit()
    return {"id": row.id}

@app.post("/assets")
def create_asset(payload: AssetCreate, user_id: int = 1, db: Session = Depends(get_db)):
    row = Asset(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    db.add(AuditLog(household_id=row.household_id, actor_user_id=user_id, action="create", target_type="asset", target_id=str(row.id)))
    db.commit()
    return {"id": row.id}

@app.post("/liabilities")
def create_liability(payload: LiabilityCreate, user_id: int = 1, db: Session = Depends(get_db)):
    row = Liability(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    db.add(AuditLog(household_id=row.household_id, actor_user_id=user_id, action="create", target_type="liability", target_id=str(row.id)))
    db.commit()
    return {"id": row.id}

@app.post("/valuations")
def create_valuation(payload: ValuationCreate, user_id: int = 1, db: Session = Depends(get_db)):
    row = Valuation(**payload.model_dump())
    db.add(row)
    db.commit()
    db.add(AuditLog(household_id=row.household_id, actor_user_id=user_id, action="create", target_type="valuation", target_id=str(row.id)))
    db.commit()
    return {"id": row.id}

@app.post("/imports/xlsx")
def import_xlsx(household_id: int, file: UploadFile = File(...), user_id: int = 1, db: Session = Depends(get_db)):
    wb = load_workbook(file.file)
    ws = wb.active
    imported = 0
    for idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        # Expected: date, type(asset/liability), name, amount
        if not row or not row[0] or not row[1] or not row[2] or row[3] is None:
            continue
        as_of_date = row[0] if isinstance(row[0], date) else date.fromisoformat(str(row[0]))
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
    db.add(AuditLog(household_id=household_id, actor_user_id=user_id, action="import", target_type="xlsx", target_id=file.filename or "upload"))
    db.commit()
    return {"imported": imported}

@app.post("/snapshots/recompute")
def recompute_snapshots(household_id: int, db: Session = Depends(get_db)):
    dates = db.scalars(select(Valuation.as_of_date).where(Valuation.household_id == household_id).distinct()).all()
    count = 0
    for d in dates:
        assets_total = db.scalar(select(func.coalesce(func.sum(Valuation.amount), 0)).where(
            Valuation.household_id == household_id,
            Valuation.as_of_date == d,
            Valuation.asset_id.is_not(None)
        ))
        liabilities_total = db.scalar(select(func.coalesce(func.sum(Valuation.amount), 0)).where(
            Valuation.household_id == household_id,
            Valuation.as_of_date == d,
            Valuation.liability_id.is_not(None)
        ))
        net = float(assets_total) - float(liabilities_total)
        existing = db.scalar(select(NetWorthSnapshot).where(NetWorthSnapshot.household_id == household_id, NetWorthSnapshot.snapshot_date == d))
        if existing:
            existing.assets_total = assets_total
            existing.liabilities_total = liabilities_total
            existing.net_worth = net
        else:
            db.add(NetWorthSnapshot(household_id=household_id, snapshot_date=d, assets_total=assets_total, liabilities_total=liabilities_total, net_worth=net))
        count += 1
    db.commit()
    return {"snapshots": count}

@app.get("/households/{household_id}/net-worth")
def net_worth(household_id: int, db: Session = Depends(get_db)):
    rows = db.scalars(select(NetWorthSnapshot).where(NetWorthSnapshot.household_id == household_id).order_by(NetWorthSnapshot.snapshot_date.asc())).all()
    return [
        {
            "date": r.snapshot_date.isoformat(),
            "assets": float(r.assets_total),
            "liabilities": float(r.liabilities_total),
            "netWorth": float(r.net_worth),
        }
        for r in rows
    ]

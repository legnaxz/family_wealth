# Family Wealth MVP

## Run

```bash
docker compose up --build
```

Backend container boot command runs migrations automatically.
For quick UI-first local dev, auth can be disabled with `AUTH_DISABLED=true`.
In this mode, app uses a fixed local household (id=1) and supports `/imports/xlsx-local`.
Dashboard includes: net worth trend, monthly cashflow bar chart, monthly expense pie, and asset flow(Sankey).

```bash
alembic upgrade head
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000/docs

## What is implemented now

- JWT auth (register/login + Bearer required on protected APIs)
- 2FA(TOTP) setup/enable + login OTP verification
- Household RBAC (owner/admin/member/viewer)
- Household member role upsert API
- Invite token flow (create token / join household)
- Household/account/asset/liability/valuation create APIs
- Net worth snapshots recompute API
- Monthly report API (income/expense/cashflow + expense category breakdown)
- Payment-method balance aggregation API
- Net worth chart web page
- XLSX import
  - **Real format support**: `가계부 내역` sheet import to `transactions`
  - Idempotent by `tx_hash` unique key (duplicate re-upload skip)
  - Fallback support: simple `date,type,name,amount` format to valuations
- Audit log table

## Core API flow

1. `POST /auth/register` or `POST /auth/login`
2. (선택) `POST /auth/2fa/setup` -> OTP 앱 등록 -> `POST /auth/2fa/enable?code=123456`
3. use `Authorization: Bearer <token>`
4. `POST /households`
4. (선택) `POST /households/{id}/invite-tokens` → `POST /households/join?token=...`
5. create assets/liabilities/valuations or upload xlsx
6. `POST /snapshots/recompute?household_id=<id>`
7. `GET /households/{id}/net-worth`
8. `GET /households/{id}/reports/monthly?year=2026&month=3`
9. `GET /households/{id}/balances/by-payment-method`

## XLSX import (actual provided file)

If workbook has sheet name `가계부 내역`, this schema is parsed:

| 날짜 | 시간 | 타입 | 대분류 | 소분류 | 내용 | 금액 | 화폐 | 결제수단 | 메모 |

Upload endpoint:

`POST /imports/xlsx?household_id=1`

Form-data key: `file`

Response:

```json
{
  "imported": 123,
  "skipped_duplicates": 45
}
```

## Automated BankSalad mail import

A local watcher script is included at `scripts/banksalad_mail_import.py`.

What it does:
- reads local config from `.env` when present
- searches Gmail using `BANKSALAD_GMAIL_QUERY`
- downloads attachments for new matching messages only
- extracts password-protected ZIPs with `BANKSALAD_ZIP_PASSWORD`
- finds `.xlsx` files
- posts them to `BANKSALAD_IMPORT_API`
- keeps processed Gmail message IDs in `runtime/banksalad-mail-import/state.json`

Create your local config:

```bash
cd family-wealth-mvp
cp .env.example .env
```

Example `.env` fields:

```env
BANKSALAD_GMAIL_QUERY=subject:"<your banksalad export mail subject>" has:attachment
BANKSALAD_IMPORT_API=http://localhost:8000/imports/xlsx-local
BANKSALAD_ZIP_PASSWORD=1234
BANKSALAD_OWNER_SCOPE=self
```

Run once manually:

```bash
cd family-wealth-mvp
python3 scripts/banksalad_mail_import.py
```

Inspect matching candidate emails without importing:

```bash
cd family-wealth-mvp
python3 scripts/banksalad_mail_import.py --triage --max-results 5
```

launchd plist template:
- `infra/com.familywealth.banksalad-mail-import.plist`

If you use launchd, keep the real query/password in your local `.env` or adapt the plist environment values locally before loading it.

Load it on macOS:

```bash
mkdir -p ~/Library/LaunchAgents
cp infra/com.familywealth.banksalad-mail-import.plist ~/Library/LaunchAgents/
launchctl unload ~/Library/LaunchAgents/com.familywealth.banksalad-mail-import.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/com.familywealth.banksalad-mail-import.plist
```

Logs/runtime:
- `runtime/banksalad-mail-import/logs/latest.log`
- `runtime/banksalad-mail-import/logs/launchd.out.log`
- `runtime/banksalad-mail-import/logs/launchd.err.log`

## Notes

- Schema is now managed by Alembic (`backend/alembic`).
- Useful commands:

```bash
cd backend
alembic upgrade head
alembic revision -m "your_change"
```

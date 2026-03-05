# Family Wealth MVP

## Run

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000/docs

## What is implemented now

- JWT auth (register/login + Bearer required on protected APIs)
- Household RBAC (owner/admin/member/viewer)
- Household member role upsert API
- Household/account/asset/liability/valuation create APIs
- Net worth snapshots recompute API
- Net worth chart web page
- XLSX import
  - **Real format support**: `가계부 내역` sheet import to `transactions`
  - Idempotent by `tx_hash` unique key (duplicate re-upload skip)
  - Fallback support: simple `date,type,name,amount` format to valuations
- Audit log table

## Core API flow

1. `POST /auth/register` or `POST /auth/login`
2. use `Authorization: Bearer <token>`
3. `POST /households`
4. create assets/liabilities/valuations or upload xlsx
5. `POST /snapshots/recompute?household_id=<id>`
6. `GET /households/{id}/net-worth`

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

## Notes

- For local MVP, `Base.metadata.create_all` is used (no Alembic yet).
- Next step recommended: Alembic migrations + invitation token flow + 2FA.

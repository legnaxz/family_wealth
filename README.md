# Family Wealth MVP

## Run

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000/docs

## XLSX import format (active sheet)

| date       | type      | name            | amount   |
|------------|-----------|-----------------|----------|
| 2026-03-01 | asset     | KB Bank         | 12000000 |
| 2026-03-01 | liability | Mortgage        | 30000000 |

Upload endpoint:

`POST /imports/xlsx?household_id=1`

Form-data key: `file`

## Phase 1 included
- Auth(register/login)
- Household/account/asset/liability/valuation create APIs
- Net worth snapshots recompute API
- Net worth chart web page
- XLSX import (basic)
- Audit log table

## TODO (next)
- 실제 JWT 인증 미들웨어 연결
- RBAC(owner/admin/member/viewer)
- transactions + 자동 잔액 계산
- 초대 토큰, 2FA
- 백업 스케줄러 + restore 리허설 스크립트

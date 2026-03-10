# Family Wealth — Backend Architecture Plan

## 목적

현재 `family-wealth-mvp`를 단순 XLSX 가계부 import 앱에서, 다음을 포괄하는 **가족 자산 운영 백엔드**로 확장한다.

- 거래 import (이메일/XLSX)
- 현금/예금/적금
- 주식/ETF
- 코인
- 부동산/보증금/주거 관련 자산
- 부채(전세대출 포함)
- 순자산 및 실질자본(equity) 계산
- 서로 다른 갱신 주기를 가진 데이터 파이프라인

이 문서는 **도메인 분리, 데이터 흐름, 잡 주기, 테이블 방향, API 범위**를 정리하기 위한 아키텍처 초안이다.

---

## 핵심 원칙

1. **원본 데이터(source-of-truth)와 계산 결과를 분리한다**
2. **느린 데이터와 빠른 데이터를 같은 파이프라인으로 다루지 않는다**
3. **owner(self/spouse/shared) 축은 모든 자산/부채/평가에 일관되게 유지한다**
4. **실시간 시세와 스냅샷 저장은 분리한다**
5. **메일 import는 append가 아니라 idempotent / replace 전략을 사용한다**
6. **주거/대출은 단순 자산·부채 합계가 아니라 equity 개념까지 지원한다**

---

# 1. 도메인 구분

## 1.1 느린 도메인

변화가 느리거나 이벤트 기반으로 반영되는 도메인:

- Gmail 기반 BankSalad 메일 import
- 수동 입력 자산
- 수동 입력 부채
- 부동산/보증금
- 전세대출
- 보험/기타 자산

### 특징
- 분/시간/일 단위로 업데이트 가능
- 정확성과 중복 방지가 중요
- 이벤트가 발생했을 때 재계산 트리거가 필요

## 1.2 빠른 도메인

자주 바뀌는 마켓 데이터 기반 도메인:

- 주식 가격
- ETF 가격
- 코인 가격
- 환율

### 특징
- 1분 단위 또는 더 짧은 주기 가능
- 가격 원본과 평가 결과를 분리해야 함
- 캐시와 latest price 저장 전략 필요

## 1.3 계산 도메인

원본을 기반으로 계산되는 도메인:

- 포트폴리오 가치
- 자산 카테고리별 합계
- 부동산/주거 equity
- 순자산 시계열
- 대시보드 인사이트

### 특징
- 저장할 수도 있고, 요청 시 계산할 수도 있음
- 비용과 일관성을 고려해 일부는 스냅샷으로 유지

---

# 2. 전체 아키텍처 다이어그램

## 2.1 시스템 개요

```text
                 ┌──────────────────────────┐
                 │        Frontend UI       │
                 │  Dashboard / Inputs /    │
                 │  Owner tabs / Insights   │
                 └────────────┬─────────────┘
                              │
                              ▼
                 ┌──────────────────────────┐
                 │        API Layer         │
                 │ imports / assets /       │
                 │ liabilities / market /   │
                 │ dashboard / snapshots    │
                 └────────────┬─────────────┘
                              │
      ┌───────────────────────┼────────────────────────┐
      │                       │                        │
      ▼                       ▼                        ▼
┌───────────────┐     ┌───────────────┐        ┌────────────────┐
│ Import Domain │     │ Asset Domain  │        │ Market Domain  │
│ Gmail/XLSX    │     │ holdings/base │        │ stock/crypto   │
│ transactions  │     │ assets/liabs  │        │ prices/rates   │
└──────┬────────┘     └──────┬────────┘        └──────┬─────────┘
       │                     │                         │
       └──────────────┬──────┴──────────────┬──────────┘
                      ▼                     ▼
             ┌────────────────┐    ┌──────────────────┐
             │ Valuation Layer│    │ Snapshot / Cache │
             │ current values │    │ net worth /      │
             │ portfolio calc │    │ daily summaries  │
             └────────┬───────┘    └────────┬─────────┘
                      │                     │
                      └──────────┬──────────┘
                                 ▼
                        ┌─────────────────┐
                        │   SQLite/Postgres│
                        │ source + derived │
                        └─────────────────┘
```

---

## 2.2 갱신 주기 다이어그램

```text
[1분 주기]
- stock/ETF prices
- crypto prices
- FX rates (optional)
- portfolio current valuation cache

[10분 주기]
- BankSalad Gmail import watcher
- XLSX import sync
- dashboard summary refresh trigger

[1일 주기 / 수동]
- 부동산/보증금 평가값
- 대출 잔액 정리
- insurance / 기타 자산 갱신
- daily net worth snapshot rollup
```

---

# 3. 데이터 레이어 설계

## 3.1 이미 있는 것

현재 앱에는 대략 다음이 존재한다.

- `transactions`
- `assets`
- `liabilities`
- `valuations`
- `net_worth_snapshots`

또한 `owner_scope`가 `self / spouse / shared` 축으로 들어가 있다.

## 3.2 앞으로 추가 추천 테이블

### holdings
주식/코인 같은 **수량 기반 자산**을 위한 테이블.

```text
holdings
- id
- household_id
- owner_scope
- asset_class         (stock | etf | crypto)
- symbol              (AAPL, BTC, ETH ...)
- display_name
- quantity
- avg_buy_price       optional
- currency            (KRW, USD)
- source              (manual | imported | api)
- created_at
- updated_at
```

### market_prices
시세 원본 저장용.

```text
market_prices
- id
- symbol
- asset_class
- price
- currency
- source              (alpha_vantage, yahoo, binance, upbit ...)
- fetched_at
```

### latest_market_prices
최신 가격 캐시 테이블(또는 materialized/latest view 역할).

```text
latest_market_prices
- symbol (unique)
- asset_class
- price
- currency
- fetched_at
```

### asset_groups / liability_groups (선택)
표시/분석용 그룹화 메타데이터.

예:
- asset group: cash, stock, crypto, real_estate, deposit, etc
- liability group: jeonse_loan, credit_loan, card, mortgage, etc

### derived_metrics (선택)
자주 쓰는 계산 지표 저장.

예:
- housing_equity
- liquid_assets
- investment_assets
- debt_ratio

초기에는 테이블 없이 계산식으로만 구현해도 충분하다.

---

# 4. 자산/부채 카테고리 전략

## 4.1 자산 카테고리 그룹

추천 그룹:

- `cash`
- `savings`
- `stock`
- `etf`
- `crypto`
- `real_estate`
- `deposit`
- `insurance`
- `other`

## 4.2 부채 카테고리 그룹

추천 그룹:

- `jeonse_loan`
- `credit_loan`
- `card`
- `mortgage`
- `installment`
- `other`

## 4.3 주거 equity

예를 들어 전세 구조는 단순히 자산/부채 합만 보면 직관성이 떨어진다.

예:
- 전세보증금 자산 = 2억
- 전세대출 = 1억 3천
- 실질자본 = 7천

따라서 다음 계산 지표를 별도 지원하는 것이 좋다.

```text
housing_equity = housing_assets - housing_liabilities
```

표시 예:
- 전세보증금
- 전세대출
- 주거 순지분(실질자본)

---

# 5. 데이터 흐름 설계

## 5.1 BankSalad 메일 import

```text
Gmail watcher (10m)
  -> matching mail search
  -> attachment download
  -> ZIP extract
  -> XLSX parse
  -> transactions upsert/dedupe
  -> valuation snapshot replace (same owner_scope + same date)
  -> recompute trigger
```

### 중요 원칙
- 거래는 `tx_hash` dedupe
- valuation은 **same date replace**
- import 결과는 audit에 남김

## 5.2 주식/코인 시세

```text
price job (1m)
  -> fetch latest prices
  -> write latest_market_prices
  -> optional append to market_prices history
  -> recompute portfolio valuation cache
```

## 5.3 순자산 계산

```text
source data
  -> asset/liability valuation aggregation
  -> portfolio current value
  -> owner_scope split
  -> net worth summary
  -> snapshot store (daily or event-based)
```

---

# 6. 서비스 분리 제안

## 추천 디렉터리 구조

```text
backend/app/
  api/
    imports.py
    dashboard.py
    assets.py
    liabilities.py
    holdings.py
    market.py
  services/
    banksalad_import_service.py
    valuation_service.py
    portfolio_service.py
    market_data_service.py
    snapshot_service.py
    equity_service.py
  jobs/
    mail_import_job.py
    market_price_job.py
    snapshot_job.py
  models.py
  schemas.py
  database.py
```

## 역할

### imports service
- 메일/XLSX 파싱
- 거래 dedupe
- valuation snapshot replace

### market data service
- 주식/코인/환율 가격 fetch
- latest price cache write

### portfolio service
- holdings × latest price 계산
- 투자자산 평가액 산출

### valuation service
- 현금/예금/수동자산/부채 통합 valuation 계산

### snapshot service
- 일별 snapshot 생성
- 대시보드용 요약 저장

### equity service
- 주거 equity, 투자 equity, liquid asset 등 파생 지표 계산

---

# 7. API 범위 제안

## 7.1 imports
- `POST /imports/xlsx`
- `POST /imports/xlsx-local`
- `POST /imports/manual-valuation`
- `POST /imports/holdings`

## 7.2 assets/liabilities
- `GET /households/{id}/assets`
- `POST /households/{id}/assets`
- `PATCH /assets/{id}`
- `GET /households/{id}/liabilities`
- `POST /households/{id}/liabilities`
- `PATCH /liabilities/{id}`

## 7.3 holdings / market
- `GET /households/{id}/holdings`
- `POST /households/{id}/holdings`
- `PATCH /holdings/{id}`
- `GET /market/prices/latest`
- `GET /market/prices/history?symbol=...`

## 7.4 derived / dashboard
- `GET /households/{id}/balance-sheet`
- `GET /households/{id}/net-worth`
- `GET /households/{id}/portfolio`
- `GET /households/{id}/equity/housing`
- `GET /households/{id}/dashboard/summary`

---

# 8. 잡 스케줄 제안

## 8.1 1분 잡

### market_price_job
- fetch stock prices
- fetch crypto prices
- update latest_market_prices
- recompute quick portfolio cache

## 8.2 10분 잡

### mail_import_job
- Gmail search
- attachment import
- dedupe/recompute

## 8.3 하루 1회

### snapshot_job
- generate daily net worth snapshot
- rollup category summary
- compute daily insights

## 8.4 수동/이벤트 기반

- 부동산/보증금 값 업데이트
- 대출 잔액 업데이트
- 보험 평가액 업데이트

---

# 9. 캐싱 전략

## latest prices
- 가장 최근 시세는 latest 테이블 또는 메모리 캐시
- UI는 우선 latest 값 읽기

## net worth summary
- 메인 대시보드용 summary는 짧은 TTL 캐시 가능
- 하지만 source-of-truth는 DB aggregation/valuation

## chart/history
- history는 snapshot 기반으로 표시
- 실시간 모든 요청마다 전체 계산하지 않도록 주의

---

# 10. owner_scope 전략

모든 도메인은 owner_scope를 일관되게 가져야 한다.

- `self`
- `spouse`
- `shared`

규칙:
- 본인 메일 import -> `self`
- 배우자 메일 import -> `spouse`
- 공동자산/공동지출 -> `shared`

대시보드 집계:
- 전체 = self + spouse + shared
- 본인 = self
- 배우자 = spouse

향후 shared를 개인에 어떻게 보여줄지 정책은 별도 정의 필요.

---

# 11. 구현 우선순위

## Phase 1 — 현재 구조 안정화
- valuation snapshot replace 완성
- 중복 정리 스크립트/관리 명령 추가
- 에러 배너/운영 가시성 보강

## Phase 2 — 자산 확장
- asset/liability category_group 정리
- 수동 자산/부채 입력 UI + API
- 주거 equity 계산 추가

## Phase 3 — 투자자산 도입
- holdings 테이블 추가
- latest market price fetch 추가
- 주식/코인 portfolio 평가 추가

## Phase 4 — 자동화 고도화
- 1분 market worker
- 10분 mail import worker
- daily snapshot worker

## Phase 5 — 부부 확장
- spouse import route
- spouse dashboard
- shared 정책 반영

---

# 12. 시퀀스 다이어그램

## 12.1 메일 import

```text
Watcher
  -> Gmail API: search new messages
  -> Gmail API: download attachment
  -> Import Service: parse xlsx
  -> DB: replace valuation snapshot for same owner/date
  -> DB: insert new transactions (dedupe by tx_hash)
  -> Snapshot Service: recompute summaries
  -> Dashboard API: updated values available
```

## 12.2 주식/코인 평가

```text
Market Job
  -> Price Source API: fetch prices
  -> latest_market_prices: upsert
  -> Portfolio Service: multiply holdings * latest price
  -> valuations/derived cache: update
  -> Dashboard API: updated investment values available
```

---

# 13. 운영 체크리스트

- import는 idempotent해야 함
- snapshot은 같은 date+owner 기준 replace 가능해야 함
- pricing 실패 시 마지막 성공값 fallback 가능해야 함
- 민감정보는 `.env`에만 둬야 함
- 공개 레포엔 `.env.example`만 올릴 것
- push 전 개인정보/DB/runtime 파일 점검

---

# 결론

이 프로젝트는 이제 단순 가계부가 아니라, **다른 주기의 데이터 파이프라인을 가진 가족 자산 운영 시스템**으로 봐야 한다.

핵심은 세 가지다.

1. **느린 데이터와 빠른 데이터를 분리한다**
2. **원본 데이터와 계산 결과를 분리한다**
3. **owner_scope와 equity 개념을 일관되게 유지한다**

이 문서를 기준으로 다음 단계는:
- 자산/부채 그룹 정리
- holdings/market_prices 도입
- 잡 스케줄 구조화
- 대시보드 파생지표 확대
순으로 진행하면 된다.

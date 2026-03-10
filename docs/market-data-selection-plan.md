# Market Data Selection Plan

## 목표

주식/코인 시세는 전체 시장을 갱신하지 않고, **사용자가 실제로 보유한 ticker만 선택/추적**하는 방식으로 관리한다.

핵심 원칙:
- 전체 시장 refresh 금지
- holdings에 등록된 symbol만 latest price 갱신
- 비용과 rate limit을 최소화
- 선택 가능한 종목/코인 목록 + 직접 입력 fallback 제공

---

## 설계 요약

### 1. holdings가 source of truth
사용자가 실제로 보유한 종목/코인을 먼저 등록한다.

예:
- stock / 005930 / 삼성전자
- stock / AAPL / Apple
- crypto / BTC / Bitcoin
- crypto / ETH / Ethereum

### 2. market_prices는 선택 ticker만 유지
holdings에 존재하는 symbol 집합만 latest price를 갱신한다.

### 3. portfolio valuation은 holdings × latest_market_price
- quantity * latest price
- asset_class 별 합계
- owner_scope 별 합계

---

## 데이터 흐름 다이어그램

```text
User input
  -> holdings 등록
  -> tracked ticker set 생성
  -> market price fetch job
  -> latest_market_prices upsert
  -> valuation / portfolio summary 계산
  -> dashboard 반영
```

---

## UI 설계

### 투자자산 입력 UX
- 자산 종류: stock / etf / crypto
- 검색 또는 추천 목록 선택
- symbol / display name 자동 채움
- 직접 입력 fallback 허용
- 수량 / 평균단가 / 통화 입력

### 추천 목록
초기에는 정적 목록으로 시작:
- 국내주식 주요 티커
- 미국주식 주요 티커
- ETF 주요 티커
- 코인 주요 티커

나중에 검색 API로 확장 가능.

---

## 백엔드 단계별 구현

### Phase A
- static ticker catalog 제공 API
- holdings 입력 시 catalog 기반 선택 가능

### Phase B
- market_prices 수동 입력 API
- latest price 조회 API

### Phase C
- holdings에서 symbol 집합 추출
- 선택 ticker만 최신가 갱신하는 worker/job

### Phase D
- holdings valuation 합산
- 대시보드에 투자자산 평가액 반영

---

## 비용 전략

### 나쁜 방식
- 거래소/증권 API 전체 목록 refresh
- 모든 ticker price fetch

### 좋은 방식
- `distinct(symbol)` from holdings
- 필요한 symbol만 개별 조회
- 결과 latest_market_prices upsert

---

## 예시 시퀀스

```text
1. 사용자가 BTC 0.25 보유 입력
2. holdings에 BTC 저장
3. market job이 BTC 가격만 조회
4. latest_market_prices(BTC) 갱신
5. portfolio value = 0.25 * BTC latest price
6. dashboard 투자자산 카드 반영
```

---

## 결론

선택 ticker 기반 구조는:
- 비용이 싸고
- 운영이 단순하고
- 필요한 자산만 정확히 추적할 수 있다.

이 문서를 기준으로 다음 구현은:
1. ticker catalog
2. market price 입력/조회 API
3. 선택 ticker refresh worker
순으로 진행한다.

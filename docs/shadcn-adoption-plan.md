# Tailwind + shadcn/ui 도입 계획

## 현재 상태

`family-wealth-mvp/frontend`는 다음 상태다.

- Next.js 14 app router
- TypeScript
- 현재 UI는 인라인 스타일 중심
- 비즈니스 로직이 `app/page.tsx`에 비교적 많이 모여 있음
- `OwnerTabs`와 `lib/ui.ts` 정도만 분리된 상태

즉, shadcn/ui를 바로 붙일 수는 있지만, **설치만으로 예쁘게 바뀌는 프로젝트 구조는 아니다**.
도입 목적은 단순 스킨 교체가 아니라 **디자인 시스템과 공통 컴포넌트 기반 마련**이다.

---

## 도입 목표

1. Tailwind CSS를 app router 프로젝트에 안정적으로 도입
2. shadcn/ui 기본 토대 구성
3. 현재 대시보드를 점진적으로 공통 컴포넌트 기반으로 전환
4. 모바일/웹에서 일관된 spacing, radius, button, card, tabs 패턴 확보

---

## 왜 필요한가

현재 프론트는 빠르게 만들기엔 좋지만, 앞으로 아래 요구사항이 늘어난다.

- 전체 / 광석 / 배우자 컨텍스트 분기
- 거래 상세 바텀시트
- 자산/부채 편집 폼
- import 상태 표시
- 모바일 우선 요약 화면
- 웹용 분석 화면

이 상태에서 인라인 스타일만 계속 늘리면:
- 화면 간 일관성 깨짐
- 수정 비용 증가
- 컴포넌트 재사용 어려움
- 모바일 대응이 점점 고통스러워짐

그래서 지금 시점에 Tailwind + shadcn 도입은 타이밍이 맞다.

---

## 선행 원칙

Next.js 바이브코딩 10계명 기준으로 다음 원칙을 적용한다.

1. 디자인 토큰 먼저
2. 폴더 규칙 먼저
3. 타입/스키마 먼저
4. 섹션 단위 조립
5. 공통 컨테이너 강제
6. UI 골격 먼저, 로직은 분리
7. 서버/클라이언트 경계 명시
8. 생성 즉시 build 검증

---

## 제안 폴더 구조

```text
frontend/
  app/
    globals.css
    layout.tsx
    page.tsx
  components/
    ui/
      button.tsx
      card.tsx
      tabs.tsx
      select.tsx
      badge.tsx
      sheet.tsx
    dashboard/
      owner-tabs.tsx
      summary-cards.tsx
      recent-transactions.tsx
      day-summary.tsx
      cashflow-calendar.tsx
      category-list.tsx
  hooks/
    use-dashboard-data.ts
  lib/
    utils.ts
    ui.ts
    api.ts
    format.ts
```

---

## 1차 도입 범위

### 설치
- tailwindcss
- postcss
- autoprefixer
- shadcn/ui init
- 필요한 경우 radix 기반 최소 컴포넌트만 도입

### 1차로 도입할 shadcn 컴포넌트
- `Button`
- `Card`
- `Tabs`
- `Select`
- `Badge`

### 1차 전환 대상 화면
- 상단 헤더
- owner 토글
- 요약 카드 4개
- 최근 기록 카드
- 선택일 요약 카드

즉, **대시보드 핵심 뼈대만 먼저 교체**한다.

---

## 2차 도입 범위

- 달력 영역 레이아웃 정리
- 인사이트 탭 카드 구조 정리
- 거래 상세 바텀시트 or 다이얼로그
- 필터/폼 UI 정리

---

## 3차 도입 범위

- import 상태 표시 UI
- 자산/부채 편집 폼
- owner 변경 액션 UI
- shared 데이터 관리 UI

---

## 스타일/토큰 기준

### spacing
- 섹션 gap: `gap-4`, `gap-6`
- 카드 padding: `p-4`, `p-6`

### radius
- 카드: `rounded-2xl`
- 버튼: `rounded-xl` 또는 shadcn 기본값

### color 방향
- 지출: blue 계열
- 수입: red 계열
- 중립/보조 텍스트: slate 계열
- 페이지 배경: slate-50 기반

### typography
- 제목: `text-xl`, `text-2xl`
- 보조 설명: `text-sm text-muted-foreground`
- 핵심 숫자: `text-2xl font-bold`

---

## 구현 순서

### 단계 1
- Tailwind 설치
- `globals.css` 생성
- `layout.tsx`에 글로벌 스타일 반영
- `cn()` 유틸 추가
- shadcn init

### 단계 2
- `Button`, `Card`, `Tabs`, `Select` 생성
- 기존 `OwnerTabs`를 shadcn 기반으로 교체
- 상단 요약 카드 교체

### 단계 3
- `app/page.tsx`의 UI 섹션을 dashboard 컴포넌트로 분리
- 데이터 fetching은 hook으로 분리

### 단계 4
- 달력/거래 영역 점진 전환
- 모바일 반응형 점검
- build 검증

---

## 리스크

### 1. 한 번에 너무 많이 바꾸면 기능이 깨질 수 있음
대응:
- 1차는 헤더/카드/토글만 바꿈
- 비즈니스 로직은 건드리지 않음

### 2. 인라인 스타일과 Tailwind 혼용으로 일관성 깨질 수 있음
대응:
- 새 컴포넌트부터 Tailwind 적용
- 점진적으로 인라인 스타일 제거

### 3. 네트워크 문제로 npm 설치가 막힐 수 있음
실제 발생함.
- `registry.npmjs.org` 접근 실패 시 설치 불가
- 이 경우 문서/구조 준비만 먼저 수행

---

## 검증 기준

도입 후 최소 검증:

1. `npm run build` 통과
2. `/` 페이지 정상 렌더링
3. owner 토글 정상 동작
4. 요약 카드 숫자 정상 출력
5. 모바일 width에서 카드가 깨지지 않음

---

## 지금 상태에서의 판단

- **도입 가치 높음**
- **점진 도입 권장**
- **현재 프로젝트와 궁합 좋음**
- 단, 설치 네트워크가 먼저 안정적이어야 함

---

## 다음 액션

네트워크가 안정되면 바로 다음 순서로 진행한다.

1. Tailwind 설치
2. shadcn init
3. Card/Button/Tabs/Select 도입
4. 상단 대시보드 UI 교체
5. build 확인

이 문서는 실제 적용 전에 방향과 범위를 고정하기 위한 1차 기준 문서다.

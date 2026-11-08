# SunSET 디자인 규칙

토큰의 원본은 `src/index.css`다. 색, 크기, 간격은 모두 여기 적힌 토큰과 Tailwind 단계만 쓴다. 컴포넌트는 `src/components/ui/*`(shadcn, base-ui)에서 시작한다.

## 0. 브랜드 표기

- 제품명은 워드마크 `SunSET` 한 가지로 쓴다(대소문자 고정). 한국어 문장에서 읽기가 필요하면 문서마다 처음 한 번만 `SunSET(선셋)`으로 쓰고 그 다음부터는 `SunSET`이다. 회사명 썬텍(2팀 썬텍, 점검자 소속 기본값 "썬텍 전기안전관리")은 제품명이 아니므로 그대로 둔다.
- 태그라인은 "태양광 정기점검 기록 에이전트"다. 로그인 화면과 README 제목 아래에만 두고 앱 셸의 브랜드 링크에는 붙이지 않는다.
- 로고 마크는 `bg-sidebar-primary`(호박색) 원(`rounded-full`) 안의 lucide `SunIcon`(`text-sidebar-primary-foreground`)이다. 앱 셸은 `size-8`/`size-4.5`(`data-slot="brand-mark"`, 로그인 전환이 이 자리를 잰다), 로그인은 `size-12`/`size-6`. 파비콘 `public/favicon.svg`은 같은 두 토큰을 hex로 구운 같은 원 마크다. 둥근 정사각형 마크는 쓰지 않는다. 워드마크 글자는 `text-[1.3125rem] font-semibold tracking-tight`.

## 1. 색 역할

| 토큰 | 쓰임 | 밝은 테마 | 어두운 테마 |
| --- | --- | --- | --- |
| `primary` | 주 동작 버튼, 활성 탭 글자, 링크 | 남색 oklch(0.52 0.19 262) | 밝은 회색 oklch(0.92 0 0) |
| `solar` | 브랜드 포인트(로고 마크, 이번 달 정기점검 표시), 차트 2번 | 호박색 oklch(0.78 0.16 75) | oklch(0.82 0.15 78) |
| `success` | 저장 완료, 이상 없음, 적합(○) | oklch(0.58 0.14 155) | oklch(0.74 0.15 155) |
| `warning` | 사진 확인 중, 참고 등급, 서버 연결 경고, 미입력 칸 | oklch(0.72 0.16 65) | oklch(0.8 0.15 70) |
| `info` | 기록표 작성 중, 판정 진행 중 | oklch(0.6 0.13 225) | oklch(0.74 0.12 225) |
| `destructive` | 핫스팟 확정, 우선 확인, 부적합(×) | oklch(0.58 0.22 25) | oklch(0.7 0.19 25) |
| `sidebar*` | 데스크톱 사이드바(밝은 테마는 짙은 남색, 어두운 테마는 검정 바탕, 호박색 마크) | oklch(0.24 0.06 262) | oklch(0.12 0 0) |
| `muted`, `secondary`, `accent` | 보조 면과 글자, 해당없음(NA) | 회청색 단계 | 무채색 회색 단계 |

어두운 테마의 바탕, 면, 글자, primary는 채도 0인 무채색이고 상태색(success·warning·info·destructive)과 solar만 색을 띤다.

색은 면(`bg-<역할>/12~20`)과 잉크(`text-<역할>`)로만 쓴다. 상자 한쪽에 색 띠를 두르거나 둥근 카드에 2px 이상 색 테두리를 치지 않는다. 밝은 테마에서 `warning` 잉크로 글자나 아이콘을 쓸 때는 `badge.tsx`와 같은 짙은 값 `oklch(0.5 0.13 60)`을 쓴다.

## 2. 글자 단계

| 단계 | 클래스 | 쓰임 |
| --- | --- | --- |
| 캡션 | `text-xs`(12px) | 탭바 라벨, 배지, 보조 설명 |
| 본문 | `text-sm`(14px) | 기본 글, 표, 입력 |
| 제목 | `text-base font-semibold`(16px) | 앱바 h1, 카드 h2 |
| 수치 | `text-2xl font-semibold tracking-tight`(24px) | KPI 숫자 |

글꼴은 `--font-sans`(Geist Variable, 한글은 Apple SD Gothic Neo·Noto Sans KR). 숫자는 `tabular` 클래스로 자릿수를 맞춘다. 본문은 `word-break: keep-all`.

## 3. 간격과 반경

- 4px 격자. 요소 안은 `gap-1`~`gap-3`, 요소 사이는 `gap-4`, 구역 사이는 `gap-6`.
- 화면 여백은 모바일 `p-4`, 데스크톱 `lg:p-8`. 본문 최대 폭 1400px.
- 반경 기준 `--radius: 0.75rem`. 카드와 버튼 `rounded-lg`, 배지 `rounded-4xl`, KPI 아이콘 칸 `rounded-lg`, 로고 마크 `rounded-full`.
- 그림자는 shadcn 기본값만 쓴다. 블러, 유리 효과, 메시 그라디언트는 쓰지 않는다.

## 4. 레이아웃

Layout: 모바일(<1024px)은 scroll-body-shell. 상단 앱바 56px가 sticky, 하단 탭바 56px + safe-area가 fixed, 스크롤은 문서가 맡고 main은 아래를 4.5rem + safe-area만큼 비운다. 데스크톱(`lg:`, ≥1024px)은 fixed-sidenav-shell. 그리드 `[248px | 1fr]`, 사이드바는 sticky 100dvh, 상단바 sticky, 스크롤은 문서가 맡고 탭바는 렌더링하지 않는다.

모바일 우선 규칙:
- 기본 스타일은 390px 기준으로 쓰고 `sm:`, `lg:`로 넓힌다. 390px에서 가로 스크롤이 생기면 결함이다.
- 터치 대상은 44×44px 이상. 하단 탭 3개는 각 56px 높이, 앱바의 아이콘 버튼은 모바일 `size-11`, 데스크톱 `lg:size-8`.
- 한 화면에 주 동작은 하나. 셸에서는 활성 탭이 그 역할이고, 테마 전환은 보조다.
- 전환점은 Tailwind `lg:`(1024px) 하나다. 사이드바와 탭바는 CSS로 숨기지 않고 `matchMedia`로 렌더링을 나눈다.
- 페이지 전환은 해시(`#/`, `#/review/<현장>`, `#/record/<현장>`)로 하고 라우터 라이브러리는 쓰지 않는다.

Layout(현장 선택): 사진 확인·기록표 화면 맨 위는 chip-rail. 모바일은 `-mx-4 px-4`로 화면 끝까지 넓힌 가로 스크롤(`snap-x snap-mandatory`, 스크롤바 숨김, 양끝 1rem 페이드 마스크)에 칩(h-11, gap-2)을 늘어놓고, 데스크톱(`lg:`)은 스크롤과 페이드 없이 한 줄 `flex-wrap`으로 다섯 개를 모두 보인다. 칩 아래는 요약 카드(`Card size="sm"`) 하나: 왼쪽에 현장 이름·지역·용량·전압·상태 배지, 오른쪽(`sm:`부터)에 그 화면의 동작 버튼. 현장을 바꾸면 페이지가 현장별 key로 다시 마운트되므로 방향키 이동은 마운트 뒤 선택 칩에 초점을 되돌린다(`SitePicker.tsx`).

Layout(알림): 토스트(sonner)는 모바일에서 top-center, 앱바 아래 `3.5rem + 0.75rem + safe-area-top`, 좌우 16px 전폭이라 하단 탭바와 저장 막대를 덮지 않는다. 데스크톱은 bottom-right 32px(`lg:p-8`과 같은 여백), 폭 356px. 위치는 `useIsDesktop`(matchMedia 1024px)으로 나눈다.

Layout(사진 크게 보기): 사진 상세의 비교 이미지는 탭으로 여는 표면이다. 탭(6px·300ms 미만, 버튼·손잡이 밖에서 시작)과 오른쪽 위 `크게 보기` 버튼(모바일 size-11, 데스크톱 lg:size-8)이 뷰어를 열고, 슬라이더 경계는 손잡이(size-11, touch-none) 드래그나 방향키로만 움직인다. 이미지 표면은 touch-pan-y라 세로 스크롤은 그대로 된다. 뷰어는 base-ui Dialog(z-60, `PhotoViewer.tsx`)다. 모바일은 `fixed inset-0`(100dvh, safe-area 패딩)에 header / stage(flex-1, 검정) / toolbar / footer(판정 버튼)를 세로로 쌓고, 데스크톱(`lg:`)은 가운데 `min(94vw,1560px) × min(92dvh,1040px)` 둥근 패널이다. 나란히 모드의 stage는 portrait 2행, landscape 2열. 확대·이동은 열화상 비율의 틀에 translate·scale을 걸고, 경계선·손잡이·이름표는 변환 밖(칸 기준)에 그려 배율이 바뀌어도 크기가 같다.

## 5. 셸 브리프

- 주 동작: 활성 탭(현재 화면). 다른 탭은 `text-muted-foreground`, 활성 탭만 `text-primary`.
- 정보 우선순위: 1) 현재 화면 본문 2) 내가 어디 있는지(탭·제목) 3) 서버 연결 경고 토스트(연결 실패 시에만).
- 필수 내용: 로고 마크, 화면 제목, 테마 전환, 탭 3개(대시보드·사진 확인·기록표), 데스크톱 사이드바의 담당 현장 3곳과 상태 점, 연결 실패 시 지속 토스트 "AI 판정 서버에 연결하지 못했습니다"와 그 안의 다시 시도 버튼(7절).
- 일부러 뺀 것: 햄버거 시트 메뉴, 앱바 블러, 모바일에서의 이번 달 정기점검 표시(`sm:`부터만, "2026년 11월 정기점검"), 탭 안의 숫자 배지.
- 기간 표기: 이번 점검의 이름은 월(`CURRENT_INSPECTION`, 앱바 배지·대시보드 배너·AgentStream 요약·PDF 파일 이름)이고, 점검 이력과 추이 차트는 분기(`CURRENT_PERIOD`, `HISTORY.ym`)로 묶는다. 열화상 측정기록표의 분기·반기·연차 표기는 분기에 동그라미다.

### 현장 선택(사진 확인·기록표) 브리프

- 주 동작: 선택한 현장의 본문(사진 확인은 사진 카드, 기록표는 입력 칸). 칩은 현장을 바꾸는 보조 동작이라 선택 칩만 `bg-primary`로 채우고 나머지는 outline 버튼과 같은 면이다.
- 정보 우선순위: 1) 지금 보고 있는 현장 이름과 상태(요약 카드) 2) 다른 현장의 상태 점과 수치(칩) 3) 지역·용량·전압.
- 필수 내용: 칩마다 상태 점(6절 색), 지역 이름(`shortName`), 용량, 수치(사진 확인 "대기 n", 기록표 "미입력 n"/"저장됨"); 요약 카드에 현장 이름, 지역·용량·전압, 상태 배지, 사진 확인의 열화상 추가·기록표 작성 버튼.
- 일부러 뺀 것: 현장 코드(A~E) 표시, 칩 안의 진행률 막대, 요약 카드의 사진 수 반복(진행 카드에 있음), 기록표 화면의 요약 카드 동작 버튼(저장·인쇄는 편집기와 미리보기에 있음).
- 접근성: 칩 줄은 `role="tablist"`, 칩은 `role="tab"`+`aria-selected`, 선택 칩만 tabIndex 0, 좌우 방향키·Home·End로 현장을 바꾼다(자동 활성). 상태 점의 뜻은 `sr-only` 글자로 읽힌다.

### 사진 크게 보기(뷰어) 브리프

- 주 동작: 사진을 보고 판정하기. 푸터의 `핫스팟으로 확정`만 채운 파괴색이고 오탐·패널 외는 outline, 되돌리기는 ghost다(사진 상세와 같은 `ReviewActions`).
- 정보 우선순위: 1) 열화상과 겹친 실화상(stage) 2) 사진 번호·현장·촬영 시각과 등급·확인·융합 배지(헤더) 3) 비교 방식·드래그 동작·불투명도·배율(툴바).
- 필수 내용: 닫기(44px, Esc, 배경 클릭), 이전·다음 사진(←/→), 비교 방식 3개(인라인과 선택을 공유), 슬라이더 모드의 경계 손잡이(role=slider, 방향키), 오버랩 모드의 불투명도 슬라이더(0~100%), 배율 표시와 `원래 크기`, 휠·핀치 확대(1~6배), 더블탭 1배↔2.5배, 확대 시 한 손가락 드래그 이동(슬라이더 모드에서는 `경계/이동` 토글로 고르고 두 손가락 드래그는 항상 이동), 판정 버튼.
- 일부러 뺀 것: 박스 숨기기 토글, 메타데이터 표, 썸네일 필름스트립, 다운로드·공유, 뷰어 안 캡션 문장(인라인 캡션에 있음), 사용법 안내 문구.
- 접근성: 열릴 때 포커스는 팝업으로 가고 닫히면 `크게 보기` 버튼으로 돌아간다. 열기·닫기 전환은 `motion-reduce:transition-none`.

### 로그인 바닥과 전환 버리프

Layout(로그인): 화면 전체가 로고 마크와 같은 `bg-sidebar-primary` 면이고 글자는 `text-sidebar-primary-foreground`다. 가운데에 `Card`(`max-w-sm`, `px-6 py-8`, `gap-8`) 하나만 놓고 로고 마크·워드마크·태그라인·입력·버튼·체험 계정 안내를 모두 그 안에 둔다. 카드 위의 글자와 입력은 카드 토큰(`text-card-foreground`, `text-muted-foreground`, `border-input`)이라 면 색과 무관하게 AA를 지킨다.

- 주 동작: `로그인`(primary). `게스트로 시작`은 outline.
- 정보 우선순위: 1) 아이디·뱄밀번호 입력 2) 워드마크와 태그라인 3) 체험 계정 안내.
- 필수 내용: 로고 마크(`size-12`), 워드마크, 태그라인, 아이디·뱄밀번호, 로그인 버튼, 구분선 "또는", 게스트 버튼, 체험 계정 안내.
- 일부러 번 것: 배경 그림·그라디언트, 어두운 테마 전환 버튼, 제품 설명 문단.
- 전환: 로그인이 성공하면(`Session.fresh`) 앱 셸을 먼저 그리고 로그인 화면은 `fixed inset-0 z-50`으로 그 위에 남는다. 카드는 `opacity-0`(150ms)로 사라지고, 호박색 면은 `clip-path: circle()`이 화면 전체(가운데에서 모서리까지의 반지름)에서 셸의 로고 마크(`[data-slot="brand-mark"]`의 `getBoundingClientRect`, 데스크탑은 사이드바·모바일은 앱바) 자리와 반지름으로 `--duration-reveal`(200ms) `--ease-standard`만큼 줄어든 뒤 사라진다(`.motion-reveal`). 전환 중에는 `inert`·`aria-hidden`이다. `prefers-reduced-motion: reduce`에서는 전환 없이 바로 바뀝다. 새 의존성은 쓰지 않는다.

## 6. 상태 색 매핑

| 상태 | 배지 변형 | 사이드바 점 | 뜻 |
| --- | --- | --- | --- |
| `todo` 미착수 | `outline` | `bg-muted-foreground` | 아직 사진을 확인하지 않음 |
| `review` 사진 확인 중 | `warning` | `bg-warning` | 우선 확인 사진이 남음 |
| `record` 기록표 작성 중 | `info` | `bg-info` | 우선 확인을 모두 처리함 |
| `saved` 저장 완료 | `success` | `bg-success` | 기록표를 저장해 잠김 |

사진 등급: 우선 확인 `destructive`, 참고 `warning`, 이상 없음 `success`, 판정 중 `info`, 판정 실패 `outline`. 확인 결과: 핫스팟 확정 `destructive`, 오탐·패널 외 `secondary`, 미확인 `outline`. 기록표 칸: ○ `success`, × `destructive`, 해당없음 `secondary`, 미입력 `warning`.

## 7. 알림(토스트)

앱 안의 알림은 모두 `sonner` 토스트다(`src/components/ui/sonner.tsx`, App.tsx에 `<Toaster />` 하나). `window.confirm`·`alert`, 화면 안 경고 줄, 앱바 아래 배너는 쓰지 않는다.

- 면과 글자: `bg-popover` `text-popover-foreground` `border` `rounded-lg` `shadow-lg`, 제목 `text-sm font-medium`, 설명 `text-sm text-muted-foreground`. sonner 기본 스타일은 `unstyled`로 끈다(레이어 밖 CSS라 유틸리티가 지지 못한다).
- 종류별 잉크는 아이콘(Lucide)에만 준다: 성공 `success`, 경고 `warning`, 실패 `destructive`, 안내 `info`. 밝은 테마는 badge.tsx와 같은 짙은 값(예: 경고 `oklch(0.5 0.13 60)`)으로 대비 3:1을 지킨다. 면 색 띠(richColors)는 쓰지 않는다.
- 테마는 `<html class="dark">`를 `useIsDark`(MutationObserver)로 읽는다. next-themes는 쓰지 않는다.
- 버튼: 동작은 `buttonVariants()`(primary), 취소는 `outline`. 모바일은 둘째 줄 오른쪽 정렬 `h-11`(44px), 데스크톱은 같은 줄 `h-8`.
- 확인이 필요한 동작(저장된 기록 수정, 직접 고친 종합의견 덮어쓰기)은 동작·취소 버튼이 달린 토스트로 묻고 `duration: Infinity`, 고정 id로 중복을 막는다.
- 서버 연결 실패는 id `serving-down`인 지속 경고 토스트 하나로 알리고, 다시 시도 중에는 로딩으로 바꾸고, 복구되면 닫고 성공 토스트를 띄운다.
- 저장·재열기·AgentStream 초안 결과·사진 판정 실패는 그때마다 토스트로 알린다. 사진 상세의 판정 실패 문구는 그 사진의 상태이므로 화면에 남긴다.

## 8. 움직임

토큰은 `src/index.css`의 `--duration-reveal: 200ms`, `--ease-standard: cubic-bezier(0.4, 0, 0.2, 1)`이고 클래스는 `src/styles/motion.css`에 둔다. 움직임은 상태가 바뀜 때만 넣고(업로드 연산 단계, 사진 크게 보기 열기·닫기, 로그인 전환) `transform`·`opacity`·`clip-path`만 바꾼다. `prefers-reduced-motion: reduce`에서는 이동을 없애거나 1ms로 줄인다.

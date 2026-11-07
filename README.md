# 썬텍 점검비서

전기안전관리 대행업체 점검자를 위한 태양광 정기점검 기록 에이전트입니다. 2026 전남광주 기업 AX 혁신 챌린지 해커톤 2팀(썬텍)의 결과물입니다.

- 서비스 주소: https://devopen-gpu.jntp-ax.or.kr/i/z-kOTvqeFZjwBkOj/
- 로그인 없이 바로 쓸 수 있습니다. 작업 내용은 브라우저(localStorage)에 저장됩니다.

## 무엇을 하나요

점검자가 현장의 드론 열화상·실화상 사진 묶음을 올리면, AI가 핫스팟 의심 사진을 골라내고 점검자는 사진마다 확정·오탐·패널 외를 고릅니다. 그 결과로 법정 서식 두 가지의 초안이 채워지고, 점검자가 확인·수정해 저장하고 인쇄합니다.

1. **현장 선택**: 담당 현장 5곳(하동, 영광, 음성, 이천, 제주 와산)의 이번 분기 진행 상태를 대시보드에서 봅니다.
2. **사진 확인**: 박스 판정(면적순 우선 확인)과 열화상+실화상 융합 판정 배지를 보고 사진을 처리합니다. 슬라이더·오버랩·나란히 보기로 열화상과 실화상을 비교합니다.
3. **기록표 작성**: 「전기안전관리자의 직무에 관한 고시」 별지 제9호 태양광발전설비 점검기록표와 적외선 열화상분포 측정기록표(분기)를 웹에서 편집하고 A4로 미리 보고 인쇄합니다. 미입력 칸이 있으면 저장되지 않고, 저장 뒤에도 "기록 수정"으로 다시 고칠 수 있습니다.
4. **종합의견 초안**: AgentStream 챗봇이 규칙 코드가 만든 요약을 받아 종합의견 문장을 씁니다. 숫자와 ○/× 판정은 규칙 코드가 정하고, 챗봇은 문장만 씁니다.

## 구성

```
브라우저(React SPA) ──/api──▶ serve.py (팀 서버, 표준 라이브러리만 사용, 중계만 함)
                                   ├─▶ AIStream 제공 서빙 SV-e434a471  /predict/solar  (핫스팟 박스)
                                   ├─▶ AIStream 자체 서빙 SV-29e9b912  /infer          (열화상+실화상 융합 판정)
                                   └─▶ AgentStream 챗봇 썬텍점검비서_2조                (종합의견 문장)
```

- 모델 추론은 모두 AIStream 서빙이, 문장 생성은 AgentStream이 맡습니다. 팀 서버는 요청을 넘기고 응답 형식만 맞춥니다.
- 융합 판정 모델: 열화상 ResNet18 + 실화상 ResNet18 보정항, 클래스는 정상·결함·패널 외. 대회 드론 데이터 5개 현장 1,098쌍으로 학습했습니다. 서빙 코드는 이 저장소 밖(AIStream 템플릿 `serving/solar_fusion_2팀_안순광`)에 있습니다.

## 폴더

| 경로 | 내용 |
|---|---|
| `src/` | React + TypeScript + Tailwind + shadcn/ui(base-ui) 화면 |
| `src/lib/inspection.ts` | 판정 규칙(우선 확인 기준, 핫스팟 줄 제안, 외관 칸 계산, 온도차 판정) |
| `serve.py` | 정적 제공과 `/api/predict/solar`, `/api/classify`, `/api/agent/opinion`, `/api/health` 중계 |
| `agentstream.py` | AgentStream 세션·메시지 호출과 응답 검증 |
| `scripts/prepare_demo.py` | 시연 사진 재인코딩(EXIF 제거)과 판정값 기록 |
| `scripts/deploy.sh` | 팀 서버 배포 |
| `docs/kb/` | AgentStream 지식베이스에 올린 팀 작성 문서 |

## 실행

```bash
bun install
PORT=8601 python3 serve.py      # API 중계 (다른 터미널)
bun run dev                     # http://localhost:5173 (/api, /drone 은 8601로 프록시)
```

테스트와 빌드:

```bash
bun test ./src/lib/inspection.test.ts
python3 -m unittest agentstream_test
bun run build
```

시연 사진은 용량 때문에 저장소에 넣지 않았습니다. `scripts/prepare_demo.py`가 원본 드론 사진에서 `data-demo/drone/`을 만들고, 서버에서는 `/data/hackathon/web/data/drone/`에서 제공합니다.

## 환경변수

`serve.py`는 같은 폴더의 `.env`를 읽습니다. `.env`는 저장소에 올리지 않습니다(`.gitignore`).

| 이름 | 설명 |
|---|---|
| `PORT` | 기본 8501 |
| `SERVING_URL`, `SERVING_SOLAR_PATH` | 박스 판정 서빙 (기본: 제공 서빙 SV-e434a471) |
| `FUSION_URL`, `FUSION_PATH` | 융합 판정 서빙 (기본: SV-29e9b912, `/infer`) |
| `AGENTSTREAM_BASE_URL`, `AGENTSTREAM_CHATBOT_ID`, `AGENTSTREAM_WORKSPACE_ID`, `AGENTSTREAM_CHAT_PATH` | AgentStream 연동 정보 |
| `AGENTSTREAM_API_KEY` | AgentStream API Key. 서버 `.env`에만 둡니다 |

키가 없으면 종합의견은 템플릿 문장으로 채워지고 "자동 문장" 표시가 붙습니다.

## 데이터

- 사용한 데이터: 대회 제공 서빙과 팀이 확보한 드론 열화상·실화상 사진(사용 허가 받음). 공개 화면의 사진은 EXIF와 촬영 좌표를 지워 다시 저장했고, 현장 이름·용량·월별 이력은 시연용 예시 값입니다.
- 별지 제9호와 열화상분포 측정기록표의 항목 구조는 「전기안전관리자의 직무에 관한 고시」(기후에너지환경부고시 제2025-15호) 서식을 따랐습니다.

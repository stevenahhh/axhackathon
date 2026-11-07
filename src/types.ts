export type SiteId = "A" | "B" | "C" | "D" | "E"

export type Box = { bbox: number[]; area: number }

export type Folder = "abnormal" | "normal" | "outside" | "unknown"

// 업로드한 사진의 실시간 연산 단계. queued는 차례 대기, detecting은 핫스팟 탐지(AIStream 제공 서빙),
// classifying은 열·실화상 융합 판정(자체 서빙), aligning은 실화상을 열화상 틀로 정렬. 실화상이 없으면 aligning을 건너뛴다.
export type Stage = "queued" | "detecting" | "classifying" | "aligning" | "done" | "error"

export type Photo = {
  id: string
  site: SiteId
  seq: string
  capturedAt: string
  ir: string
  rgb?: string
  // 실화상 EXIF DigitalZoomRatio(M3T는 1.0 또는 1.95). 열화상 화각 자르기 비율은 줌 1.0 기준이라 겹칠 때 이 값으로 배율을 고친다. 없으면 1.
  rgbZoom?: number
  // 실화상을 열화상 렌즈 왜곡·화각에 맞춰 640x512로 리매핑한 정렬본(scripts/align.py). 있으면 열화상 위에 1:1로 겹친다.
  rgbAligned?: string
  width: number
  height: number
  boxes: Box[]
  folder: Folder
  uploaded?: boolean
  pending?: boolean
  error?: string
  // 업로드 사진의 원본 파일 이름(DJI_..._T.JPG)과 현재 연산 단계. 미리 실린 사진에는 없다.
  name?: string
  stage?: Stage
  source?: "own" | "provided"
  // AIStream 자체 융합 모델(열화상+실화상) 판정. 업로드 사진은 판정 전 pending, 실패 시 error를 담는다.
  fusion?:
    | {
        label: "normal" | "defect" | "non_panel"
        confidence: number
        probs: Record<"normal" | "defect" | "non_panel", number>
        usedRgb: boolean
      }
    | { pending: true }
    | { error: string }
}

export type Review = "unset" | "confirmed" | "rejected" | "excluded"

export type Mark = "O" | "X" | "NA" | null

export type Tier = "review" | "watch" | "none"

export type Site = {
  id: SiteId
  name: string
  region: string
  capacityKw: number
  voltageV: number
  device: string
  module: { type: string; pmaxKw: number; vmpV: number; impA: number }
  pcs: { type: string; ratedKw: number; vinMin: number; vinMax: number; voutV: number }
}

// point: 핫스팟 셀과 인접 셀 2곳의 온도. area: 박스(영역) 측정의 최대·평균·최소를 p1·p2·p3에 담는다.
export type ThermalMode = "point" | "area"

export type ThermalEntry = { p1: string; p2: string; p3: string; part: string; mode?: ThermalMode }

export type Inspection = {
  reviews: Record<string, Review>
  marks: Record<string, Mark>
  opinion: string
  opinionEdited: boolean
  opinionSource?: "template" | "agent"
  thermalOpinion?: string
  inspector: string
  org: string
  weather: string
  insulation: string
  ground: string
  thermal: Record<string, ThermalEntry>
  startedAt?: string
  savedAt?: string
  // 저장 뒤 다시 열어 고칠 때: lastSavedAt은 직전 저장 시각, revision은 다시 연 횟수.
  lastSavedAt?: string
  revision?: number
}

export type HistoryEntry = {
  site: SiteId
  ym: string
  photos: number
  confirmed: number
  savedAt: string
  seeded: true
}

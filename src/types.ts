export type SiteId = "A" | "B" | "C"

export type Box = { bbox: number[]; area: number }

export type Folder = "abnormal" | "normal" | "outside" | "unknown"

export type Photo = {
  id: string
  site: SiteId
  seq: string
  capturedAt: string
  ir: string
  rgb?: string
  width: number
  height: number
  boxes: Box[]
  folder: Folder
  uploaded?: boolean
  pending?: boolean
  error?: string
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
}

export type HistoryEntry = {
  site: SiteId
  ym: string
  photos: number
  confirmed: number
  savedAt: string
  seeded: true
}

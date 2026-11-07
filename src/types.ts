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

export type ThermalEntry = { p1: string; p2: string; p3: string; part: string }

export type Inspection = {
  reviews: Record<string, Review>
  marks: Record<string, Mark>
  opinion: string
  opinionEdited: boolean
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

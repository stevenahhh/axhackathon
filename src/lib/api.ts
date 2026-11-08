import { sessionExpired } from "@/lib/session"

export type Defect = { bbox: [number, number, number, number]; area: number }

export type Prediction = {
  width: number
  height: number
  defects: Defect[]
  source: "provided" | "own"
}

export type FusionLabel = "normal" | "defect" | "non_panel"

export type Classification = {
  label: FusionLabel
  confidence: number
  probs: Record<FusionLabel, number>
  irOnlyLabel: FusionLabel | null
  usedRgb: boolean
  source: "own"
}

export type Health = {
  serving: { ok: boolean; kind: string }
  fusion: { ok: boolean }
  agent: { configured: boolean }
}

export type Opinion = {
  opinion: string
  followups: string[]
  thermal_opinion?: string
  warnings: string[]
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  if (response.status === 401) sessionExpired()
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error ?? data?.detail ?? `HTTP ${response.status}`)
  return data as T
}

export function predictSolar(file: File): Promise<Prediction> {
  const body = new FormData()
  body.append("file", file)
  return request<Prediction>("./api/predict/solar", { method: "POST", body })
}

export function classifyPair(ir: File | Blob, rgb?: File | Blob): Promise<Classification> {
  const body = new FormData()
  body.append("ir", ir)
  if (rgb) body.append("rgb", rgb)
  return request<Classification>("./api/classify", { method: "POST", body })
}

export type Sample = {
  id: string
  site: string
  seq: string
  name: string
  capturedAt: string
  ir: string
  rgb?: string
  rgbZoom?: number
}

export function fetchSamples(site?: string): Promise<{ samples: Sample[] }> {
  const query = site ? `?site=${encodeURIComponent(site)}` : ""
  return request<{ samples: Sample[] }>(`./api/samples${query}`)
}

export type AlignResult = { image: Blob; shift?: [number, number]; score?: number }

// 실화상을 열화상 틀(640x512)로 리매핑한 JPEG를 받는다. zoom을 빼면 서버가 EXIF에서 읽고, 없으면 1.0으로 본다.
// 열화상을 함께 보내면 서버가 사진별 이동까지 맞추고 이동량·정렬 점수를 헤더로 준다.
export async function alignRgb(rgb: File | Blob, zoom?: number, ir?: File | Blob): Promise<AlignResult> {
  const body = new FormData()
  body.append("rgb", rgb)
  if (zoom !== undefined) body.append("zoom", String(zoom))
  if (ir) body.append("ir", ir)
  const response = await fetch("./api/align", { method: "POST", body })
  if (response.status === 401) sessionExpired()
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.error ?? `HTTP ${response.status}`)
  }
  const shift = response.headers.get("X-Align-Shift")?.split(",").map(Number)
  const score = Number(response.headers.get("X-Align-Score") ?? Number.NaN)
  return {
    image: await response.blob(),
    shift: shift?.length === 2 && shift.every(Number.isFinite) ? [shift[0], shift[1]] : undefined,
    score: Number.isFinite(score) ? score : undefined,
  }
}

export function fetchHealth(): Promise<Health> {
  return request<Health>("./api/health")
}

export function requestOpinion(payload: Record<string, unknown>): Promise<Opinion> {
  return request<Opinion>("./api/agent/opinion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
}

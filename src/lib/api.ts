export type Defect = { bbox: [number, number, number, number]; area: number }

export type Prediction = {
  width: number
  height: number
  defects: Defect[]
  source: "provided" | "own"
}

export type Health = {
  serving: { ok: boolean; kind: string }
  agent: { configured: boolean }
}

export type Opinion = { opinion: string; followups: string[] }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error ?? data?.detail ?? `HTTP ${response.status}`)
  return data as T
}

export function predictSolar(file: File): Promise<Prediction> {
  const body = new FormData()
  body.append("file", file)
  return request<Prediction>("./api/predict/solar", { method: "POST", body })
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

import { useSyncExternalStore } from "react"

import type { Inspection, Mark, Photo, Review, SiteId, ThermalEntry } from "@/types"

const KEY = "suntek-inspections-v1"
const SITE_IDS: SiteId[] = ["A", "B", "C"]

const emptyInspection = (): Inspection => ({
  reviews: {},
  marks: {},
  opinion: "",
  opinionEdited: false,
  inspector: "",
  org: "썬텍 전기안전관리",
  weather: "맑음",
  insulation: "",
  ground: "",
  thermal: {},
})

type State = { inspections: Record<SiteId, Inspection>; uploads: Photo[] }

function load(): State {
  const fresh = Object.fromEntries(SITE_IDS.map((id) => [id, emptyInspection()])) as Record<
    SiteId,
    Inspection
  >
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<
      Record<SiteId, Inspection>
    > | null
    for (const id of SITE_IDS) if (saved?.[id]) fresh[id] = { ...emptyInspection(), ...saved[id] }
  } catch {
    localStorage.removeItem(KEY)
  }
  return { inspections: fresh, uploads: [] }
}

let state = load()
const listeners = new Set<() => void>()

function commit(next: State) {
  state = next
  localStorage.setItem(KEY, JSON.stringify(state.inspections))
  listeners.forEach((notify) => notify())
}

export function useAppState() {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => listeners.delete(notify)
    },
    () => state
  )
}

function patchInspection(site: SiteId, patch: (current: Inspection) => Partial<Inspection>) {
  const current = state.inspections[site]
  if (current.savedAt) return
  commit({
    ...state,
    inspections: {
      ...state.inspections,
      [site]: { ...current, startedAt: current.startedAt ?? new Date().toISOString(), ...patch(current) },
    },
  })
}

export const setReview = (site: SiteId, photoId: string, review: Review) =>
  patchInspection(site, (current) => ({ reviews: { ...current.reviews, [photoId]: review } }))

export const setMark = (site: SiteId, cell: string, mark: Mark) =>
  patchInspection(site, (current) => ({ marks: { ...current.marks, [cell]: mark } }))

export const setFields = (site: SiteId, patch: Partial<Inspection>) =>
  patchInspection(site, () => patch)

export const setThermal = (site: SiteId, photoId: string, patch: Partial<ThermalEntry>) =>
  patchInspection(site, (current) => ({
    thermal: {
      ...current.thermal,
      [photoId]: { p1: "", p2: "", p3: "", part: "태양전지 모듈 셀", ...current.thermal[photoId], ...patch },
    },
  }))

export function saveInspection(site: SiteId) {
  const current = state.inspections[site]
  commit({
    ...state,
    inspections: { ...state.inspections, [site]: { ...current, savedAt: new Date().toISOString() } },
  })
}

export function resetInspection(site: SiteId) {
  commit({ ...state, inspections: { ...state.inspections, [site]: emptyInspection() } })
}

export function addUploads(photos: Photo[]) {
  commit({ ...state, uploads: [...photos, ...state.uploads] })
}

export function patchUpload(id: string, patch: Partial<Photo>) {
  commit({
    ...state,
    uploads: state.uploads.map((photo) => (photo.id === id ? { ...photo, ...patch } : photo)),
  })
}

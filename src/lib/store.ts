import { useSyncExternalStore } from "react"

import type { Inspection, Mark, Photo, Review, SiteId, ThermalEntry } from "@/types"

// 점검 기록은 로그인한 id마다 따로 둔다. 키 접두어는 제품명을 따르고, 예전 이름(suntek-*)으로 남은 기록은
// 처음 한 번 새 이름으로 옮긴다. 로그인 전에 쓰던 키 하나짜리 기록은 guest 몸으로 간다.
const KEY_PREFIX = "sunset-inspections-v1"
const LEGACY_PREFIX = "suntek-inspections-v1"
const keyOf = (user: string) => `${KEY_PREFIX}:${user}`
const SITE_IDS: SiteId[] = ["A", "B", "C", "D", "E"]

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

export const EMPTY_THERMAL: ThermalEntry = { p1: "", p2: "", p3: "", part: "태양전지 모듈 셀", mode: "point" }

type State = { inspections: Record<SiteId, Inspection>; uploads: Photo[] }

// 계정별 키(suntek-inspections-v1:<id>)를 먼저 옮기고 키 하나짜리 기록은 마지막에 옮겨, 같은 계정의 새 기록을 예전 기록이 덮지 않게 한다.
function migrateLegacy() {
  const legacyKeys = Object.keys(localStorage)
    .filter((item) => item === LEGACY_PREFIX || item.startsWith(`${LEGACY_PREFIX}:`))
    .sort((a, b) => Number(a === LEGACY_PREFIX) - Number(b === LEGACY_PREFIX))
  for (const legacyKey of legacyKeys) {
    const next = legacyKey === LEGACY_PREFIX ? keyOf("guest") : `${KEY_PREFIX}${legacyKey.slice(LEGACY_PREFIX.length)}`
    const value = localStorage.getItem(legacyKey)
    if (value !== null && localStorage.getItem(next) === null) localStorage.setItem(next, value)
    localStorage.removeItem(legacyKey)
  }
}

function load(key: string | null): State {
  const fresh = Object.fromEntries(SITE_IDS.map((id) => [id, emptyInspection()])) as Record<
    SiteId,
    Inspection
  >
  if (!key) return { inspections: fresh, uploads: [] }
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<
      Record<SiteId, Inspection>
    > | null
    for (const id of SITE_IDS) if (saved?.[id]) fresh[id] = { ...emptyInspection(), ...saved[id] }
  } catch {
    localStorage.removeItem(key)
  }
  return { inspections: fresh, uploads: [] }
}

let key: string | null = null
let state = load(null)
const listeners = new Set<() => void>()

function commit(next: State) {
  state = next
  if (key) localStorage.setItem(key, JSON.stringify(state.inspections))
  listeners.forEach((notify) => notify())
}

// 로그인한 id의 기록을 불러온다. 같은 id로 다시 부르면 올린 사진(uploads)을 그대로 둔다.
export function setStoreUser(user: string) {
  if (key === keyOf(user)) return
  migrateLegacy()
  key = keyOf(user)
  state = load(key)
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
      [photoId]: { ...EMPTY_THERMAL, ...current.thermal[photoId], ...patch },
    },
  }))

export function saveInspection(site: SiteId) {
  const current = state.inspections[site]
  commit({
    ...state,
    inspections: { ...state.inspections, [site]: { ...current, savedAt: new Date().toISOString() } },
  })
}

// 저장된 기록을 다시 연다. 직전 저장 시각은 lastSavedAt에 남기고 수정 회차를 올린다.
export function reopenInspection(site: SiteId) {
  const { savedAt, ...current } = state.inspections[site]
  if (!savedAt) return
  commit({
    ...state,
    inspections: {
      ...state.inspections,
      [site]: { ...current, lastSavedAt: savedAt, revision: (current.revision ?? 0) + 1 },
    },
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

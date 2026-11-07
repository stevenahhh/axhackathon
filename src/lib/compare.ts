import { useCallback, useState, type CSSProperties } from "react"

import type { Photo } from "@/types"

export type CompareMode = "wipe" | "overlap" | "side"

export const COMPARE_MODES: { value: CompareMode; label: string }[] = [
  { value: "wipe", label: "슬라이더" },
  { value: "overlap", label: "오버랩" },
  { value: "side", label: "나란히" },
]

const STORAGE_KEY = "suntek.compareMode"

export function readCompareMode(): CompareMode {
  const saved = localStorage.getItem(STORAGE_KEY)
  return COMPARE_MODES.some((mode) => mode.value === saved) ? (saved as CompareMode) : "wipe"
}

export function useCompareMode() {
  const [mode, setMode] = useState<CompareMode>(readCompareMode)
  const choose = useCallback((next: CompareMode) => {
    setMode(next)
    localStorage.setItem(STORAGE_KEY, next)
  }, [])
  return [mode, choose] as const
}

// DJI M3T 열화상 화각은 줌 1.0 광각 실화상(4000x3000)의 가운데 2544x2040이다(짝 사진 24쌍 실측).
// 실화상 줌이 z면 열화상 화각은 실화상의 가로 63.6%·z, 세로 68%·z에 해당한다. 그 역수만큼 실화상을
// 키우거나(줌 1.0이면 157%) 줄여서(줌 1.95면 81%) 가운데에 두면 열화상 좌표의 박스가 두 사진 모두에 맞는다.
export const IR_FRACTION = { x: 2544 / 4000, y: 2040 / 3000 }

export function alignedRgbStyle(zoom = 1): CSSProperties {
  const scaleX = 1 / (IR_FRACTION.x * zoom)
  const scaleY = 1 / (IR_FRACTION.y * zoom)
  return {
    width: `${scaleX * 100}%`,
    height: `${scaleY * 100}%`,
    left: `${((1 - scaleX) / 2) * 100}%`,
    top: `${((1 - scaleY) / 2) * 100}%`,
  }
}

// 줌이 약 1.47을 넘으면 실화상이 열화상 화각보다 좁아 가장자리가 비된다.
export function rgbNarrower(photo: Photo) {
  return (photo.rgbZoom ?? 1) * IR_FRACTION.y > 1
}

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

// 탭 판정: 누른 자리에서 6px 미만으로 움직이고 300ms 안에 뗀 포인터만 탭이다. 그 밖은 드래그나 스크롤이다.
export const TAP_MOVE_PX = 6
export const TAP_MS = 300

export type PointerSample = { x: number; y: number; t: number }

export function isTap(down: PointerSample, up: PointerSample) {
  return Math.hypot(up.x - down.x, up.y - down.y) < TAP_MOVE_PX && up.t - down.t < TAP_MS
}

// 검증 스크립트가 만드는 합성 포인터나 이미 끝난 포인터는 잡을 수 없어 NotFoundError를 던진다.
// 잡지 못해도 요소 위에서 오는 이동 이벤트는 그대로 받으므로 드래그는 이어진다.
export function capturePointer(element: Element, pointerId: number) {
  try {
    element.setPointerCapture(pointerId)
  } catch {
    return
  }
}

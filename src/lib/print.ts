import { useSyncExternalStore } from "react"

export type PrintTarget = "form9" | "thermal-one" | "thermal-all"

export const PRINT_ROOT_ID = "print-root"

let target: PrintTarget | null = null
const listeners = new Set<() => void>()

function setTarget(next: PrintTarget | null) {
  target = next
  listeners.forEach((notify) => notify())
}

export function usePrintTarget() {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => listeners.delete(notify)
    },
    () => target
  )
}

export function printRoot() {
  let root = document.getElementById(PRINT_ROOT_ID)
  if (!root) {
    root = document.createElement("div")
    root.id = PRINT_ROOT_ID
    document.body.appendChild(root)
  }
  return root
}

const twoFrames = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

const settled = (image: HTMLImageElement) =>
  new Promise<void>((resolve) => {
    const done = () => resolve()
    if (image.complete) return done()
    image.addEventListener("load", done, { once: true })
    image.addEventListener("error", done, { once: true })
  }).then(() => image.decode().catch(() => undefined))

async function imagesReady(root: HTMLElement, capMs: number) {
  const images = Array.from(root.querySelectorAll("img"))
  await Promise.race([
    Promise.all(images.map(settled)),
    new Promise<void>((resolve) => setTimeout(resolve, capMs)),
  ])
}

// 인쇄 사본(#print-root)이 그려지고 그 안의 사진이 모두 로드된 뒤에 인쇄 대화상자를 연다.
export async function printDocument(next: PrintTarget, capMs = 5000) {
  setTarget(next)
  await twoFrames()
  await imagesReady(printRoot(), capMs)
  window.addEventListener("afterprint", () => setTarget(null), { once: true })
  window.print()
}

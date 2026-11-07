import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
} from "react"
import { Dialog } from "@base-ui/react/dialog"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftRightIcon,
  HandIcon,
  Minimize2Icon,
  XIcon,
  ZoomInIcon,
} from "lucide-react"

import { AlignedRgb, COMPARE_LABEL } from "@/components/AlignedRgb"
import { DetectionImage } from "@/components/DetectionImage"
import { ReviewActions } from "@/components/ReviewActions"
import { FusionBadge, ReviewBadge, TierBadge } from "@/components/StatusBadges"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SITES } from "@/data/sites"
import { COMPARE_MODES, TAP_MOVE_PX, TAP_MS, capturePointer, clamp, type CompareMode } from "@/lib/compare"
import { useIsDesktop } from "@/lib/media"
import { cn } from "@/lib/utils"
import type { Photo, Review } from "@/types"

const MIN_ZOOM = 1
const MAX_ZOOM = 6
const DOUBLE_TAP_ZOOM = 2.5
const DOUBLE_TAP_PX = 24
const TOUCH_TABS = "group-data-horizontal/tabs:h-11 lg:group-data-horizontal/tabs:h-8"
const ICON_BUTTON = "size-11 lg:size-8"

type View = { scale: number; x: number; y: number }
type Tool = "split" | "pan"
type Size = { width: number; height: number }
type Point = { x: number; y: number }
type Gesture =
  | { kind: "drag"; id: number; x: number; y: number; t: number; view: View; moved: boolean }
  | { kind: "pinch"; distance: number; x: number; y: number; view: View; point: Point }

const HOME: View = { scale: 1, x: 0, y: 0 }
const EMPTY: Size = { width: 0, height: 0 }

// 열화상 비율의 틀을 칸 안에 맞춘 크기. 틀은 칸 가운데에 놓이고, 변환(translate·scale)은 틀의 왼쪽 위를 원점으로 한다.
// 아래 좌표는 모두 "변환 전 틀의 왼쪽 위"를 (0,0)으로 하는 틀 배치 좌표다.
function fitFrame(pane: Size, aspect: number): Size {
  const width = Math.min(pane.width, pane.height * aspect)
  return { width, height: width / aspect }
}

// 확대한 틀이 칸보다 작으면 가운데에 두고, 크면 가장자리가 칸 안으로 들어오지 않게 막는다.
function clampView(view: View, pane: Size, frame: Size): View {
  const width = frame.width * view.scale
  const height = frame.height * view.scale
  const ox = (pane.width - frame.width) / 2
  const oy = (pane.height - frame.height) / 2
  return {
    scale: view.scale,
    x: width <= pane.width ? (pane.width - width) / 2 - ox : clamp(view.x, pane.width - ox - width, -ox),
    y: height <= pane.height ? (pane.height - height) / 2 - oy : clamp(view.y, pane.height - oy - height, -oy),
  }
}

// point 아래의 사진 지점이 제자리에 남도록 배율만 바꾼다.
function zoomAt(view: View, point: Point, scale: number): View {
  const next = clamp(scale, MIN_ZOOM, MAX_ZOOM)
  const k = next / view.scale
  return { scale: next, x: point.x - (point.x - view.x) * k, y: point.y - (point.y - view.y) * k }
}

function Stage({
  photo,
  mode,
  split,
  onSplit,
  opacity,
  tool,
  view,
  setView,
  smooth,
  setSmooth,
}: {
  photo: Photo
  mode: CompareMode
  split: number
  onSplit: (split: number) => void
  opacity: number
  tool: Tool
  view: View
  setView: Dispatch<SetStateAction<View>>
  smooth: boolean
  setSmooth: (smooth: boolean) => void
}) {
  const stage = useRef<HTMLDivElement>(null)
  const [pane, setPane] = useState<Size>(EMPTY)
  const aspect = photo.width / photo.height
  const frame = fitFrame(pane, aspect)
  const geometry = useRef({ pane, frame })
  geometry.current = { pane, frame }
  const pointers = useRef(new Map<number, Point>())
  const gesture = useRef<Gesture | null>(null)
  const lastTap = useRef<{ x: number; y: number; t: number } | null>(null)
  const compare = !!photo.rgb
  const panes = compare && mode === "side" ? 2 : 1

  useLayoutEffect(() => {
    const first = stage.current?.querySelector("[data-pane]")
    if (!first) return
    const observer = new ResizeObserver(([entry]) =>
      setPane({ width: entry.contentRect.width, height: entry.contentRect.height })
    )
    observer.observe(first)
    return () => observer.disconnect()
  }, [panes])

  useLayoutEffect(() => {
    setView((current) => clampView(current, pane, fitFrame(pane, aspect)))
  }, [pane, aspect, setView])

  function paneRect(clientX: number, clientY: number) {
    const list = Array.from(stage.current?.querySelectorAll("[data-pane]") ?? [])
    const hit = list.find((element) => {
      const rect = element.getBoundingClientRect()
      return clientX >= rect.left && clientX < rect.right && clientY >= rect.top && clientY < rect.bottom
    })
    return (hit ?? list[0]).getBoundingClientRect()
  }

  function toFramePoint(clientX: number, clientY: number): Point {
    const rect = paneRect(clientX, clientY)
    const { pane, frame } = geometry.current
    return {
      x: clientX - rect.left - (pane.width - frame.width) / 2,
      y: clientY - rect.top - (pane.height - frame.height) / 2,
    }
  }

  function splitAt(clientX: number) {
    const rect = stage.current?.querySelector("[data-frame]")?.getBoundingClientRect()
    return rect?.width ? clamp(((clientX - rect.left) / rect.width) * 100, 0, 100) : split
  }

  // React는 wheel을 passive로 붙여 preventDefault가 듣지 않으므로 직접 등록한다(트랙패드 핀치의 페이지 확대를 막는다).
  useEffect(() => {
    const element = stage.current
    if (!element) return
    function onWheel(event: WheelEvent) {
      event.preventDefault()
      const factor = Math.exp(-event.deltaY * (event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 0.05 : 0.002))
      const point = toFramePoint(event.clientX, event.clientY)
      setSmooth(false)
      setView((current) => {
        const { pane, frame } = geometry.current
        return clampView(zoomAt(current, point, current.scale * factor), pane, frame)
      })
    }
    element.addEventListener("wheel", onWheel, { passive: false })
    return () => element.removeEventListener("wheel", onWheel)
  }, [setView, setSmooth])

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as Element).closest("button,input")) return
    capturePointer(event.currentTarget, event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    setSmooth(false)
    const points = Array.from(pointers.current.values())
    if (points.length === 2) {
      const [a, b] = points
      const x = (a.x + b.x) / 2
      const y = (a.y + b.y) / 2
      gesture.current = { kind: "pinch", distance: Math.hypot(b.x - a.x, b.y - a.y), x, y, view, point: toFramePoint(x, y) }
    } else if (points.length === 1) {
      gesture.current = {
        kind: "drag",
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        t: performance.now(),
        view,
        moved: false,
      }
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const current = gesture.current
    if (!current) return
    const { pane, frame } = geometry.current
    if (current.kind === "pinch") {
      const [a, b] = Array.from(pointers.current.values())
      if (!b) return
      const distance = Math.hypot(b.x - a.x, b.y - a.y)
      const zoomed = zoomAt(current.view, current.point, current.view.scale * (distance / current.distance))
      setView(
        clampView(
          { ...zoomed, x: zoomed.x + (a.x + b.x) / 2 - current.x, y: zoomed.y + (a.y + b.y) / 2 - current.y },
          pane,
          frame
        )
      )
      return
    }
    if (current.id !== event.pointerId) return
    const dx = event.clientX - current.x
    const dy = event.clientY - current.y
    if (!current.moved && Math.hypot(dx, dy) < TAP_MOVE_PX) return
    current.moved = true
    if (compare && mode === "wipe" && tool === "split") onSplit(splitAt(event.clientX))
    else if (current.view.scale > 1)
      setView(clampView({ ...current.view, x: current.view.x + dx, y: current.view.y + dy }, pane, frame))
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.delete(event.pointerId)) return
    const current = gesture.current
    if (!current) return
    if (current.kind === "pinch") {
      // 한 손가락이 남으면 그 손가락으로 이동을 이어 간다. 탭으로는 치지 않는다.
      const rest = Array.from(pointers.current.entries())[0]
      gesture.current = rest ? { kind: "drag", id: rest[0], x: rest[1].x, y: rest[1].y, t: 0, view, moved: true } : null
      return
    }
    if (current.id !== event.pointerId) return
    gesture.current = null
    const now = performance.now()
    if (event.type === "pointercancel" || current.moved || now - current.t >= TAP_MS) return
    const previous = lastTap.current
    lastTap.current = { x: event.clientX, y: event.clientY, t: now }
    if (
      !previous ||
      now - previous.t >= TAP_MS ||
      Math.hypot(event.clientX - previous.x, event.clientY - previous.y) >= DOUBLE_TAP_PX
    )
      return
    lastTap.current = null
    setSmooth(true)
    const { pane, frame } = geometry.current
    setView(
      clampView(
        view.scale > 1 ? HOME : zoomAt(view, toFramePoint(event.clientX, event.clientY), DOUBLE_TAP_ZOOM),
        pane,
        frame
      )
    )
  }

  const frameClass = cn(
    "relative shrink-0 origin-top-left",
    smooth && "transition-transform duration-200 motion-reduce:transition-none"
  )
  const frameStyle = {
    width: frame.width,
    height: frame.height,
    transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
  }
  const dividerLeft = (pane.width - frame.width) / 2 + view.x + (split / 100) * frame.width * view.scale
  const cursor =
    compare && mode === "wipe" && tool === "split" ? "cursor-ew-resize" : view.scale > 1 ? "cursor-grab" : ""
  const paneClass = "relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden"

  return (
    <div
      ref={stage}
      data-slot="viewer-stage"
      className={cn(
        "grid min-h-0 flex-1 touch-none select-none bg-black",
        panes === 2 && "portrait:grid-rows-2 landscape:grid-cols-2",
        cursor
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <div data-pane className={paneClass}>
        <div data-frame className={frameClass} style={frameStyle}>
          <DetectionImage
            photo={photo}
            className="size-full bg-black"
            boxClassName="border"
            layer={
              compare && mode === "wipe" ? (
                <AlignedRgb photo={photo} style={{ clipPath: `inset(0 0 0 ${split}%)` }} />
              ) : compare && mode === "overlap" ? (
                <AlignedRgb photo={photo} style={{ opacity: opacity / 100 }} />
              ) : undefined
            }
          />
        </div>
        {compare && mode === "wipe" && (
          <>
            <div
              className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.4)]"
              style={{ left: dividerLeft }}
            />
            <div
              role="slider"
              tabIndex={0}
              aria-label="열화상과 실화상 경계"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(split)}
              aria-valuetext={`실화상 ${Math.round(100 - split)}% 표시`}
              data-slot="viewer-handle"
              onKeyDown={(event) => {
                const step = { ArrowLeft: -5, ArrowRight: 5, Home: -100, End: 100 }[event.key]
                if (step === undefined) return
                event.preventDefault()
                event.stopPropagation()
                onSplit(clamp(split + step, 0, 100))
              }}
              className="absolute top-1/2 flex size-11 -translate-1/2 items-center justify-center rounded-full bg-white text-black shadow-md ring-1 ring-black/30 outline-none focus-visible:ring-3 focus-visible:ring-ring"
              style={{ left: dividerLeft }}
            >
              <ChevronsLeftRightIcon className="size-5" />
            </div>
          </>
        )}
        <span className={cn(COMPARE_LABEL, "left-2")}>{compare && mode === "overlap" ? "0% 열화상" : "열화상"}</span>
        {compare && mode !== "side" && (
          <span className={cn(COMPARE_LABEL, "right-2")}>{mode === "overlap" ? "100% 실화상" : "실화상"}</span>
        )}
      </div>
      {panes === 2 && (
        <div data-pane className={paneClass}>
          <div className={frameClass} style={frameStyle}>
            <img
              src={photo.rgb}
              alt={`${photo.seq}번 실화상`}
              decoding="async"
              draggable={false}
              className="size-full object-contain"
            />
          </div>
          <span className={cn(COMPARE_LABEL, "left-2")}>실화상</span>
        </div>
      )}
    </div>
  )
}

export function PhotoViewer({
  open,
  onOpenChange,
  photo,
  review,
  locked,
  mode,
  onModeChange,
  prev,
  next,
  onSelect,
  onReview,
  returnFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  photo: Photo
  review: Review
  locked: boolean
  mode: CompareMode
  onModeChange: (mode: CompareMode) => void
  prev?: Photo
  next?: Photo
  onSelect: (photoId: string) => void
  onReview: (review: Review) => void
  returnFocus: RefObject<HTMLElement | null>
}) {
  const isDesktop = useIsDesktop()
  const [split, setSplit] = useState(50)
  const [opacity, setOpacity] = useState(50)
  const [tool, setTool] = useState<Tool>("split")
  const [view, setView] = useState<View>(HOME)
  const [smooth, setSmooth] = useState(false)
  const popup = useRef<HTMLDivElement>(null)
  const site = SITES.find((item) => item.id === photo.site)
  const zoomed = view.scale > 1

  useEffect(() => {
    setView(HOME)
  }, [photo.id])

  useEffect(() => {
    if (!zoomed) setTool("split")
  }, [zoomed])

  function reset() {
    setSmooth(true)
    setView(HOME)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented || (event.target as HTMLElement).closest("input,[role=slider],[role=tablist]")) return
    const target = event.key === "ArrowLeft" ? prev : event.key === "ArrowRight" ? next : undefined
    if (!target) return
    event.preventDefault()
    onSelect(target.id)
  }

  return (
    <Dialog.Root
      open={open}
      // 푸터의 "기록 수정"이 띄운 토스트로 포커스가 나가도 뷰어는 닫지 않는다(사진 상세 시트와 같은 이유).
      onOpenChange={(next, details) => {
        if (!next && details.reason === "focus-out") return
        onOpenChange(next)
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[60] bg-black/80 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup
          ref={popup}
          initialFocus={popup}
          finalFocus={returnFocus}
          data-slot="photo-viewer"
          onKeyDown={onKeyDown}
          className="fixed inset-0 z-[60] flex flex-col bg-popover pt-[env(safe-area-inset-top)] text-popover-foreground outline-none transition duration-200 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none lg:inset-auto lg:top-1/2 lg:left-1/2 lg:h-[min(92dvh,1040px)] lg:w-[min(94vw,1560px)] lg:-translate-1/2 lg:rounded-2xl lg:border lg:pt-0 lg:shadow-lg lg:data-ending-style:scale-[0.98] lg:data-starting-style:scale-[0.98]"
        >
          <div className="flex items-center gap-1 border-b px-3 py-2 lg:gap-2 lg:px-4" data-slot="viewer-header">
            <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <div className="min-w-0">
                <Dialog.Title className="truncate text-base font-semibold">{photo.seq}번 사진</Dialog.Title>
                <Dialog.Description className="truncate text-xs text-muted-foreground">
                  {site?.name} · {photo.name ?? photo.capturedAt}
                </Dialog.Description>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <TierBadge photo={photo} />
                <ReviewBadge review={review} />
                <FusionBadge fusion={photo.fusion} live={!!photo.stage} />
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className={ICON_BUTTON}
              aria-label="이전 사진"
              disabled={!prev}
              onClick={() => prev && onSelect(prev.id)}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={ICON_BUTTON}
              aria-label="다음 사진"
              disabled={!next}
              onClick={() => next && onSelect(next.id)}
            >
              <ChevronRightIcon />
            </Button>
            <Dialog.Close render={<Button variant="ghost" size="icon" className={ICON_BUTTON} aria-label="닫기" />}>
              <XIcon />
            </Dialog.Close>
          </div>

          <Stage
            photo={photo}
            mode={mode}
            split={split}
            onSplit={setSplit}
            opacity={opacity}
            tool={tool}
            view={view}
            setView={setView}
            smooth={smooth}
            setSmooth={setSmooth}
          />

          <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2 lg:px-4" data-slot="viewer-toolbar">
            {photo.rgb && (
              <Tabs value={mode} onValueChange={(value) => onModeChange(value as CompareMode)}>
                <TabsList aria-label="사진 비교 방식" className={TOUCH_TABS}>
                  {COMPARE_MODES.map(({ value, label }) => (
                    <TabsTrigger key={value} value={value} className="px-3">
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}
            {photo.rgb && mode === "wipe" && (
              <Tabs value={tool} onValueChange={(value) => setTool(value as Tool)}>
                <TabsList aria-label="드래그 동작" className={TOUCH_TABS}>
                  <TabsTrigger value="split" className="px-3">
                    <ChevronsLeftRightIcon />
                    경계
                  </TabsTrigger>
                  <TabsTrigger value="pan" className="px-3" disabled={!zoomed}>
                    <HandIcon />
                    이동
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            {photo.rgb && mode === "overlap" && (
              <label className="flex min-w-48 flex-1 items-center gap-2 text-sm sm:max-w-xs">
                <span className="shrink-0 font-medium">실화상</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={opacity}
                  aria-label="실화상 불투명도"
                  aria-valuetext={`실화상 ${opacity}%`}
                  data-slot="viewer-opacity"
                  onChange={(event) => setOpacity(Number(event.target.value))}
                  className="h-11 min-w-0 flex-1 cursor-pointer accent-primary lg:h-8"
                />
                <span className="tabular w-10 shrink-0 text-right text-muted-foreground">{opacity}%</span>
              </label>
            )}
            <div className="ml-auto flex items-center gap-2">
              <span className="flex items-center gap-1 text-sm text-muted-foreground" aria-label="확대 배율">
                <ZoomInIcon className="size-4" aria-hidden />
                <span className="tabular" data-slot="viewer-zoom">
                  {Math.round(view.scale * 100)}%
                </span>
              </span>
              <Button
                variant="outline"
                className="h-11 lg:h-8"
                disabled={!zoomed}
                onClick={reset}
                data-slot="viewer-reset"
              >
                <Minimize2Icon />
                원래 크기
              </Button>
            </div>
          </div>

          <div
            className="border-t px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:px-4"
            data-slot="viewer-footer"
          >
            <ReviewActions
              photo={photo}
              review={review}
              locked={locked}
              orientation={isDesktop ? "row" : "stack"}
              onReview={onReview}
            />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

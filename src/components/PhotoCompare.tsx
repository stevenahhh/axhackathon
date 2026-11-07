import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react"
import { ChevronsLeftRightIcon } from "lucide-react"

import { DetectionImage } from "@/components/DetectionImage"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { Photo } from "@/types"

type Mode = "wipe" | "overlap" | "side"

const MODES: { value: Mode; label: string }[] = [
  { value: "wipe", label: "슬라이더" },
  { value: "overlap", label: "오버랩" },
  { value: "side", label: "나란히" },
]
const STORAGE_KEY = "suntek.compareMode"

// DJI M3T 열화상 화각은 줌 1.0 광각 실화상(4000x3000)의 가운데 2544x2040이다(짝 사진 24쌍 실측).
// 실화상 줌이 z면 열화상 화각은 실화상의 가로 63.6%·z, 세로 68%·z에 해당한다. 그 역수만큼 실화상을
// 키우거나(줌 1.0이면 157%) 줄여서(줌 1.95면 81%) 가운데에 두면 열화상 좌표의 박스가 두 사진 모두에 맞는다.
const IR_FRACTION = { x: 2544 / 4000, y: 2040 / 3000 }

function alignedRgbStyle(zoom = 1): CSSProperties {
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
function rgbNarrower(photo: Photo) {
  return (photo.rgbZoom ?? 1) * IR_FRACTION.y > 1
}

const LABEL = "pointer-events-none absolute top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white"

function readMode(): Mode {
  const saved = localStorage.getItem(STORAGE_KEY)
  return MODES.some((mode) => mode.value === saved) ? (saved as Mode) : "wipe"
}

function AlignedRgb({ photo, style }: { photo: Photo; style?: CSSProperties }) {
  // 서버가 렌즈 왜곡까지 맞춘 정렬본이 있으면 그대로 덮고, 없으면(업로드 사진) 줌 기준 배율로 맞춘다.
  // 실화상이 덧지 않는 가장자리는 검게 비워, 비치는 열화상이 실화상처럼 보이지 않게 한다.
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden bg-black" style={style}>
      {photo.rgbAligned ? (
        <img
          key={photo.rgbAligned}
          src={photo.rgbAligned}
          alt=""
          decoding="async"
          className="motion-fade-in absolute inset-0 size-full"
        />
      ) : (
        <img
          src={photo.rgb}
          alt=""
          decoding="async"
          className="absolute max-w-none"
          style={alignedRgbStyle(photo.rgbZoom)}
        />
      )}
    </div>
  )
}

function WipeCompare({ photo }: { photo: Photo }) {
  const [split, setSplit] = useState(50)
  const frame = useRef<HTMLDivElement>(null)

  function moveTo(clientX: number) {
    const rect = frame.current?.getBoundingClientRect()
    if (!rect?.width) return
    setSplit(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)))
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    moveTo(event.clientX)
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) moveTo(event.clientX)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowLeft: -5, ArrowRight: 5, Home: -100, End: 100 }[event.key]
    if (step === undefined) return
    event.preventDefault()
    setSplit((value) => Math.min(100, Math.max(0, value + step)))
  }

  return (
    <div
      ref={frame}
      data-slot="compare-wipe"
      className="cursor-ew-resize touch-pan-y select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
    >
      <DetectionImage
        photo={photo}
        className="rounded-lg"
        layer={<AlignedRgb photo={photo} style={{ clipPath: `inset(0 0 0 ${split}%)` }} />}
      >
        <span className={cn(LABEL, "left-2")}>열화상</span>
        <span className={cn(LABEL, "right-2")}>실화상</span>
        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.4)]"
          style={{ left: `${split}%` }}
        />
        <div
          role="slider"
          tabIndex={0}
          aria-label="열화상과 실화상 경계"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(split)}
          aria-valuetext={`실화상 ${Math.round(100 - split)}% 표시`}
          onKeyDown={onKeyDown}
          className="absolute top-1/2 flex size-11 -translate-1/2 items-center justify-center rounded-full bg-white text-black shadow-md ring-1 ring-black/30 outline-none focus-visible:ring-3 focus-visible:ring-ring"
          style={{ left: `${split}%` }}
        >
          <ChevronsLeftRightIcon className="size-5" />
        </div>
      </DetectionImage>
    </div>
  )
}

function OverlapCompare({ photo }: { photo: Photo }) {
  const [opacity, setOpacity] = useState(50)
  return (
    <div className="flex flex-col gap-1" data-slot="compare-overlap">
      <label className="flex items-center gap-3 text-sm">
        <span className="shrink-0 font-medium">통합 불투명도</span>
        <input
          type="range"
          min={0}
          max={100}
          value={opacity}
          aria-valuetext={`실화상 ${opacity}%`}
          onChange={(event) => setOpacity(Number(event.target.value))}
          className="h-11 min-w-0 flex-1 cursor-pointer accent-primary"
        />
        <span className="tabular w-10 shrink-0 text-right text-muted-foreground">{opacity}%</span>
      </label>
      <DetectionImage
        photo={photo}
        className="rounded-lg"
        layer={<AlignedRgb photo={photo} style={{ opacity: opacity / 100 }} />}
      >
        <span className={cn(LABEL, "left-2")}>0% 열화상</span>
        <span className={cn(LABEL, "right-2")}>100% 실화상</span>
      </DetectionImage>
    </div>
  )
}

export function PhotoCompare({ photo, caption }: { photo: Photo; caption: string }) {
  const [mode, setMode] = useState<Mode>(readMode)

  function choose(value: Mode) {
    setMode(value)
    localStorage.setItem(STORAGE_KEY, value)
  }

  if (!photo.rgb) {
    return (
      <figure className="flex flex-col gap-1">
        <DetectionImage photo={photo} className="rounded-lg" />
        <figcaption className="text-xs text-muted-foreground">{caption}</figcaption>
      </figure>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Tabs value={mode} onValueChange={(value) => choose(value as Mode)}>
        <TabsList
          className="w-full group-data-horizontal/tabs:h-auto"
          aria-label="사진 비교 방식"
        >
          {MODES.map(({ value, label }) => (
            <TabsTrigger key={value} value={value} className="h-11 lg:h-7">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {mode === "side" ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          <figure className="flex flex-col gap-1">
            <DetectionImage photo={photo} className="rounded-lg" />
            <figcaption className="text-xs text-muted-foreground">{caption}</figcaption>
          </figure>
          <figure className="flex flex-col gap-1">
            <img
              src={photo.rgb}
              alt={`${photo.seq}번 실화상`}
              decoding="async"
              className="aspect-[4/3] w-full rounded-lg bg-muted object-cover"
            />
            <figcaption className="text-xs text-muted-foreground">같은 시각 실화상</figcaption>
          </figure>
        </div>
      ) : (
        <figure className="flex flex-col gap-1">
          {mode === "wipe" ? <WipeCompare photo={photo} /> : <OverlapCompare photo={photo} />}
          <figcaption className="text-xs text-muted-foreground">
            {caption} ·{" "}
            {rgbNarrower(photo)
              ? `실화상(${photo.rgbZoom}× 줌)은 열화상 화각보다 좁아 가운데에만 겹침`
              : "실화상은 열화상 화각에 맞춰 겹침"}
          </figcaption>
        </figure>
      )}
    </div>
  )
}

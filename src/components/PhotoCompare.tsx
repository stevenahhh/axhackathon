import {
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from "react"
import { ChevronsLeftRightIcon, Maximize2Icon } from "lucide-react"

import { AlignedRgb, COMPARE_LABEL } from "@/components/AlignedRgb"
import { DetectionImage } from "@/components/DetectionImage"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { COMPARE_MODES, capturePointer, clamp, isTap, rgbNarrower, type CompareMode } from "@/lib/compare"
import { cn } from "@/lib/utils"
import type { Photo } from "@/types"

// 사진 위의 탭만 크게 보기를 연다. 포인터를 잡지 않으므로 세로 스크롤(touch-pan-y)은 브라우저가 그대로 맡고,
// 버튼·손잡이에서 시작한 포인터와 6px 넘게 움직이거나 300ms를 넘긴 포인터는 탭으로 치지 않는다.
function TapSurface({
  onTap,
  className,
  children,
  ...rest
}: ComponentProps<"div"> & { onTap: () => void }) {
  const down = useRef<{ id: number; x: number; y: number; t: number } | null>(null)
  return (
    <div
      {...rest}
      className={cn("relative cursor-zoom-in touch-pan-y select-none", className)}
      onPointerDown={(event) => {
        if (event.button !== 0 || (event.target as Element).closest("button,[role=slider],input")) return
        down.current = { id: event.pointerId, x: event.clientX, y: event.clientY, t: performance.now() }
      }}
      onPointerUp={(event) => {
        const begun = down.current
        down.current = null
        if (begun?.id !== event.pointerId) return
        if (isTap(begun, { x: event.clientX, y: event.clientY, t: performance.now() })) onTap()
      }}
      onPointerCancel={() => {
        down.current = null
      }}
    >
      {children}
    </div>
  )
}

function ExpandButton({ onClick, ref }: { onClick: () => void; ref?: Ref<HTMLButtonElement> }) {
  return (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="icon"
      aria-label="크게 보기"
      data-slot="compare-expand"
      className="absolute top-2 right-2 size-11 bg-black/60 text-white hover:bg-black/75 hover:text-white lg:size-8"
      onClick={onClick}
    >
      <Maximize2Icon />
    </Button>
  )
}

function WipeCompare({ photo, children }: { photo: Photo; children?: ReactNode }) {
  const [split, setSplit] = useState(50)
  const frame = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; x: number; split: number } | null>(null)

  function onHandlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.stopPropagation()
    drag.current = { id: event.pointerId, x: event.clientX, split }
    capturePointer(event.currentTarget, event.pointerId)
  }

  function onHandlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const begun = drag.current
    const width = frame.current?.getBoundingClientRect().width
    if (begun?.id !== event.pointerId || !width) return
    setSplit(clamp(begun.split + ((event.clientX - begun.x) / width) * 100, 0, 100))
  }

  function onHandlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id === event.pointerId) drag.current = null
    event.stopPropagation()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowLeft: -5, ArrowRight: 5, Home: -100, End: 100 }[event.key]
    if (step === undefined) return
    event.preventDefault()
    setSplit((value) => clamp(value + step, 0, 100))
  }

  return (
    <div ref={frame} data-slot="compare-wipe">
      <DetectionImage
        photo={photo}
        className="rounded-lg"
        layer={<AlignedRgb photo={photo} style={{ clipPath: `inset(0 0 0 ${split}%)` }} />}
      >
        <span className={cn(COMPARE_LABEL, "left-2")}>열화상</span>
        <span className={cn(COMPARE_LABEL, "right-2")}>실화상</span>
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
          data-slot="compare-handle"
          onKeyDown={onKeyDown}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerEnd}
          onPointerCancel={onHandlePointerEnd}
          className="absolute top-1/2 flex size-11 -translate-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full bg-white text-black shadow-md ring-1 ring-black/30 outline-none focus-visible:ring-3 focus-visible:ring-ring"
          style={{ left: `${split}%` }}
        >
          <ChevronsLeftRightIcon className="size-5" />
        </div>
        {children}
      </DetectionImage>
    </div>
  )
}

function OverlapCompare({ photo, children }: { photo: Photo; children?: ReactNode }) {
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
        <span className={cn(COMPARE_LABEL, "left-2")}>0% 열화상</span>
        <span className={cn(COMPARE_LABEL, "right-2")}>100% 실화상</span>
        {children}
      </DetectionImage>
    </div>
  )
}

export function PhotoCompare({
  photo,
  caption,
  mode,
  onModeChange,
  onExpand,
  expandRef,
}: {
  photo: Photo
  caption: string
  mode: CompareMode
  onModeChange: (mode: CompareMode) => void
  onExpand: () => void
  expandRef?: Ref<HTMLButtonElement>
}) {
  const expand = <ExpandButton ref={expandRef} onClick={onExpand} />

  if (!photo.rgb) {
    return (
      <figure className="flex flex-col gap-1">
        <TapSurface onTap={onExpand}>
          <DetectionImage photo={photo} className="rounded-lg">
            {expand}
          </DetectionImage>
        </TapSurface>
        <figcaption className="text-xs text-muted-foreground">{caption}</figcaption>
      </figure>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Tabs value={mode} onValueChange={(value) => onModeChange(value as CompareMode)}>
        <TabsList className="w-full group-data-horizontal/tabs:h-auto" aria-label="사진 비교 방식">
          {COMPARE_MODES.map(({ value, label }) => (
            <TabsTrigger key={value} value={value} className="h-11 lg:h-7">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {mode === "side" ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          <figure className="flex flex-col gap-1">
            <TapSurface onTap={onExpand}>
              <DetectionImage photo={photo} className="rounded-lg">
                {expand}
              </DetectionImage>
            </TapSurface>
            <figcaption className="text-xs text-muted-foreground">{caption}</figcaption>
          </figure>
          <figure className="flex flex-col gap-1">
            <TapSurface onTap={onExpand}>
              <img
                src={photo.rgb}
                alt={`${photo.seq}번 실화상`}
                decoding="async"
                draggable={false}
                className="aspect-[4/3] w-full rounded-lg bg-muted object-cover"
              />
            </TapSurface>
            <figcaption className="text-xs text-muted-foreground">같은 시각 실화상</figcaption>
          </figure>
        </div>
      ) : (
        <figure className="flex flex-col gap-1">
          <TapSurface onTap={onExpand}>
            {mode === "wipe" ? (
              <WipeCompare photo={photo}>{expand}</WipeCompare>
            ) : (
              <OverlapCompare photo={photo}>{expand}</OverlapCompare>
            )}
          </TapSurface>
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

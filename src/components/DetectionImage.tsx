import { useEffect, useRef, useState, type ReactNode } from "react"

import { cn } from "@/lib/utils"
import type { Photo, Stage } from "@/types"

// 테마 토큰이 아닌 이미지 주석색: iron 팔레트(보라 배경·주황 패널) 위에서 구분되는 청록에 검은 테두리를 한 겹 더 두른다.
const BOX = "border-cyan-300 ring-1 ring-black/40"

// 업로드 사진의 박스는 처음 나타날 때 한 번만 팝인한다. 사진마다 기억해 두고 다시 그릴 때는 가만히 둔다.
function useFirstAppearance(photoId: string, count: number) {
  const seen = useRef<Record<string, boolean>>({})
  const [popping, setPopping] = useState(false)
  useEffect(() => {
    if (count > 0 && !seen.current[photoId]) {
      seen.current[photoId] = true
      setPopping(true)
      const timer = window.setTimeout(() => setPopping(false), 260 + count * 25)
      return () => window.clearTimeout(timer)
    }
  }, [photoId, count])
  return popping
}

export function DetectionImage({
  photo,
  className,
  boxClassName = "border-2",
  loading = "eager",
  stage,
  layer,
  children,
}: {
  photo: Photo
  className?: string
  boxClassName?: string
  loading?: "eager" | "lazy"
  // 업로드 사진의 실시간 연산 단계. 탐지 중에는 스캔라인을 그리고, 박스가 처음 나오면 팝인한다.
  stage?: Stage
  // layer는 열화상과 박스 사이(비교용 실화상), children은 박스 위(비교 손잡이)에 그린다.
  layer?: ReactNode
  children?: ReactNode
}) {
  const scanning = stage === "queued" || stage === "detecting"
  const popping = useFirstAppearance(photo.id, stage ? photo.boxes.length : 0)
  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      <img
        src={photo.ir}
        alt={`${photo.seq}번 열화상`}
        width={photo.width}
        height={photo.height}
        loading={loading}
        decoding="async"
        draggable={false}
        className="block h-auto w-full"
      />
      {layer}
      {photo.boxes.map(({ bbox: [x, y, w, h] }, index) => (
        <span
          key={index}
          aria-hidden
          className={cn(
            "absolute min-h-2.5 min-w-2.5 -translate-x-0.5 -translate-y-0.5 rounded-[2px]",
            BOX,
            boxClassName,
            popping && "motion-pop"
          )}
          style={{
            left: `${(x / photo.width) * 100}%`,
            top: `${(y / photo.height) * 100}%`,
            width: `${(w / photo.width) * 100}%`,
            height: `${(h / photo.height) * 100}%`,
            animationDelay: popping ? `${index * 25}ms` : undefined,
          }}
        />
      ))}
      {scanning && (
        <div aria-hidden className="pointer-events-none absolute inset-0" data-slot="scan">
          <div className="motion-shimmer absolute inset-0" />
          <div className="motion-scan" />
        </div>
      )}
      {children}
    </div>
  )
}

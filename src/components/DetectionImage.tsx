import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import type { Photo } from "@/types"

// 테마 토큰이 아닌 이미지 주석색: iron 팔레트(보라 배경·주황 패널) 위에서 구분되는 청록에 검은 테두리를 한 겹 더 두른다.
const BOX = "border-cyan-300 ring-1 ring-black/40"

export function DetectionImage({
  photo,
  className,
  boxClassName = "border-2",
  loading = "eager",
  layer,
  children,
}: {
  photo: Photo
  className?: string
  boxClassName?: string
  loading?: "eager" | "lazy"
  // layer는 열화상과 박스 사이(비교용 실화상), children은 박스 위(비교 손잡이)에 그린다.
  layer?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      <img
        src={photo.ir}
        alt={`${photo.seq}번 열화상`}
        width={photo.width}
        height={photo.height}
        loading={loading}
        decoding="async"
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
            boxClassName
          )}
          style={{
            left: `${(x / photo.width) * 100}%`,
            top: `${(y / photo.height) * 100}%`,
            width: `${(w / photo.width) * 100}%`,
            height: `${(h / photo.height) * 100}%`,
          }}
        />
      ))}
      {children}
    </div>
  )
}

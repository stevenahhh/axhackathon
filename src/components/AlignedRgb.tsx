import type { CSSProperties } from "react"

import { alignedRgbStyle } from "@/lib/compare"
import type { Photo } from "@/types"

// 사진 모서리의 이름표(열화상·실화상). 테마와 무관하게 사진 위에 놓이므로 검은 반투명 면에 흰 글자다.
export const COMPARE_LABEL =
  "pointer-events-none absolute bottom-2 rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white"

// 열화상 틀에 맞춘 실화상 층. 서버가 렌즈 왜곡까지 맞춘 정렬본이 있으면 그대로 덮고, 없으면(업로드 사진) 줌 기준 배율로 맞춘다.
// 실화상이 덮지 않는 가장자리는 검게 비워, 비치는 열화상이 실화상처럼 보이지 않게 한다.
export function AlignedRgb({ photo, style }: { photo: Photo; style?: CSSProperties }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden bg-black" style={style}>
      {photo.rgbAligned ? (
        <img
          key={photo.rgbAligned}
          src={photo.rgbAligned}
          alt=""
          decoding="async"
          draggable={false}
          className="motion-fade-in absolute inset-0 size-full"
        />
      ) : (
        <img
          src={photo.rgb}
          alt=""
          decoding="async"
          draggable={false}
          className="absolute max-w-none"
          style={alignedRgbStyle(photo.rgbZoom)}
        />
      )}
    </div>
  )
}

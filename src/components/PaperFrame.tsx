import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"

import { cn } from "@/lib/utils"

// 화면 미리보기 전용. A4 폭을 scale로 줄여 보이고, 인쇄는 PrintPortal이 따로 그린 사본으로 한다.
export function PaperFrame({
  children,
  className,
  paperClassName,
}: {
  children: ReactNode
  className?: string
  paperClassName?: string
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const paperRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [height, setHeight] = useState<number>()

  useLayoutEffect(() => {
    const frame = frameRef.current
    const paper = paperRef.current
    if (!frame || !paper) return
    const measure = () => {
      const paperWidth = paper.offsetWidth
      if (!paperWidth) return
      const next = Math.min(1, frame.clientWidth / paperWidth)
      setScale(next)
      setHeight(paper.offsetHeight * next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    observer.observe(paper)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={frameRef}
      className={cn("w-full min-w-0 overflow-hidden [contain:inline-size]", className)}
      style={{ height }}
    >
      <div
        ref={paperRef}
        data-slot="paper"
        className={cn(
          "paper w-[210mm] min-h-[297mm] origin-top-left scale-(--paper-scale) shadow-sm ring-1 ring-foreground/15",
          paperClassName
        )}
        style={{ "--paper-scale": scale } as CSSProperties}
      >
        {children}
      </div>
    </div>
  )
}

import type { ReactNode } from "react"
import { createPortal } from "react-dom"

import { printRoot } from "@/lib/print"
import { cn } from "@/lib/utils"

export function PrintPortal({ active, children }: { active: boolean; children: ReactNode }) {
  if (!active) return null
  return createPortal(<div className="paper w-full">{children}</div>, printRoot())
}

// 인쇄 사본의 한 장. 인쇄는 장 사이를 페이지 나눔으로 끊고, PDF 다운로드는 장마다 따로 캡처한다(src/lib/pdf.ts).
export function PrintPage({ last = true, children }: { last?: boolean; children: ReactNode }) {
  return (
    <div data-slot="print-page" className={cn("break-inside-avoid", !last && "break-after-page")}>
      {children}
    </div>
  )
}

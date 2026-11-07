import type { ReactNode } from "react"
import { createPortal } from "react-dom"

import { printRoot } from "@/lib/print"

export function PrintPortal({ active, children }: { active: boolean; children: ReactNode }) {
  if (!active) return null
  return createPortal(<div className="paper w-full">{children}</div>, printRoot())
}

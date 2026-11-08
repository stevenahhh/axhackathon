import { useCallback, useState } from "react"
import { toast } from "sonner"

import { CURRENT_INSPECTION, shortName, siteById } from "@/data/sites"
import { twoFrames, withPrintCopy, type PrintTarget } from "@/lib/print"
import type { SiteId } from "@/types"

// A4(mm). 장을 2배 해상도(192dpi)로 그려 글자가 또렷하게 나오게 한다.
const A4 = { width: 210, height: 297 }
const SCALE = 2
const JPEG_QUALITY = 0.92

export type PdfKind = "점검기록표" | "열화상측정기록표"

// SunSET_점검기록표_하동_2026-11.pdf, SunSET_열화상측정기록표_영광_2026-11_12번.pdf
export function pdfFileName(kind: PdfKind, site: SiteId, suffix?: string) {
  const region = shortName(siteById(site)).replace(/\s+/g, "")
  return `SunSET_${kind}_${region}_${CURRENT_INSPECTION.month}${suffix ? `_${suffix}` : ""}.pdf`
}

// 인쇄 사본(#print-root)을 화면 밖에 A4 폭으로 그린 뒤 장마다 캔버스로 떠서 PDF 한 장씩 넣는다.
// 라이브러리(modern-screenshot, jspdf)는 버튼을 누를 때만 받아 첫 번들에 들어가지 않는다.
export async function renderPdf(target: PrintTarget): Promise<Blob> {
  const [{ domToCanvas }, { jsPDF }] = await Promise.all([import("modern-screenshot"), import("jspdf")])
  return withPrintCopy(target, async (root) => {
    root.dataset.capture = ""
    try {
      await twoFrames()
      const pages = Array.from(root.querySelectorAll<HTMLElement>('[data-slot="print-page"]'))
      if (pages.length === 0) throw new Error("내려받을 서식이 없습니다.")
      const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true })
      for (const [index, page] of pages.entries()) {
        const canvas = await domToCanvas(page, { scale: SCALE, backgroundColor: "#ffffff", font: false })
        const height = (canvas.height / canvas.width) * A4.width
        // 한 장을 넘치면 비율을 지키며 줄여 한 장에 담는다.
        const fit = Math.min(1, A4.height / height)
        const width = A4.width * fit
        if (index > 0) pdf.addPage()
        pdf.addImage(canvas.toDataURL("image/jpeg", JPEG_QUALITY), "JPEG", (A4.width - width) / 2, 0, width, height * fit)
      }
      return pdf.output("blob")
    } finally {
      delete root.dataset.capture
    }
  })
}

export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  anchor.rel = "noopener"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // iOS Safari는 클릭 뒤에 blob을 읽으므로 바로 지우지 않는다.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function usePdfDownload() {
  const [busy, setBusy] = useState<PrintTarget | null>(null)
  const download = useCallback(async (target: PrintTarget, fileName: string) => {
    const id = `pdf-${target}`
    setBusy(target)
    toast.loading("PDF를 만드는 중", { id, description: fileName, duration: Infinity })
    try {
      saveBlob(await renderPdf(target), fileName)
      toast.success("PDF를 내려받았습니다", { id, description: fileName, duration: 4000 })
    } catch (error) {
      toast.error("PDF를 만들지 못했습니다", {
        id,
        description: error instanceof Error ? error.message : String(error),
        duration: 6000,
      })
    } finally {
      setBusy(null)
    }
  }, [])
  return { busy, download }
}

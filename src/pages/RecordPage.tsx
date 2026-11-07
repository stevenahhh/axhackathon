import { useState } from "react"
import { PrinterIcon } from "lucide-react"

import { Form9Editor } from "@/components/Form9Editor"
import { Form9Preview } from "@/components/Form9Preview"
import { PaperFrame } from "@/components/PaperFrame"
import { SitePicker, SiteSummaryCard, type SiteChip } from "@/components/SitePicker"
import { ThermalRecord } from "@/components/ThermalRecord"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SITES } from "@/data/sites"
import { missingCells, type Summary } from "@/lib/inspection"
import { cn } from "@/lib/utils"
import type { SiteStat } from "@/pages/DashboardPage"
import type { Inspection, Photo, SiteId } from "@/types"

type Tab = "edit" | "preview" | "thermal"

export function RecordPage({
  site,
  photos,
  inspection,
  summary,
  stats,
}: {
  site: SiteId
  photos: Photo[]
  inspection: Inspection
  summary: Summary
  stats: Record<SiteId, SiteStat>
}) {
  const [tab, setTab] = useState<Tab>("edit")
  const chips = Object.fromEntries(
    SITES.map((item) => {
      const stat = stats[item.id]
      const note = stat.inspection.savedAt
        ? "저장됨"
        : `미입력 ${missingCells(stat.inspection, stat.summary).count}`
      return [item.id, { status: stat.status, note }]
    })
  ) as Record<SiteId, SiteChip>

  return (
    <div className="flex flex-col gap-5">
      <SitePicker page="record" site={site} chips={chips} />
      <SiteSummaryCard site={site} status={stats[site].status} />

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList className="w-full group-data-horizontal/tabs:h-13 lg:w-fit">
          <TabsTrigger value="edit">
            <span className="lg:hidden">점검기록표 입력</span>
            <span className="hidden lg:inline">점검기록표</span>
          </TabsTrigger>
          <TabsTrigger value="preview" className="lg:hidden">
            미리보기
          </TabsTrigger>
          <TabsTrigger value="thermal">
            <span className="lg:hidden">열화상 측정기록표</span>
            <span className="hidden lg:inline">열화상 측정기록표 (분기)</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "thermal" ? (
        <ThermalRecord site={site} photos={photos} inspection={inspection} summary={summary} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
          <div className={cn(tab === "preview" && "hidden lg:block")}>
            <Form9Editor site={site} inspection={inspection} summary={summary} />
          </div>
          <div
            className={cn(
              "flex flex-col gap-3 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto print:static print:max-h-none print:overflow-visible",
              tab === "edit" && "hidden lg:flex"
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">A4 미리보기 · 인쇄하면 이 서식만 나옵니다.</p>
              <Button variant="outline" className="h-11 lg:h-8" onClick={() => window.print()}>
                <PrinterIcon />
                인쇄
              </Button>
            </div>
            <PaperFrame>
              <Form9Preview site={site} inspection={inspection} summary={summary} />
            </PaperFrame>
          </div>
        </div>
      )}
    </div>
  )
}

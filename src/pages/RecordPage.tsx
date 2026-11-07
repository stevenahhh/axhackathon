import { useState } from "react"
import { PrinterIcon, ThermometerIcon } from "lucide-react"

import { Form9Editor } from "@/components/Form9Editor"
import { Form9Preview } from "@/components/Form9Preview"
import { PaperFrame } from "@/components/PaperFrame"
import { SiteStatusBadge } from "@/components/StatusBadges"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SITES, siteById } from "@/data/sites"
import type { Summary } from "@/lib/inspection"
import { hrefOf } from "@/lib/route"
import { cn } from "@/lib/utils"
import type { Inspection, Photo, SiteId } from "@/types"

type Tab = "edit" | "preview" | "thermal"

export function RecordPage({
  site,
  photos,
  inspection,
  summary,
}: {
  site: SiteId
  photos: Photo[]
  inspection: Inspection
  summary: Summary
}) {
  const [tab, setTab] = useState<Tab>("edit")
  const info = siteById(site)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={site}
          onValueChange={(value) => (window.location.hash = hrefOf({ page: "record", site: value as SiteId }))}
        >
          <TabsList className="group-data-horizontal/tabs:h-11">
            {SITES.map((item) => (
              <TabsTrigger key={item.id} value={item.id} className="min-w-11 px-3">
                {item.name.replace(" 태양광발전소", "")}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <p className="text-sm text-muted-foreground">
          {info.region} · {info.capacityKw}kW
        </p>
        <SiteStatusBadge status={inspection.savedAt ? "saved" : "record"} />
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList className="w-full group-data-horizontal/tabs:h-13 lg:w-fit">
          <TabsTrigger value="edit">
            <span className="lg:hidden">점검기록표 입력</span>
            <span className="hidden lg:inline">점검기록표</span>
          </TabsTrigger>
          <TabsTrigger value="preview" className="lg:hidden">
            미리보기
          </TabsTrigger>
          <TabsTrigger value="thermal">열화상 측정기록표</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "thermal" ? (
        /* todo 10: 이 블록을 <ThermalRecord site={site} photos={photos} inspection={inspection} summary={summary} />로 바꾼다. */
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <ThermometerIcon className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">열화상 측정기록표는 준비 중입니다</p>
            <p className="tabular text-xs text-muted-foreground">
              확정 사진 {summary.confirmed.length}장 / 열화상 {photos.length}장
            </p>
          </CardContent>
        </Card>
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

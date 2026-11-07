import { useCallback, useEffect, useMemo, useState } from "react"

import { AppShell } from "@/components/AppShell"
import type { SiteStatus } from "@/components/StatusBadges"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { siteById } from "@/data/sites"
import { fetchHealth } from "@/lib/api"
import { photosOf, summarize, type Summary } from "@/lib/inspection"
import { hrefOf, useRoute, type Route } from "@/lib/route"
import { useAppState } from "@/lib/store"
import { DashboardPage, type SiteStat } from "@/pages/DashboardPage"
import { ReviewPage } from "@/pages/ReviewPage"
import type { Inspection, Photo, SiteId } from "@/types"

const SITE_IDS: SiteId[] = ["A", "B", "C"]

const TITLES: Record<Route["page"], string> = {
  dashboard: "대시보드",
  review: "사진 확인",
  record: "기록표",
}

const DOT: Record<SiteStatus, string> = {
  todo: "bg-muted-foreground",
  review: "bg-warning",
  record: "bg-info",
  saved: "bg-success",
}

function statusOf(inspection: Inspection, summary: Summary): SiteStatus {
  if (inspection.savedAt) return "saved"
  if (inspection.startedAt && summary.pendingReview === 0) return "record"
  if (inspection.startedAt) return "review"
  return "todo"
}

// 첫 호출이 60분 무호출로 일시정지된 AIStream 서빙을 미리 깨운다.
function useServingHealth() {
  const [down, setDown] = useState(false)
  const [busy, setBusy] = useState(true)
  const probe = useCallback(
    () =>
      fetchHealth()
        .then(
          (health) => setDown(!health.serving.ok),
          () => setDown(true)
        )
        .finally(() => setBusy(false)),
    []
  )
  useEffect(() => {
    void probe()
  }, [probe])
  const retry = () => {
    setBusy(true)
    void probe()
  }
  return { down, busy, retry }
}

function RecordPlaceholder({ site, summary }: { site: SiteId; summary: Summary }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">{siteById(site).name} 기록표</h2>
        <p className="text-sm text-muted-foreground">
          기록표 편집 화면을 아직 연결하지 않았습니다. 확정 핫스팟 {summary.confirmed.length}장, 우선 확인
          미처리 {summary.pendingReview}장.
        </p>
        <Button
          variant="outline"
          className="w-full sm:w-fit"
          nativeButton={false}
          render={<a href={hrefOf({ page: "review", site })} />}
        >
          사진 확인으로 이동
        </Button>
      </CardContent>
    </Card>
  )
}

export default function App() {
  const route = useRoute()
  const { inspections, uploads } = useAppState()
  const serving = useServingHealth()

  const photos = useMemo(
    () =>
      Object.fromEntries(SITE_IDS.map((id) => [id, photosOf(id, uploads)])) as Record<SiteId, Photo[]>,
    [uploads]
  )
  const stats = useMemo(() => {
    const entries = SITE_IDS.map((id) => {
      const inspection = inspections[id]
      const summary = summarize(photos[id], inspection)
      return [id, { summary, inspection, status: statusOf(inspection, summary) }] as const
    })
    return Object.fromEntries(entries) as Record<SiteId, SiteStat>
  }, [inspections, photos])
  const dots = Object.fromEntries(
    SITE_IDS.map((id) => [id, DOT[stats[id].status]])
  ) as Record<SiteId, string>

  const href = hrefOf(route)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [href])

  const notice = serving.down ? (
    <>
      <span>AI 판정 서버에 연결하지 못했습니다.</span>
      <Button variant="link" size="sm" className="h-auto p-0" disabled={serving.busy} onClick={serving.retry}>
        다시 시도
      </Button>
    </>
  ) : undefined

  return (
    <AppShell route={route} title={TITLES[route.page]} dots={dots} notice={notice}>
      {route.page === "dashboard" && <DashboardPage stats={stats} />}
      {route.page === "review" && (
        <ReviewPage
          key={route.site}
          site={route.site}
          photos={photos[route.site]}
          inspection={stats[route.site].inspection}
          summary={stats[route.site].summary}
        />
      )}
      {route.page === "record" && (
        <RecordPlaceholder site={route.site} summary={stats[route.site].summary} />
      )}
    </AppShell>
  )
}

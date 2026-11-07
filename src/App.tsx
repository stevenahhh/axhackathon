import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { AppShell } from "@/components/AppShell"
import { SITE_DOT, type SiteStatus } from "@/components/StatusBadges"
import { Toaster } from "@/components/ui/sonner"
import { fetchHealth } from "@/lib/api"
import { photosOf, summarize, type Summary } from "@/lib/inspection"
import { hrefOf, useRoute, type Route } from "@/lib/route"
import { useAppState } from "@/lib/store"
import { DashboardPage, type SiteStat } from "@/pages/DashboardPage"
import { RecordPage } from "@/pages/RecordPage"
import { ReviewPage } from "@/pages/ReviewPage"
import type { Inspection, Photo, SiteId } from "@/types"

const SITE_IDS: SiteId[] = ["A", "B", "C", "D", "E"]

const TITLES: Record<Route["page"], string> = {
  dashboard: "대시보드",
  review: "사진 확인",
  record: "기록표",
}

function statusOf(inspection: Inspection, summary: Summary): SiteStatus {
  if (inspection.savedAt) return "saved"
  if (inspection.startedAt && summary.pendingReview === 0) return "record"
  if (inspection.startedAt) return "review"
  return "todo"
}

const SERVING_TOAST = "serving-down"

// 첫 호출이 60분 무호출로 일시정지된 AIStream 서빙을 미리 깨운다.
// 연결 실패는 지속 토스트 하나(id 고정)로 알리고, 다시 시도 중에는 로딩으로 바꾸고, 복구되면 닫는다.
function useServingHealth() {
  const [down, setDown] = useState(false)
  const [busy, setBusy] = useState(true)
  const wasDown = useRef(false)
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
  useEffect(() => {
    if (!down) {
      // 띄운 적 없는 id를 dismiss하면 sonner가 그 닫기를 한 프레임 뒤에 처리해, 바로 뒤에 만든 같은 id의 토스트를 지울 수 있다.
      if (!wasDown.current) return
      wasDown.current = false
      toast.dismiss(SERVING_TOAST)
      toast.success("AI 판정 서버에 연결했습니다")
      return
    }
    wasDown.current = true
    if (busy) {
      toast.loading("AI 판정 서버에 다시 연결하는 중", {
        id: SERVING_TOAST,
        duration: Infinity,
        description: undefined,
        action: undefined,
      })
      return
    }
    toast.warning("AI 판정 서버에 연결하지 못했습니다", {
      id: SERVING_TOAST,
      duration: Infinity,
      description: "추가한 열화상의 핫스팟 판정이 되지 않습니다.",
      action: {
        label: "다시 시도",
        onClick: (event) => {
          event.preventDefault()
          setBusy(true)
          void probe()
        },
      },
    })
  }, [down, busy, probe])
}

export default function App() {
  const route = useRoute()
  const { inspections, uploads } = useAppState()
  useServingHealth()

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
    SITE_IDS.map((id) => [id, SITE_DOT[stats[id].status]])
  ) as Record<SiteId, string>

  const href = hrefOf(route)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [href])

  return (
    <AppShell route={route} title={TITLES[route.page]} dots={dots}>
      {route.page === "dashboard" && <DashboardPage stats={stats} />}
      {route.page === "review" && (
        <ReviewPage
          key={route.site}
          site={route.site}
          photos={photos[route.site]}
          inspection={stats[route.site].inspection}
          summary={stats[route.site].summary}
          stats={stats}
        />
      )}
      {route.page === "record" && (
        <RecordPage
          key={route.site}
          site={route.site}
          photos={photos[route.site]}
          inspection={stats[route.site].inspection}
          summary={stats[route.site].summary}
          stats={stats}
        />
      )}
      <Toaster />
    </AppShell>
  )
}

import type { ReactNode } from "react"
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  FlameIcon,
  ImagesIcon,
  ScanEyeIcon,
} from "lucide-react"

import { SiteStatusBadge, type SiteStatus } from "@/components/StatusBadges"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  CURRENT_PERIOD,
  HISTORY,
  SITES,
  formatCapacity,
  periodLabel,
  quarterOf,
  quarterShort,
  siteById,
} from "@/data/sites"
import type { Summary } from "@/lib/inspection"
import { hrefOf } from "@/lib/route"
import { cn } from "@/lib/utils"
import type { Inspection, Site, SiteId } from "@/types"

export type SiteStat = { summary: Summary; inspection: Inspection; status: SiteStatus }

const PERIODS = ["2026-Q1", "2026-Q2", "2026-Q3", CURRENT_PERIOD]
const SITE_COLOR: Record<SiteId, string> = {
  A: "bg-chart-1",
  B: "bg-chart-2",
  C: "bg-chart-3",
  D: "bg-chart-4",
  E: "bg-chart-5",
}

function Kpi({
  icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: ReactNode
  tone: string
  label: string
  value: ReactNode
  hint: string
}) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span
            className={cn("grid size-7 shrink-0 place-items-center rounded-lg [&_svg]:size-4", tone)}
            aria-hidden="true"
          >
            {icon}
          </span>
          <span className="truncate">{label}</span>
        </div>
        <p className="tabular text-2xl font-semibold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}

function SiteCard({ site, stat }: { site: Site; stat: SiteStat }) {
  const { summary, status } = stat
  const progress = summary.priority ? Math.round((summary.handled / summary.priority) * 100) : 100
  const cells = [
    ["판정", summary.judged],
    ["후보", summary.flagged],
    ["확정", summary.confirmed.length],
  ] as const
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className={cn("size-2.5 rounded-full", SITE_COLOR[site.id])} aria-hidden="true" />
          {site.name}
        </CardTitle>
        <CardDescription>
          {site.region} · {formatCapacity(site.capacityKw)}
        </CardDescription>
        <CardAction>
          <SiteStatusBadge status={status} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid grid-cols-3 gap-2 text-center">
          {cells.map(([label, value]) => (
            <div key={label} className="rounded-lg bg-muted px-2 py-1.5">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="tabular font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span id={`progress-label-${site.id}`}>우선 확인 진행</span>
            <span className="tabular">
              {summary.handled}/{summary.priority}
            </span>
          </div>
          <Progress value={progress} aria-labelledby={`progress-label-${site.id}`} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="h-11 lg:h-8"
            nativeButton={false}
            render={<a href={hrefOf({ page: "review", site: site.id })} />}
          >
            사진 확인
          </Button>
          <Button
            variant="secondary"
            className="h-11 lg:h-8"
            nativeButton={false}
            render={<a href={hrefOf({ page: "record", site: site.id })} />}
          >
            기록표
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function TrendChart({ stats }: { stats: Record<SiteId, SiteStat> }) {
  const value = (site: SiteId, period: string) =>
    period === CURRENT_PERIOD
      ? stats[site].summary.confirmed.length
      : (HISTORY.find((entry) => entry.site === site && entry.ym === period)?.confirmed ?? 0)
  const max = Math.max(4, ...PERIODS.flatMap((period) => SITES.map((site) => value(site.id, period))))
  return (
    <Card>
      <CardHeader>
        <CardTitle>분기별 확정 핫스팟</CardTitle>
        <CardDescription>1~3분기는 시연용 예시 기록입니다.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div
          role="group"
          aria-label="분기별 현장별 확정 핫스팟 막대 그래프"
          className="grid h-44 grid-cols-4 items-end gap-3 border-b pb-1"
        >
          {PERIODS.map((period) => (
            <div key={period} className="flex h-full min-w-0 items-end justify-center gap-0.5 sm:gap-1">
              {SITES.map((site) => {
                const count = value(site.id, period)
                return (
                  <div
                    key={site.id}
                    role="img"
                    aria-label={`${site.name} ${periodLabel(period)} 확정 핫스팟 ${count}장`}
                    title={`${site.name} ${periodLabel(period)}: ${count}장`}
                    className={cn(
                      "min-w-0 max-w-3.5 flex-1 rounded-t-sm",
                      SITE_COLOR[site.id],
                      period !== CURRENT_PERIOD && "opacity-60"
                    )}
                    style={{ height: `${Math.max(3, (count / max) * 100)}%` }}
                  />
                )
              })}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-3 text-center text-xs text-muted-foreground">
          {PERIODS.map((period) => (
            <span
              key={period}
              className={cn("tabular", period === CURRENT_PERIOD && "font-medium text-foreground")}
            >
              {quarterShort(period)}
            </span>
          ))}
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="범례">
          {SITES.map((site) => (
            <li key={site.id} className="flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-sm", SITE_COLOR[site.id])} aria-hidden="true" />
              {site.name}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

type HistoryRow = {
  key: string
  ym: string
  site: SiteId
  photos: number
  confirmed: number
  savedAt: string
  status?: SiteStatus
}

function historyRows(stats: Record<SiteId, SiteStat>): HistoryRow[] {
  const current = SITES.map((site) => {
    const { summary, inspection, status } = stats[site.id]
    return {
      key: `${site.id}-${CURRENT_PERIOD}`,
      ym: CURRENT_PERIOD,
      site: site.id,
      photos: summary.total,
      confirmed: summary.confirmed.length,
      savedAt: inspection.savedAt?.slice(0, 10) ?? "-",
      status,
    }
  })
  const past = [...HISTORY]
    .sort((a, b) => b.ym.localeCompare(a.ym) || a.site.localeCompare(b.site))
    .map((entry) => ({
      key: `${entry.site}-${entry.ym}`,
      ym: entry.ym,
      site: entry.site,
      photos: entry.photos,
      confirmed: entry.confirmed,
      savedAt: entry.savedAt,
    }))
  return [...current, ...past]
}

function RowBadge({ row }: { row: HistoryRow }) {
  return row.status ? (
    <SiteStatusBadge status={row.status} />
  ) : (
    <Badge variant="secondary">시연용 예시</Badge>
  )
}

function History({ stats }: { stats: Record<SiteId, SiteStat> }) {
  const rows = historyRows(stats)
  const groups = rows.reduce<{ ym: string; rows: HistoryRow[] }[]>((acc, row) => {
    const last = acc[acc.length - 1]
    if (last?.ym === row.ym) last.rows.push(row)
    else acc.push({ ym: row.ym, rows: [row] })
    return acc
  }, [])
  return (
    <Card>
      <CardHeader>
        <CardTitle>분기별 점검 이력</CardTitle>
        <CardDescription>기록표는 설치장소마다 4년간 보존합니다(직무고시 제6조).</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <div className="sm:hidden">
          {groups.map((group) => (
            <div key={group.ym} className="border-t first:border-t-0">
              <p className="px-4 pt-3 pb-1 text-xs font-medium text-muted-foreground">
                {periodLabel(group.ym)}
              </p>
              <ul className="divide-y">
                {group.rows.map((row) => (
                  <li key={row.key} className="flex items-center gap-3 px-4 py-2.5">
                    <span
                      className={cn("size-2.5 shrink-0 rounded-full", SITE_COLOR[row.site])}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{siteById(row.site).name}</p>
                      <p className="tabular text-xs text-muted-foreground">
                        열화상 {row.photos}장 · 확정 핫스팟 {row.confirmed}장
                      </p>
                    </div>
                    <RowBadge row={row} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="hidden sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">점검 분기</TableHead>
                <TableHead>현장</TableHead>
                <TableHead className="text-right">열화상</TableHead>
                <TableHead className="text-right">확정 핫스팟</TableHead>
                <TableHead>저장일</TableHead>
                <TableHead className="pr-4">상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className={cn("tabular pl-4", row.status && "font-medium")}>
                    {periodLabel(row.ym)}
                  </TableCell>
                  <TableCell>{siteById(row.site).name}</TableCell>
                  <TableCell className="tabular text-right">{row.photos}</TableCell>
                  <TableCell className="tabular text-right">{row.confirmed}</TableCell>
                  <TableCell className="tabular">{row.savedAt}</TableCell>
                  <TableCell className="pr-4">
                    <RowBadge row={row} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

export function DashboardPage({ stats }: { stats: Record<SiteId, SiteStat> }) {
  const all = SITES.map((site) => stats[site.id])
  const judged = all.reduce((sum, stat) => sum + stat.summary.judged, 0)
  const waiting = all.reduce((sum, stat) => sum + stat.summary.pendingReview, 0)
  const confirmed = all.reduce((sum, stat) => sum + stat.summary.confirmed.length, 0)
  const saved = all.filter((stat) => stat.status === "saved").length
  const next = SITES.find((site) => stats[site.id].status !== "saved")

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="dashboard-summary"
        className="flex flex-col gap-4 rounded-2xl bg-linear-to-br from-primary to-[oklch(0.45_0.17_285)] p-5 text-primary-foreground lg:flex-row lg:items-end lg:justify-between lg:p-6 dark:from-[oklch(0.3_0_0)] dark:to-[oklch(0.22_0_0)] dark:text-foreground"
      >
        <div>
          <p className="text-sm opacity-80">{quarterOf(CURRENT_PERIOD)} 정기점검</p>
          <h2 id="dashboard-summary" className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
            담당 현장 {SITES.length}곳 중 {saved}곳 기록 완료
          </h2>
          <p className="mt-1 text-sm opacity-80">
            AI가 고른 우선 확인 사진 {waiting}장이 점검자 확인을 기다립니다.
          </p>
        </div>
        {next && (
          <Button
            size="lg"
            nativeButton={false}
            className="h-11 w-full bg-solar text-base text-[oklch(0.22_0.05_262)] hover:bg-solar/90 dark:text-[oklch(0.18_0_0)] lg:h-9 lg:w-auto lg:text-sm"
            render={
              <a
                href={hrefOf({
                  page: stats[next.id].status === "record" ? "record" : "review",
                  site: next.id,
                })}
              />
            }
          >
            {next.name} 이어서 점검
            <ArrowRightIcon />
          </Button>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={<ImagesIcon />}
          tone="bg-info/15 text-info"
          label="AI 판정 열화상"
          value={`${judged}장`}
          hint="AIStream 신재생 결함진단 서빙"
        />
        <Kpi
          icon={<ScanEyeIcon />}
          tone="bg-warning/20 text-[oklch(0.55_0.14_60)] dark:text-warning"
          label="확인 대기"
          value={`${waiting}장`}
          hint="면적 합 100px² 이상 사진"
        />
        <Kpi
          icon={<FlameIcon />}
          tone="bg-destructive/12 text-destructive"
          label="확정 핫스팟"
          value={`${confirmed}장`}
          hint="점검자가 확정한 사진"
        />
        <Kpi
          icon={<CheckCircle2Icon />}
          tone="bg-success/15 text-success"
          label="기록표 저장"
          value={`${saved} / ${SITES.length}`}
          hint="별지 제9호 점검기록표"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {SITES.map((site) => (
          <SiteCard key={site.id} site={site} stat={stats[site.id]} />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] xl:items-start">
        <TrendChart stats={stats} />
        <History stats={stats} />
      </div>
    </div>
  )
}

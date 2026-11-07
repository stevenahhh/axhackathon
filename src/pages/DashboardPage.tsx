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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CURRENT_YM, HISTORY, SITES } from "@/data/sites"
import type { Summary } from "@/lib/inspection"
import { hrefOf } from "@/lib/route"
import { cn } from "@/lib/utils"
import type { Inspection, SiteId } from "@/types"

export type SiteStat = { summary: Summary; inspection: Inspection; status: SiteStatus }

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
      <CardContent className="flex items-start gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5", tone)}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="tabular text-2xl font-semibold tracking-tight">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
  )
}

const MONTHS = ["2026-08", "2026-09", "2026-10", CURRENT_YM]
const SITE_COLOR: Record<SiteId, string> = { A: "bg-chart-1", B: "bg-chart-2", C: "bg-chart-3" }

function TrendChart({ stats }: { stats: Record<SiteId, SiteStat> }) {
  const value = (site: SiteId, ym: string) =>
    ym === CURRENT_YM
      ? stats[site].summary.confirmed.length
      : (HISTORY.find((entry) => entry.site === site && entry.ym === ym)?.confirmed ?? 0)
  const max = Math.max(4, ...MONTHS.flatMap((ym) => SITES.map((site) => value(site.id, ym))))
  return (
    <Card>
      <CardHeader>
        <CardTitle>월별 확정 핫스팟</CardTitle>
        <CardDescription>8~10월은 시연용 예시 기록입니다.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid h-44 grid-cols-4 items-end gap-3 border-b pb-1">
          {MONTHS.map((ym) => (
            <div key={ym} className="flex h-full items-end justify-center gap-1">
              {SITES.map((site) => {
                const count = value(site.id, ym)
                return (
                  <div
                    key={site.id}
                    title={`${site.name} ${ym}: ${count}장`}
                    className={cn("w-3.5 rounded-t-sm", SITE_COLOR[site.id], ym !== CURRENT_YM && "opacity-60")}
                    style={{ height: `${Math.max(3, (count / max) * 100)}%` }}
                  />
                )
              })}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-3 text-center text-xs text-muted-foreground">
          {MONTHS.map((ym) => (
            <span key={ym} className={cn(ym === CURRENT_YM && "font-medium text-foreground")}>
              {Number(ym.slice(5))}월
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {SITES.map((site) => (
            <span key={site.id} className="flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-sm", SITE_COLOR[site.id])} />
              {site.name}
            </span>
          ))}
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
      <section className="flex flex-col gap-4 rounded-2xl bg-linear-to-br from-primary to-[oklch(0.45_0.17_285)] p-5 text-primary-foreground sm:flex-row sm:items-end sm:justify-between lg:p-6 dark:from-[oklch(0.35_0.12_262)] dark:to-[oklch(0.3_0.1_290)] dark:text-foreground">
        <div>
          <p className="text-sm opacity-80">11월 월차 점검</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">
            담당 현장 {SITES.length}곳 중 {saved}곳 기록 완료
          </h2>
          <p className="mt-1 text-sm opacity-80">
            AI가 고른 우선 확인 사진 {waiting}장이 점검자 확인을 기다립니다.
          </p>
        </div>
        {next && (
          <Button
            size="lg"
            className="bg-solar text-[oklch(0.22_0.05_262)] hover:bg-solar/90"
            render={<a href={hrefOf({ page: stats[next.id].status === "record" ? "record" : "review", site: next.id })} />}
          >
            {next.name} 이어서 점검
            <ArrowRightIcon />
          </Button>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={<ImagesIcon />} tone="bg-info/15 text-info" label="AI 판정 열화상" value={`${judged}장`} hint="AIStream 신재생 결함진단 서빙" />
        <Kpi icon={<ScanEyeIcon />} tone="bg-warning/20 text-[oklch(0.55_0.14_60)] dark:text-warning" label="확인 대기" value={`${waiting}장`} hint="면적 합 100px² 이상 사진" />
        <Kpi icon={<FlameIcon />} tone="bg-destructive/12 text-destructive" label="확정 핫스팟" value={`${confirmed}장`} hint="점검자가 확정한 사진" />
        <Kpi icon={<CheckCircle2Icon />} tone="bg-success/15 text-success" label="기록표 저장" value={`${saved} / ${SITES.length}`} hint="별지 제9호 점검기록표" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
          {SITES.map((site) => {
            const { summary, status } = stats[site.id]
            const progress = summary.priority ? Math.round((summary.handled / summary.priority) * 100) : 100
            return (
              <Card key={site.id} className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className={cn("size-2.5 rounded-full", SITE_COLOR[site.id])} />
                    {site.name}
                  </CardTitle>
                  <CardDescription>
                    {site.region} · {site.capacityKw}kW
                  </CardDescription>
                  <div className="col-start-2 row-span-2 row-start-1 self-start">
                    <SiteStatusBadge status={status} />
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      ["판정", summary.judged],
                      ["후보", summary.flagged],
                      ["확정", summary.confirmed.length],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg bg-muted px-2 py-1.5">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="tabular font-semibold">{value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>우선 확인 진행</span>
                      <span className="tabular">
                        {summary.handled}/{summary.priority}
                      </span>
                    </div>
                    <Progress value={progress} />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" render={<a href={hrefOf({ page: "review", site: site.id })} />}>
                      사진 확인
                    </Button>
                    <Button variant="secondary" size="sm" className="flex-1" render={<a href={hrefOf({ page: "record", site: site.id })} />}>
                      기록표
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
        <TrendChart stats={stats} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>월별 점검 이력</CardTitle>
          <CardDescription>기록표는 설치장소마다 4년간 보존합니다(직무고시 제6조).</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">점검월</TableHead>
                <TableHead>현장</TableHead>
                <TableHead className="text-right">열화상</TableHead>
                <TableHead className="text-right">확정 핫스팟</TableHead>
                <TableHead className="hidden sm:table-cell">저장일</TableHead>
                <TableHead className="pr-4">상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SITES.map((site) => {
                const stat = stats[site.id]
                return (
                  <TableRow key={`${site.id}-now`}>
                    <TableCell className="pl-4 font-medium">2026년 11월</TableCell>
                    <TableCell>{site.name}</TableCell>
                    <TableCell className="tabular text-right">{stat.summary.total}</TableCell>
                    <TableCell className="tabular text-right">{stat.summary.confirmed.length}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {stat.inspection.savedAt?.slice(0, 10) ?? "-"}
                    </TableCell>
                    <TableCell className="pr-4">
                      <SiteStatusBadge status={stat.status} />
                    </TableCell>
                  </TableRow>
                )
              })}
              {[...HISTORY]
                .sort((a, b) => b.ym.localeCompare(a.ym) || a.site.localeCompare(b.site))
                .map((entry) => (
                  <TableRow key={`${entry.site}-${entry.ym}`}>
                    <TableCell className="pl-4">
                      {entry.ym.slice(0, 4)}년 {Number(entry.ym.slice(5))}월
                    </TableCell>
                    <TableCell>{SITES.find((site) => site.id === entry.site)?.name}</TableCell>
                    <TableCell className="tabular text-right">{entry.photos}</TableCell>
                    <TableCell className="tabular text-right">{entry.confirmed}</TableCell>
                    <TableCell className="hidden sm:table-cell">{entry.savedAt}</TableCell>
                    <TableCell className="pr-4">
                      <Badge variant="secondary">시연용 예시</Badge>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

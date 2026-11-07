import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react"

import { SITE_DOT, SiteStatusBadge, siteStatusLabel, type SiteStatus } from "@/components/StatusBadges"
import { Card, CardContent } from "@/components/ui/card"
import { SITES, formatCapacity, formatKv, shortName, siteById } from "@/data/sites"
import { hrefOf, type Route } from "@/lib/route"
import { cn } from "@/lib/utils"
import type { SiteId } from "@/types"

type Page = Exclude<Route["page"], "dashboard">

export type SiteChip = { status: SiteStatus; note: string }

// 방향키로 현장을 바꾸면 페이지가 현장별 key로 다시 마운트되므로, 마운트 뒤 선택한 칩에 초점을 되돌린다.
let refocus = false

export function SitePicker({ page, site, chips }: { page: Page; site: SiteId; chips: Record<SiteId, SiteChip> }) {
  const selectedRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    const el = selectedRef.current
    if (!el) return
    el.scrollIntoView({ block: "nearest", inline: "nearest" })
    if (refocus) {
      refocus = false
      el.focus({ preventScroll: true })
    }
  }, [site])

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = SITES.findIndex((item) => item.id === site)
    const last = SITES.length - 1
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % SITES.length
        : event.key === "ArrowLeft"
          ? (index + last) % SITES.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : -1
    if (next < 0) return
    event.preventDefault()
    if (next === index) return
    refocus = true
    window.location.hash = hrefOf({ page, site: SITES[next].id })
  }

  return (
    <div
      role="tablist"
      aria-label="현장 선택"
      onKeyDown={onKeyDown}
      className="-mx-4 -my-1 flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-px-4 px-4 py-1 [scrollbar-width:none] [mask-image:linear-gradient(to_right,transparent,#000_1rem,#000_calc(100%_-_1rem),transparent)] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:[mask-image:none]"
    >
      {SITES.map((item) => {
        const selected = item.id === site
        const { status, note } = chips[item.id]
        return (
          <a
            key={item.id}
            ref={selected ? selectedRef : undefined}
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            href={hrefOf({ page, site: item.id })}
            data-site={item.id}
            className={cn(
              "inline-flex h-11 shrink-0 snap-start items-center gap-2 rounded-lg border px-3 text-sm whitespace-nowrap transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:bg-muted dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
            )}
          >
            <span
              aria-hidden="true"
              className={cn("size-2 shrink-0 rounded-full", SITE_DOT[status], selected && "ring-2 ring-primary-foreground/50")}
            />
            <span className="sr-only">{siteStatusLabel(status)}</span>
            <span className="font-medium">{shortName(item)}</span>
            <span className={selected ? undefined : "text-muted-foreground"}>{formatCapacity(item.capacityKw)}</span>
            <span className={cn("tabular text-xs", !selected && "text-muted-foreground")}>· {note}</span>
          </a>
        )
      })}
    </div>
  )
}

export function SiteSummaryCard({
  site,
  status,
  children,
}: {
  site: SiteId
  status: SiteStatus
  children?: ReactNode
}) {
  const info = siteById(site)
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="truncate text-base font-semibold">{info.name}</h2>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span className="tabular">
              {info.region} · {formatCapacity(info.capacityKw)} · {formatKv(info.voltageV)}
            </span>
            <SiteStatusBadge status={status} />
          </div>
        </div>
        {children && <div className="flex gap-2 sm:shrink-0">{children}</div>}
      </CardContent>
    </Card>
  )
}

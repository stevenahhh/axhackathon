import { useState, useSyncExternalStore, type ReactNode } from "react"
import {
  ClipboardListIcon,
  LayoutDashboardIcon,
  MoonIcon,
  ScanSearchIcon,
  SunIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { SITES } from "@/data/sites"
import { hrefOf, type Route } from "@/lib/route"
import { cn } from "@/lib/utils"
import type { SiteId } from "@/types"

const DESKTOP_QUERY = "(min-width: 1024px)"

// CSS로 숨기면 숨은 사이드바 nav가 DOM에 남아 44px 터치 대상 검사에 걸리므로 렌더링 자체를 나눈다.
function useIsDesktop() {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(DESKTOP_QUERY)
      query.addEventListener("change", notify)
      return () => query.removeEventListener("change", notify)
    },
    () => window.matchMedia(DESKTOP_QUERY).matches
  )
}

type Page = Route["page"]

const PAGES: { page: Page; label: string; icon: ReactNode }[] = [
  { page: "dashboard", label: "대시보드", icon: <LayoutDashboardIcon /> },
  { page: "review", label: "사진 확인", icon: <ScanSearchIcon /> },
  { page: "record", label: "기록표", icon: <ClipboardListIcon /> },
]

const routeOf = (page: Page, site: SiteId): Route =>
  page === "dashboard" ? { page } : page === "review" ? { page, site } : { page, site }

function LogoMark() {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
      <SunIcon className="size-4.5" />
    </span>
  )
}

function SidebarBody({
  route,
  site,
  dots,
}: {
  route: Route
  site: SiteId
  dots: Record<SiteId, string>
}) {
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center gap-2.5">
        <LogoMark />
        <div className="leading-tight">
          <p className="text-sm font-semibold text-sidebar-accent-foreground">썬텍 점검비서</p>
          <p className="text-xs text-sidebar-foreground/70">태양광 월차 점검 기록</p>
        </div>
      </div>
      <nav className="flex flex-col gap-1" aria-label="주 메뉴">
        {PAGES.map(({ page, label, icon }) => {
          const active = route.page === page
          return (
            <a
              key={page}
              href={hrefOf(routeOf(page, site))}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm text-sidebar-foreground transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring [&_svg]:size-4",
                active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
              )}
            >
              {icon}
              {label}
            </a>
          )
        })}
      </nav>
      <div className="flex flex-col gap-1">
        <p className="px-2.5 text-xs font-medium text-sidebar-foreground/60">담당 현장</p>
        {SITES.map((item) => (
          <a
            key={item.id}
            href={hrefOf({ page: route.page === "record" ? "record" : "review", site: item.id })}
            className={cn(
              "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm text-sidebar-foreground outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              route.page !== "dashboard" && route.site === item.id && "text-sidebar-accent-foreground"
            )}
          >
            <span className={cn("size-2 rounded-full", dots[item.id])} />
            <span className="truncate">{item.name}</span>
            <span className="ml-auto text-xs text-sidebar-foreground/60">{item.region}</span>
          </a>
        ))}
      </div>
      <p className="mt-auto text-xs leading-5 text-sidebar-foreground/60">
        판정 AIStream · 문장 AgentStream
        <br />
        최종 판정과 서명은 점검자가 합니다.
      </p>
    </div>
  )
}

function TabBar({ route, site }: { route: Route; site: SiteId }) {
  return (
    <nav
      aria-label="주 메뉴"
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid h-14 grid-cols-3">
        {PAGES.map(({ page, label, icon }) => {
          const active = route.page === page
          return (
            <a
              key={page}
              href={hrefOf(routeOf(page, site))}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&_svg]:size-5",
                active && "text-primary"
              )}
            >
              {icon}
              {label}
            </a>
          )
        })}
      </div>
    </nav>
  )
}

export function AppShell({
  route,
  title,
  dots,
  notice,
  children,
}: {
  route: Route
  title: string
  dots: Record<SiteId, string>
  notice?: ReactNode
  children: ReactNode
}) {
  const isDesktop = useIsDesktop()
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"))
  const site = route.page === "dashboard" ? "A" : route.site

  function toggleTheme() {
    document.documentElement.classList.toggle("dark", !dark)
    setDark(!dark)
  }

  return (
    <div className="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      {isDesktop && (
        <aside className="sticky top-0 h-dvh bg-sidebar">
          <SidebarBody route={route} site={site} dots={dots} />
        </aside>
      )}
      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b bg-background">
          <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 lg:px-8">
            {!isDesktop && <LogoMark />}
            <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h1>
            <span className="hidden shrink-0 rounded-full bg-solar/20 px-2.5 py-1 text-xs font-medium sm:inline">
              2026년 11월 월차 점검
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 lg:size-8"
              aria-label={dark ? "밝은 테마로 전환" : "어두운 테마로 전환"}
              onClick={toggleTheme}
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </Button>
          </div>
        </header>
        {notice && (
          <div role="status" className="border-b bg-warning/15">
            <div className="mx-auto flex max-w-[1400px] items-center gap-2 px-4 py-2.5 text-sm lg:px-8">
              <TriangleAlertIcon className="size-4 shrink-0 text-[oklch(0.5_0.13_60)] dark:text-warning" />
              <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2">{notice}</p>
            </div>
          </div>
        )}
        <main className="mx-auto max-w-[1400px] p-4 pb-[calc(4.5rem_+_env(safe-area-inset-bottom))] lg:p-8">
          {children}
        </main>
      </div>
      {!isDesktop && <TabBar route={route} site={site} />}
    </div>
  )
}

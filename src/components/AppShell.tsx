import { useState, type ReactNode } from "react"
import {
  ClipboardListIcon,
  LayoutDashboardIcon,
  MenuIcon,
  MoonIcon,
  ScanSearchIcon,
  SunIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { SITES } from "@/data/sites"
import { hrefOf, type Route } from "@/lib/route"
import { cn } from "@/lib/utils"
import type { SiteId } from "@/types"

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
        <SunIcon className="size-4.5" />
      </span>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-sidebar-accent-foreground">썬텍 점검비서</p>
        <p className="text-xs text-sidebar-foreground/70">태양광 월차 점검 기록</p>
      </div>
    </div>
  )
}

function NavLink({
  href,
  active,
  icon,
  children,
  onNavigate,
}: {
  href: string
  active: boolean
  icon: ReactNode
  children: ReactNode
  onNavigate?: () => void
}) {
  return (
    <a
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm text-sidebar-foreground transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring [&_svg]:size-4",
        active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
      )}
    >
      {icon}
      {children}
    </a>
  )
}

function SidebarBody({
  route,
  dots,
  onNavigate,
}: {
  route: Route
  dots: Record<SiteId, string>
  onNavigate?: () => void
}) {
  const site = route.page === "dashboard" ? "A" : route.site
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Logo />
      <nav className="flex flex-col gap-1" aria-label="주 메뉴">
        <NavLink href="#/" active={route.page === "dashboard"} icon={<LayoutDashboardIcon />} onNavigate={onNavigate}>
          대시보드
        </NavLink>
        <NavLink
          href={hrefOf({ page: "review", site })}
          active={route.page === "review"}
          icon={<ScanSearchIcon />}
          onNavigate={onNavigate}
        >
          열화상 확인
        </NavLink>
        <NavLink
          href={hrefOf({ page: "record", site })}
          active={route.page === "record"}
          icon={<ClipboardListIcon />}
          onNavigate={onNavigate}
        >
          기록표 작성
        </NavLink>
      </nav>
      <div className="flex flex-col gap-1">
        <p className="px-2.5 text-xs font-medium text-sidebar-foreground/60">담당 현장</p>
        {SITES.map((item) => (
          <a
            key={item.id}
            href={hrefOf({ page: route.page === "record" ? "record" : "review", site: item.id })}
            onClick={onNavigate}
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

export function AppShell({
  route,
  title,
  dots,
  children,
}: {
  route: Route
  title: string
  dots: Record<SiteId, string>
  children: ReactNode
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"))

  function toggleTheme() {
    document.documentElement.classList.toggle("dark", !dark)
    setDark(!dark)
  }

  return (
    <div className="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh bg-sidebar lg:block">
        <SidebarBody route={route} dots={dots} />
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-2 px-4 lg:px-8">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="메뉴 열기"
              onClick={() => setMenuOpen(true)}
            >
              <MenuIcon />
            </Button>
            <h1 className="truncate text-base font-semibold">{title}</h1>
            <span className="ml-auto hidden rounded-full bg-solar/20 px-2.5 py-1 text-xs font-medium text-foreground sm:inline">
              2026년 11월 월차 점검
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={dark ? "밝은 테마로 전환" : "어두운 테마로 전환"}
              onClick={toggleTheme}
              className="ml-auto sm:ml-0"
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </Button>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] p-4 lg:p-8">{children}</main>
      </div>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
          <SheetTitle className="sr-only">메뉴</SheetTitle>
          <SidebarBody route={route} dots={dots} onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  )
}

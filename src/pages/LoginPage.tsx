import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react"
import { SunIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { settleSignIn, signIn } from "@/lib/session"
import { cn } from "@/lib/utils"

const GUEST = { id: "guest", pw: "guest" }

// 로그인 성공 직후의 전환. 앱 셸이 밑에 그려진 상태에서 이 화면(로고와 같은 호박색)을 원으로 오려 내고,
// 그 원을 셸의 로고 마크(data-slot="brand-mark") 자리와 크기까지 줄여 로고 위에 정확히 내려앉게 한다.
// 로고 자리는 셸이 마운트된 뒤 getBoundingClientRect로 잰다. 끝나면 settleSignIn()이 이 화면을 치운다.
// 움직임을 줄이는 설정이면 전환 없이 바로 치운다.
function useReveal(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return
    const surface = ref.current
    const mark = document.querySelector<HTMLElement>('[data-slot="brand-mark"]')
    if (!surface || !mark || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      settleSignIn()
      return
    }
    const { innerWidth: width, innerHeight: height } = window
    const target = mark.getBoundingClientRect()
    // 시작 원은 화면 가운데에서 네 모서리까지 닿는 반지름이라 첫 프레임이 전체 화면과 같다.
    surface.style.clipPath = `circle(${Math.hypot(width, height) / 2}px at ${width / 2}px ${height / 2}px)`
    void surface.offsetWidth
    const frame = requestAnimationFrame(() => {
      surface.classList.add("motion-reveal")
      surface.style.clipPath = `circle(${target.width / 2}px at ${target.left + target.width / 2}px ${
        target.top + target.height / 2
      }px)`
    })
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      settleSignIn()
    }
    // 카드 페이드와 버튼 비활성 전환의 transitionend도 여기까지 버블링하므로, 이 면의 clip-path 전환이 끝났을 때만 마친다.
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target === surface && event.propertyName === "clip-path") done()
    }
    surface.addEventListener("transitionend", onTransitionEnd)
    // transitionend가 오지 않는 경우(탭 숨김 등)에도 화면이 남지 않게 한다.
    const timer = window.setTimeout(done, 600)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
      surface.removeEventListener("transitionend", onTransitionEnd)
    }
  }, [ref, active])
}

// revealing: 로그인이 끝나 앱 셸 위에서 전환을 그리는 중. 입력은 받지 않고 카드는 사라진다.
export function LoginPage({ revealing = false }: { revealing?: boolean }) {
  const surfaceRef = useRef<HTMLElement>(null)
  const [id, setId] = useState("")
  const [pw, setPw] = useState("")
  const [busy, setBusy] = useState<"form" | "guest" | null>(null)
  useReveal(surfaceRef, revealing)

  async function submit(account: { id: string; pw: string }, source: "form" | "guest") {
    setBusy(source)
    try {
      await signIn(account.id, account.pw)
    } catch (error) {
      toast.error("로그인하지 못했습니다", {
        id: "login-failed",
        description: error instanceof Error ? error.message : String(error),
      })
      setBusy(null)
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submit({ id: id.trim(), pw }, "form")
  }

  return (
    <main
      ref={surfaceRef}
      data-slot="login"
      aria-hidden={revealing || undefined}
      inert={revealing || undefined}
      className={cn(
        "grid min-h-dvh place-items-center bg-sidebar-primary px-4 py-10 text-sidebar-primary-foreground",
        revealing && "fixed inset-0 z-50 min-h-0 overflow-hidden"
      )}
    >
      <Card
        className={cn(
          "w-full max-w-sm gap-8 px-6 py-8 transition-opacity duration-150 motion-reduce:transition-none",
          revealing && "opacity-0"
        )}
      >
        <div className="flex flex-col items-center gap-3">
          <span
            data-slot="login-mark"
            className="grid size-12 place-items-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground"
          >
            <SunIcon className="size-6" />
          </span>
          <div className="flex flex-col items-center gap-1">
            <h1 className="text-[1.3125rem] leading-tight font-semibold tracking-tight">SunSET</h1>
            <p className="text-sm text-muted-foreground">태양광 정기점검 기록 에이전트</p>
          </div>
        </div>

        <form className="flex flex-col gap-4" onSubmit={onSubmit} aria-label="로그인">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            아이디
            <Input
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={id}
              onChange={(event) => setId(event.target.value)}
              className="h-11 font-normal"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            비밀번호
            <Input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={pw}
              onChange={(event) => setPw(event.target.value)}
              className="h-11 font-normal"
            />
          </label>
          <Button type="submit" className="mt-2 h-11" disabled={busy !== null}>
            {busy === "form" ? "로그인하는 중" : "로그인"}
          </Button>
        </form>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
            <span className="h-px flex-1 bg-border" />
            또는
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button
            variant="outline"
            className="h-11"
            disabled={busy !== null}
            onClick={() => void submit(GUEST, "guest")}
          >
            {busy === "guest" ? "시작하는 중" : "게스트로 시작"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">체험 계정: guest / guest · test1~test3 / 1234</p>
        </div>
      </Card>
    </main>
  )
}

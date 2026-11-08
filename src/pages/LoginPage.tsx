import { useState, type FormEvent } from "react"
import { SunIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { signIn } from "@/lib/session"

const GUEST = { id: "guest", pw: "guest" }

export function LoginPage() {
  const [id, setId] = useState("")
  const [pw, setPw] = useState("")
  const [busy, setBusy] = useState<"form" | "guest" | null>(null)

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
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10 text-foreground">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col items-center gap-3">
          <span className="grid size-12 place-items-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground">
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
      </div>
    </main>
  )
}

import { useSyncExternalStore } from "react"
import { toast } from "sonner"

import { setStoreUser } from "@/lib/store"

// 로그인 상태. 서버가 HttpOnly 쿠키(sunset_session)로 세션을 들고 있어 브라우저는 /api/me로만 확인한다.
// fresh는 이 탭에서 방금 로그인했다는 뜻이다. 그동안 로그인 화면이 남아 앱 셸 위에서 로고로 모이는 전환을 그리고, 끝나면 settleSignIn()으로 끈다.
export type Session = { status: "loading" } | { status: "out" } | { status: "in"; id: string; fresh: boolean }

let session: Session = { status: "loading" }
const listeners = new Set<() => void>()

function set(next: Session) {
  if (next.status === "in") setStoreUser(next.id)
  session = next
  listeners.forEach((notify) => notify())
}

export function useSession() {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => listeners.delete(notify)
    },
    () => session
  )
}

export async function checkSession() {
  try {
    const response = await fetch("./api/me")
    const data = response.ok ? ((await response.json()) as { id: string }) : null
    set(data ? { status: "in", id: data.id, fresh: false } : { status: "out" })
  } catch {
    set({ status: "out" })
  }
}

export async function signIn(id: string, pw: string) {
  const response = await fetch("./api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, pw }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`)
  set({ status: "in", id: data.id, fresh: true })
}

// 로그인 화면이 전환을 마치고 자신을 치울 때 부른다.
export function settleSignIn() {
  if (session.status === "in" && session.fresh) set({ ...session, fresh: false })
}

export async function signOut() {
  await fetch("./api/logout", { method: "POST" }).catch(() => null)
  set({ status: "out" })
}

// 쓰는 도중 API가 401을 주면(세션 만료, 서버 재시작) 로그인 화면으로 돌려보낸다.
export function sessionExpired() {
  if (session.status !== "in") return
  set({ status: "out" })
  toast.warning("로그인이 필요합니다", { id: "session-expired", description: "다시 로그인해 주세요." })
}

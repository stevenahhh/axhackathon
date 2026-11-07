import { useSyncExternalStore } from "react"

const DESKTOP_QUERY = "(min-width: 1024px)"

// 사이드바·탭바·토스트 위치는 CSS로 숨기지 않고 렌더링 자체를 나눈다(숨은 nav가 44px 터치 대상 검사에 걸린다).
export function useIsDesktop() {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(DESKTOP_QUERY)
      query.addEventListener("change", notify)
      return () => query.removeEventListener("change", notify)
    },
    () => window.matchMedia(DESKTOP_QUERY).matches
  )
}

// 테마는 <html class="dark">로 켜고 끈다(main.tsx, AppShell의 전환 버튼). 클래스 변화를 지켜본다.
export function useIsDark() {
  return useSyncExternalStore(
    (notify) => {
      const observer = new MutationObserver(notify)
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
      return () => observer.disconnect()
    },
    () => document.documentElement.classList.contains("dark")
  )
}

import { useSyncExternalStore } from "react"

import type { SiteId } from "@/types"

export type Route =
  | { page: "dashboard" }
  | { page: "review"; site: SiteId }
  | { page: "record"; site: SiteId }

function parse(hash: string): Route {
  const [, page, site] = hash.replace(/^#/, "").split("/")
  const id = (["A", "B", "C", "D", "E"].includes(site) ? site : "A") as SiteId
  if (page === "review") return { page: "review", site: id }
  if (page === "record") return { page: "record", site: id }
  return { page: "dashboard" }
}

export const hrefOf = (route: Route) =>
  route.page === "dashboard" ? "#/" : `#/${route.page}/${route.site}`

export function useRoute() {
  const hash = useSyncExternalStore(
    (notify) => {
      window.addEventListener("hashchange", notify)
      return () => window.removeEventListener("hashchange", notify)
    },
    () => window.location.hash
  )
  return parse(hash)
}

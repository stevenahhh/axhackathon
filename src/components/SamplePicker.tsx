import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react"
import { Dialog } from "@base-ui/react/dialog"
import {
  ChevronRightIcon,
  FolderIcon,
  HardDriveIcon,
  ImageIcon,
  LayoutGridIcon,
  ListIcon,
  SearchIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SITES } from "@/data/sites"
import { fetchSamples, type Sample } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { SiteId } from "@/types"

type View = "list" | "icons"

type Folder = { site: SiteId; label: string; samples: Sample[] }

const VIEW_KEY = "suntek.samplePicker.view"

// DJI SD 카드의 DCIM 폴더처럼 보이게 비행 날짜와 지역으로 이름을 짓는다.
function folderOf(site: SiteId, samples: Sample[]): Folder {
  const region = SITES.find((item) => item.id === site)?.region ?? site
  const day = samples[0]?.capturedAt.slice(0, 10).replaceAll("-", "") ?? ""
  return { site, label: `DJI_${day}_${region.split(" ").at(-1)}`, samples }
}

function readView(): View {
  return localStorage.getItem(VIEW_KEY) === "icons" ? "icons" : "list"
}

export function SamplePicker({
  open,
  onOpenChange,
  site,
  onUpload,
  onPickFiles,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  site: SiteId
  onUpload: (samples: Sample[]) => void
  onPickFiles: () => void
}) {
  const [folders, setFolders] = useState<Folder[]>()
  const [loadError, setLoadError] = useState<string>()
  const [current, setCurrent] = useState<SiteId>(site)
  const [query, setQuery] = useState("")
  const [view, setView] = useState<View>(readView)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const anchor = useRef<string>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setSelected(new Set())
    setQuery("")
    anchor.current = null
    if (folders) return
    fetchSamples()
      .then(({ samples }) => {
        const grouped = new Map<SiteId, Sample[]>()
        for (const sample of samples) {
          const list = grouped.get(sample.site as SiteId) ?? []
          list.push(sample)
          grouped.set(sample.site as SiteId, list)
        }
        const next = SITES.filter((item) => grouped.has(item.id)).map((item) =>
          folderOf(item.id, grouped.get(item.id) ?? [])
        )
        setFolders(next)
        setLoadError(undefined)
      })
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : String(error)))
  }, [open, folders])

  // 현재 현장에 샘플이 없으면(사진이 48장 이하라 모두 실림) 첫 폴더를 연다.
  useEffect(() => {
    if (!open || !folders?.length) return
    setCurrent(folders.some((folder) => folder.site === site) ? site : folders[0].site)
  }, [open, folders, site])

  const folder = folders?.find((item) => item.site === current)
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const all = folder?.samples ?? []
    return needle ? all.filter((sample) => sample.name.toLowerCase().includes(needle) || sample.seq.includes(needle)) : all
  }, [folder, query])
  const chosen = rows.filter((sample) => selected.has(sample.id))

  function choose(value: View) {
    setView(value)
    localStorage.setItem(VIEW_KEY, value)
  }

  function openFolder(next: SiteId) {
    setCurrent(next)
    setSelected(new Set())
    anchor.current = null
  }

  function select(sample: Sample, event: MouseEvent) {
    const multi = event.metaKey || event.ctrlKey
    setSelected((previous) => {
      const next = new Set(multi ? previous : [])
      if (event.shiftKey && anchor.current) {
        const ids = rows.map((row) => row.id)
        const [a, b] = [ids.indexOf(anchor.current), ids.indexOf(sample.id)].sort((x, y) => x - y)
        if (a >= 0) ids.slice(a, b + 1).forEach((id) => next.add(id))
        return next
      }
      if (multi && previous.has(sample.id)) next.delete(sample.id)
      else next.add(sample.id)
      return next
    })
    if (!event.shiftKey) anchor.current = sample.id
  }

  function submit(list = chosen) {
    if (!list.length) return
    onUpload(list)
    onOpenChange(false)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" && chosen.length) {
      event.preventDefault()
      submit()
    } else if (event.key === "a" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      setSelected(new Set(rows.map((row) => row.id)))
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
        <Dialog.Popup
          data-slot="sample-picker"
          onKeyDown={onKeyDown}
          className={cn(
            "fixed inset-2 z-50 flex flex-col overflow-hidden rounded-2xl border bg-popover text-sm text-popover-foreground shadow-2xl outline-none",
            "transition duration-200 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0",
            "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-[min(640px,85dvh)] sm:w-[min(960px,92vw)] sm:-translate-1/2"
          )}
        >
          <header className="flex items-center gap-3 border-b bg-muted/60 px-4 py-2.5">
            <span aria-hidden className="hidden items-center gap-1.5 sm:flex">
              <Dialog.Close
                render={<button type="button" aria-label="닫기" className="size-3 rounded-full bg-[#ff5f57] ring-1 ring-black/15" />}
              />
              <i className="size-3 rounded-full bg-[#febc2e] ring-1 ring-black/15" />
              <i className="size-3 rounded-full bg-[#28c840] ring-1 ring-black/15" />
            </span>
            <div className="min-w-0 flex-1 text-center">
              <Dialog.Title className="truncate font-heading text-sm font-semibold">드론 사진 가져오기</Dialog.Title>
              <Dialog.Description className="sr-only">
                SD 카드의 열화상 사진을 골라 업로드하면 핫스팟 탐지와 융합 판정, 실화상 정렬을 바로 계산합니다.
              </Dialog.Description>
            </div>
            <div className="flex items-center gap-1 rounded-md bg-background/70 p-0.5 ring-1 ring-foreground/10">
              {(
                [
                  ["icons", LayoutGridIcon, "아이콘 보기"],
                  ["list", ListIcon, "목록 보기"],
                ] as const
              ).map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-label={label}
                  aria-pressed={view === value}
                  onClick={() => choose(value)}
                  className="rounded-[5px] p-1.5 text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-foreground/10 aria-pressed:text-foreground"
                >
                  <Icon className="size-4" />
                </button>
              ))}
            </div>
            <label className="relative hidden w-56 sm:block">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="검색"
                aria-label="파일 이름 검색"
                className="h-7 rounded-md bg-background/70 pl-7 text-sm"
              />
            </label>
          </header>

          <div className="flex min-h-0 flex-1">
            <nav aria-label="위치" className="hidden w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r bg-muted/40 p-2 sm:flex">
              <p className="px-2 pt-1 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">위치</p>
              <p className="flex items-center gap-2 px-2 py-1 text-sm font-medium">
                <HardDriveIcon className="size-4 text-muted-foreground" />
                M3T SD 카드
              </p>
              {folders?.map((item) => (
                <button
                  key={item.site}
                  type="button"
                  aria-current={item.site === current ? "location" : undefined}
                  onClick={() => openFolder(item.site)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 pl-6 text-left text-sm transition-colors hover:bg-foreground/5 aria-[current]:bg-primary/15 aria-[current]:text-foreground"
                >
                  <FolderIcon className="size-4 shrink-0 fill-sky-400/30 text-sky-500" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <span className="tabular text-xs text-muted-foreground">{item.samples.length}</span>
                </button>
              ))}
            </nav>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-1 overflow-x-auto border-b px-3 py-1.5 text-xs text-muted-foreground">
                <HardDriveIcon className="size-3.5 shrink-0" />
                <span>M3T SD 카드</span>
                <ChevronRightIcon className="size-3 shrink-0" />
                <span>DCIM</span>
                {folder && (
                  <>
                    <ChevronRightIcon className="size-3 shrink-0" />
                    <span className="font-medium text-foreground">{folder.label}</span>
                  </>
                )}
                <span className="ml-auto flex gap-1 sm:hidden">
                  {folders?.map((item) => (
                    <button
                      key={item.site}
                      type="button"
                      aria-current={item.site === current ? "location" : undefined}
                      onClick={() => openFolder(item.site)}
                      className="rounded-full px-2 py-0.5 ring-1 ring-foreground/15 aria-[current]:bg-primary/15 aria-[current]:text-foreground"
                    >
                      {item.label.split("_").at(-1)}
                    </button>
                  ))}
                </span>
              </div>

              <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto" role="listbox" aria-multiselectable aria-label="사진 파일">
                {loadError && <p className="p-6 text-center text-destructive">샘플 목록을 불러오지 못했습니다. {loadError}</p>}
                {!folders && !loadError && <p className="p-6 text-center text-muted-foreground">SD 카드를 읽는 중…</p>}
                {folders && rows.length === 0 && (
                  <p className="p-6 text-center text-muted-foreground">
                    {query ? "검색 결과가 없습니다." : "이 폴더에는 가져올 사진이 없습니다."}
                  </p>
                )}
                {view === "list" ? (
                  <table className="w-full border-separate border-spacing-0 text-sm">
                    <thead className="sticky top-0 z-10 bg-popover text-xs text-muted-foreground">
                      <tr>
                        <th className="border-b px-3 py-1.5 text-left font-medium">이름</th>
                        <th className="hidden border-b px-3 py-1.5 text-left font-medium md:table-cell">촬영 시각</th>
                        <th className="hidden border-b px-3 py-1.5 text-left font-medium md:table-cell">종류</th>
                        <th className="border-b px-3 py-1.5 text-left font-medium">실화상 짝</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((sample, index) => (
                        <tr
                          key={sample.id}
                          role="option"
                          aria-selected={selected.has(sample.id)}
                          onClick={(event) => select(sample, event)}
                          onDoubleClick={() => submit([sample])}
                          className={cn(
                            "cursor-default select-none",
                            index % 2 === 1 && "bg-foreground/[0.025]",
                            "aria-selected:bg-primary aria-selected:text-primary-foreground"
                          )}
                        >
                          <td className="px-3 py-1">
                            <span className="flex items-center gap-2.5">
                              <img
                                src={sample.ir}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                className="h-8 w-10 shrink-0 rounded-[3px] bg-muted object-cover ring-1 ring-black/20"
                              />
                              <span className="truncate font-mono text-[13px]">{sample.name}</span>
                            </span>
                          </td>
                          <td className="tabular hidden px-3 py-1 whitespace-nowrap md:table-cell">{sample.capturedAt}</td>
                          <td className="hidden px-3 py-1 whitespace-nowrap md:table-cell">DJI 열화상 JPEG</td>
                          <td className="px-3 py-1 whitespace-nowrap">
                            {sample.rgb ? (
                              <span className="inline-flex items-center gap-1">
                                <ImageIcon className="size-3.5" />
                                {sample.rgbZoom ? `${sample.rgbZoom}×` : "있음"}
                              </span>
                            ) : (
                              <span className="opacity-60">없음</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="grid grid-cols-3 gap-3 p-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                    {rows.map((sample) => (
                      <button
                        key={sample.id}
                        type="button"
                        role="option"
                        aria-selected={selected.has(sample.id)}
                        onClick={(event) => select(sample, event)}
                        onDoubleClick={() => submit([sample])}
                        className="group flex flex-col items-center gap-1.5 rounded-lg p-2 text-center outline-none select-none aria-selected:bg-primary/15"
                      >
                        <img
                          src={sample.ir}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="aspect-[5/4] w-full rounded-md bg-muted object-cover ring-1 ring-black/20 group-aria-selected:ring-2 group-aria-selected:ring-primary"
                        />
                        <span className="line-clamp-2 w-full rounded px-1 font-mono text-[11px] leading-tight break-all group-aria-selected:bg-primary group-aria-selected:text-primary-foreground">
                          {sample.name}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <footer className="flex items-center gap-3 border-t bg-muted/60 px-4 py-3">
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {chosen.length
                ? `${chosen.length}장 선택 · 실화상 짝 ${chosen.filter((sample) => sample.rgb).length}장`
                : "사진을 고르세요. ⌘ 클릭으로 여러 장, 두 번 클릭으로 바로 업로드합니다."}
            </p>
            <button
              type="button"
              onClick={() => {
                onOpenChange(false)
                onPickFiles()
              }}
              className="hidden text-xs text-muted-foreground underline-offset-2 hover:underline sm:block"
            >
              내 컴퓨터에서 선택…
            </button>
            <Dialog.Close render={<Button variant="outline" className="h-9" />}>취소</Dialog.Close>
            <Button className="h-9 min-w-24" disabled={!chosen.length} onClick={() => submit()}>
              업로드{chosen.length ? ` (${chosen.length})` : ""}
            </Button>
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

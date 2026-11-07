import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import {
  CheckIcon,
  CopyIcon,
  ImageUpIcon,
  ImagesIcon,
  MoonIcon,
  RotateCwIcon,
  SearchIcon,
  SunIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import samples from "@/data/photos.json"

type Box = { bbox: number[]; area: number; severity: number }
type Photo = {
  id: string
  location: string
  datetime: string
  device: string
  model: string
  width: number
  height: number
  boxes: Box[]
  src?: string
  pending?: boolean
  file?: File
  error?: string
  byModel?: boolean
}
type Prediction = {
  width: number
  height: number
  defects: { bbox: number[]; area: number; severity: number }[]
}
type Status = "all" | "defect" | "normal" | "pending"

const DEMO_FILES = [
  "2025_Eumseong_Positive_00001.jpg",
  "2025_Eumseong_Positive_00002.jpg",
  "2025_GyeonggiGwangju_Positive_00001.jpg",
  "2025_Eumseong_Normal_00008.jpg",
]

async function predict(file: File): Promise<Prediction> {
  const body = new FormData()
  body.append("file", file)
  const response = await fetch("./api/predict/solar", { method: "POST", body })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const reason = data?.error ?? data?.detail ?? `HTTP ${response.status}`
    throw new Error(typeof reason === "string" ? reason : JSON.stringify(reason))
  }
  return data as Prediction
}

const SITE_NAMES: Record<string, string> = {
  Eumseong: "음성",
  GyeonggiGwangju: "경기 광주",
  Upload: "업로드",
}
const siteName = (location: string) => SITE_NAMES[location] ?? location
const srcOf = (photo: Photo) =>
  photo.src ?? `./samples/${photo.id}.webp`
const totalArea = (photo: Photo) =>
  photo.boxes.reduce((sum, box) => sum + box.area, 0)
const statusOf = (photo: Photo): Exclude<Status, "all"> =>
  photo.pending || photo.error
    ? "pending"
    : photo.boxes.length
      ? "defect"
      : "normal"

const byPriority = (a: Photo, b: Photo) =>
  Number(b.pending ?? false) - Number(a.pending ?? false) ||
  totalArea(b) - totalArea(a) ||
  a.id.localeCompare(b.id)

const initialPhotos = [...(samples as Photo[])].sort(byPriority)

function useIsDesktop() {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia("(min-width: 1024px)")
      query.addEventListener("change", notify)
      return () => query.removeEventListener("change", notify)
    },
    () => window.matchMedia("(min-width: 1024px)").matches
  )
}

function StatusBadge({ photo }: { photo: Photo }) {
  const status = statusOf(photo)
  if (photo.error) return <Badge variant="outline">분석 실패</Badge>
  if (status === "defect") return <Badge variant="destructive">정비 필요</Badge>
  if (status === "pending") return <Badge variant="outline">분석 대기</Badge>
  return <Badge variant="secondary">정상</Badge>
}

function draftOf(photo: Photo) {
  const severity = Math.max(...photo.boxes.map((box) => box.severity))
  return [
    `점검 일시: ${photo.datetime}`,
    `현장: ${siteName(photo.location)}`,
    `촬영 장비: ${photo.device} 드론 열화상`,
    `모듈: ${photo.model}`,
    `점검 결과: 핫스팟 ${photo.boxes.length}곳, 총 면적 ${totalArea(photo)}px², 심각도 ${severity}`,
    "조치 의견: 해당 모듈을 현장에서 확인한 뒤 교체 여부를 판단합니다.",
  ].join("\n")
}

function Detail({
  photo,
  onRetry,
}: {
  photo: Photo
  onRetry: (photo: Photo) => void
}) {
  const [copied, setCopied] = useState(false)
  const status = statusOf(photo)
  const draft = status === "defect" ? draftOf(photo) : null

  async function copy() {
    if (!draft) return
    await navigator.clipboard.writeText(draft)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-lg bg-muted">
        <img
          src={srcOf(photo)}
          alt={`${photo.id} 열화상`}
          width={photo.width}
          height={photo.height}
          className="block h-auto w-full"
        />
        {photo.boxes.map((box, index) => {
          const [x, y, w, h] = box.bbox
          return (
            <span
              key={index}
              className="absolute min-h-2.5 min-w-2.5 -translate-x-0.5 -translate-y-0.5 rounded-[2px] border-2 border-cyan-300"
              style={{
                left: `${(x / photo.width) * 100}%`,
                top: `${(y / photo.height) * 100}%`,
                width: `${(w / photo.width) * 100}%`,
                height: `${(h / photo.height) * 100}%`,
              }}
            />
          )
        })}
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{photo.id}</h2>
          <p className="text-sm text-muted-foreground">
            {siteName(photo.location)} · {photo.datetime}
          </p>
        </div>
        <StatusBadge photo={photo} />
      </div>

      {photo.pending && (
        <p className="text-sm text-muted-foreground">
          AIStream 서빙 모델이 핫스팟을 찾고 있습니다.
        </p>
      )}
      {photo.error && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-destructive">{photo.error}</p>
          <Button variant="outline" size="sm" onClick={() => onRetry(photo)}>
            <RotateCwIcon />
            다시 분석
          </Button>
        </div>
      )}
      {status === "normal" && (
        <p className="text-sm text-muted-foreground">
          {photo.byModel
            ? "모델이 찾은 핫스팟이 없습니다."
            : "라벨에 핫스팟이 없습니다."}
        </p>
      )}
      {status === "defect" && (
        <p className="text-sm text-muted-foreground">
          {photo.byModel
            ? "AIStream 서빙 모델의 판정입니다."
            : "AI Hub 라벨 값입니다."}
        </p>
      )}
      {draft && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">점검일지 초안</h3>
            <Button variant="ghost" size="sm" onClick={copy} className="w-20">
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? "복사됨" : "복사"}
            </Button>
          </div>
          <pre className="rounded-lg bg-muted p-3 font-sans text-sm leading-6 break-words whitespace-pre-wrap">
            {draft}
          </pre>
        </section>
      )}
    </div>
  )
}

export default function App() {
  const [photos, setPhotos] = useState(initialPhotos)
  const [selectedId, setSelectedId] = useState(initialPhotos[0].id)
  const [status, setStatus] = useState<Status>("all")
  const [site, setSite] = useState("all")
  const [query, setQuery] = useState("")
  const [sheetOpen, setSheetOpen] = useState(false)
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  )
  const [loadingDemo, setLoadingDemo] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const queue = useRef(Promise.resolve())
  const isDesktop = useIsDesktop()

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
  }, [dark])

  const sites = useMemo(
    () => [...new Set(photos.map((photo) => photo.location))],
    [photos]
  )
  const siteItems = [
    { value: "all", label: "전체 현장" },
    ...sites.map((value) => ({ value, label: siteName(value) })),
  ]
  const inSite = photos.filter(
    (photo) => site === "all" || photo.location === site
  )
  const count = (target: Status) =>
    target === "all"
      ? inSite.length
      : inSite.filter((photo) => statusOf(photo) === target).length
  const needle = query.trim().toLowerCase()
  const visible = inSite.filter(
    (photo) =>
      (status === "all" || statusOf(photo) === status) &&
      photo.id.toLowerCase().includes(needle)
  )
  const selected = photos.find((photo) => photo.id === selectedId) ?? photos[0]

  function update(id: string, patch: Partial<Photo>) {
    setPhotos((current) =>
      current.map((photo) => (photo.id === id ? { ...photo, ...patch } : photo))
    )
  }

  // 서빙은 요청을 하나씩 처리하므로 한 장씩 순서대로 보낸다.
  function analyze(photo: Photo) {
    const file = photo.file
    if (!file) return
    update(photo.id, { pending: true, error: undefined })
    queue.current = queue.current.then(async () => {
      try {
        const result = await predict(file)
        update(photo.id, {
          pending: false,
          byModel: true,
          width: result.width,
          height: result.height,
          boxes: result.defects.map(({ bbox, area, severity }) => ({
            bbox,
            area,
            severity,
          })),
        })
      } catch (error) {
        update(photo.id, {
          pending: false,
          error: `분석하지 못했습니다. ${error instanceof Error ? error.message : error}`,
        })
      }
    })
  }

  function uniqueId(name: string, taken: Set<string>) {
    let id = name
    for (let n = 2; taken.has(id); n++) id = `${name} (${n})`
    taken.add(id)
    return id
  }

  async function addDemo() {
    setLoadingDemo(true)
    try {
      const files = await Promise.all(
        DEMO_FILES.map(async (name) => {
          const response = await fetch(`./demo/${name}`)
          if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
          return new File([await response.blob()], name, { type: "image/jpeg" })
        })
      )
      addFiles(files)
    } catch (error) {
      window.alert(`샘플을 불러오지 못했습니다. ${error}`)
    } finally {
      setLoadingDemo(false)
    }
  }

  function addFiles(files: FileList | File[] | null) {
    if (!files?.length) return
    const taken = new Set(photos.map((photo) => photo.id))
    const added: Photo[] = [...files].map((file) => ({
      id: uniqueId(file.name, taken),
      location: "Upload",
      datetime: new Date().toLocaleString("sv-SE"),
      device: "-",
      model: "-",
      width: 640,
      height: 512,
      boxes: [],
      src: URL.createObjectURL(file),
      pending: true,
      file,
    }))
    setPhotos((current) => [...added, ...current])
    added.forEach(analyze)
    setSelectedId(added[0].id)
    setStatus("all")
    setSite("all")
    setQuery("")
    if (!isDesktop) setSheetOpen(true)
  }

  function select(id: string) {
    setSelectedId(id)
    if (!isDesktop) setSheetOpen(true)
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-3 px-4 lg:px-6">
          <h1 className="truncate text-base font-semibold">
            썬텍 태양광 점검
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label={dark ? "밝은 테마로 전환" : "어두운 테마로 전환"}
              title={dark ? "밝은 테마" : "어두운 테마"}
              onClick={() => setDark((value) => !value)}
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </Button>
            <Button variant="outline" disabled={loadingDemo} onClick={addDemo}>
              <ImagesIcon />
              <span className="hidden sm:inline">샘플로 시험</span>
              <span className="sm:hidden">샘플</span>
            </Button>
            <Button onClick={() => fileInput.current?.click()}>
              <ImageUpIcon />
              열화상 올리기
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event) => {
                addFiles(event.target.files)
                event.target.value = ""
              }}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1440px] gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_420px] lg:p-6">
        <div className="flex min-w-0 flex-col gap-4">
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            목록의 기본 사진은 AI Hub 라벨 값으로 판정합니다. 올린 사진은
            AIStream 서빙 모델이 분석합니다.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Tabs
              value={status}
              onValueChange={(value) => setStatus(value as Status)}
            >
              <TabsList>
                <TabsTrigger value="all">전체 {count("all")}</TabsTrigger>
                <TabsTrigger value="defect">
                  정비 필요 {count("defect")}
                </TabsTrigger>
                <TabsTrigger value="normal">
                  정상 {count("normal")}
                </TabsTrigger>
                {count("pending") > 0 && (
                  <TabsTrigger value="pending">
                    대기 {count("pending")}
                  </TabsTrigger>
                )}
              </TabsList>
            </Tabs>
            <div className="ml-auto flex w-full gap-2 sm:w-auto">
              <Select
                items={siteItems}
                value={site}
                onValueChange={(value) => setSite(value ?? "all")}
              >
                <SelectTrigger aria-label="현장 선택" className="w-32 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {siteItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative min-w-0 flex-1 sm:w-52">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="파일명 검색"
                  placeholder="파일명 검색"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="hidden w-20 pl-3 sm:table-cell">사진</TableHead>
                  <TableHead className="pl-3 sm:pl-2">파일</TableHead>
                  <TableHead className="w-20 sm:w-24">판정</TableHead>
                  <TableHead className="w-16 pr-3 text-right sm:w-20 sm:pr-2">핫스팟</TableHead>
                  <TableHead className="hidden w-24 pr-3 text-right sm:table-cell">
                    면적(px²)
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((photo) => (
                  <TableRow
                    key={photo.id}
                    data-state={
                      photo.id === selected.id && isDesktop
                        ? "selected"
                        : undefined
                    }
                    className="relative cursor-pointer"
                    onClick={() => select(photo.id)}
                  >
                    <TableCell className="hidden pl-3 sm:table-cell">
                      <img
                        src={srcOf(photo)}
                        alt=""
                        width={64}
                        height={51}
                        decoding="async"
                        className="block h-[51px] w-16 rounded bg-muted object-cover"
                      />
                    </TableCell>
                    <TableCell className="max-w-0 pl-3 sm:pl-2">
                      <button
                        type="button"
                        className={cn(
                          "block w-full truncate text-left font-medium outline-none",
                          "after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                        )}
                        onClick={(event) => {
                          event.stopPropagation()
                          select(photo.id)
                        }}
                      >
                        {photo.id}
                      </button>
                      <span className="block truncate text-muted-foreground">
                        {siteName(photo.location)} · {photo.datetime}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge photo={photo} />
                    </TableCell>
                    <TableCell className="pr-3 text-right tabular-nums sm:pr-2">
                      {statusOf(photo) === "pending" ? "-" : photo.boxes.length}
                    </TableCell>
                    <TableCell className="hidden pr-3 text-right tabular-nums sm:table-cell">
                      {statusOf(photo) === "pending" ? "-" : totalArea(photo)}
                    </TableCell>
                  </TableRow>
                ))}
                {visible.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-32 text-center text-muted-foreground"
                    >
                      조건에 맞는 사진이 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {isDesktop ? (
          <aside className="sticky top-20 self-start">
            <Detail key={selected.id} photo={selected} onRetry={analyze} />
          </aside>
        ) : (
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto p-4 pt-10">
              <SheetTitle className="sr-only">사진 상세</SheetTitle>
              <Detail key={selected.id} photo={selected} onRetry={analyze} />
            </SheetContent>
          </Sheet>
        )}
      </main>
    </div>
  )
}

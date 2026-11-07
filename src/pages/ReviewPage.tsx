import { useRef, useState } from "react"
import {
  ArrowRightIcon,
  BanIcon,
  FlameIcon,
  ImageUpIcon,
  LockIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react"

import { DetectionImage } from "@/components/DetectionImage"
import { ReviewBadge, TierBadge } from "@/components/StatusBadges"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SITES, siteById } from "@/data/sites"
import { tierOf, totalArea, type Summary } from "@/lib/inspection"
import { hrefOf } from "@/lib/route"
import { addUploads, patchUpload, setReview } from "@/lib/store"
import { cn } from "@/lib/utils"
import type { Inspection, Photo, Review, SiteId, Tier } from "@/types"

type Filter = Tier | "all"

const STRIPE: Record<Tier, string> = {
  review: "before:bg-destructive",
  watch: "before:bg-warning",
  none: "before:bg-success",
}

type Prediction = { width: number; height: number; defects: { bbox: number[]; area: number }[] }

async function predict(file: File): Promise<Prediction> {
  const body = new FormData()
  body.append("file", file)
  const response = await fetch("./api/predict/solar", { method: "POST", body })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error ?? data?.detail ?? `HTTP ${response.status}`)
  return data as Prediction
}

let queue = Promise.resolve()

function PhotoDetail({
  photo,
  review,
  locked,
  onReview,
}: {
  photo: Photo
  review: Review
  locked: boolean
  onReview: (review: Review) => void
}) {
  const boxes = photo.boxes.length
  return (
    <Card className="gap-4">
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{photo.seq}번 사진</h2>
            <p className="text-sm text-muted-foreground">{photo.capturedAt}</p>
          </div>
          <div className="flex gap-1.5">
            <TierBadge photo={photo} />
            <ReviewBadge review={review} />
          </div>
        </div>
        <div className={cn("grid gap-2", photo.rgb && "sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2")}>
          <figure className="flex flex-col gap-1">
            <DetectionImage photo={photo} className="rounded-lg" />
            <figcaption className="text-xs text-muted-foreground">열화상 · AI 후보 {boxes}곳</figcaption>
          </figure>
          {photo.rgb && (
            <figure className="flex flex-col gap-1">
              <img
                src={photo.rgb}
                alt={`${photo.seq}번 실화상`}
                className="aspect-[4/3] w-full rounded-lg bg-muted object-cover"
              />
              <figcaption className="text-xs text-muted-foreground">같은 시각 실화상</figcaption>
            </figure>
          )}
        </div>
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            ["후보 위치", `${boxes}곳`],
            ["면적 합", `${totalArea(photo)}px²`],
            ["최대 면적", `${Math.max(0, ...photo.boxes.map((box) => box.area))}px²`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-muted px-2 py-2">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="tabular text-sm font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        {photo.error && <p className="text-sm text-destructive">판정하지 못했습니다. {photo.error}</p>}
        {locked ? (
          <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            <LockIcon className="size-4" />
            저장된 기록이라 바꿀 수 없습니다.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <Button
              variant="destructive"
              size="lg"
              disabled={photo.pending || !!photo.error}
              onClick={() => onReview("confirmed")}
              className="bg-destructive text-white hover:bg-destructive/90 dark:bg-destructive dark:text-[oklch(0.17_0.02_262)]"
            >
              <FlameIcon />
              핫스팟으로 확정
            </Button>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" disabled={photo.pending} onClick={() => onReview("rejected")}>
                <XIcon />
                오탐
              </Button>
              <Button variant="outline" disabled={photo.pending} onClick={() => onReview("excluded")}>
                <BanIcon />
                패널 외
              </Button>
              <Button variant="ghost" disabled={review === "unset"} onClick={() => onReview("unset")}>
                <RotateCcwIcon />
                되돌리기
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function ReviewPage({
  site,
  photos,
  inspection,
  summary,
}: {
  site: SiteId
  photos: Photo[]
  inspection: Inspection
  summary: Summary
}) {
  const [filter, setFilter] = useState<Filter>("review")
  const [selectedId, setSelectedId] = useState<string>()
  const fileInput = useRef<HTMLInputElement>(null)
  const reviewOf = (photo: Photo) => inspection.reviews[photo.id] ?? "unset"
  const locked = !!inspection.savedAt

  const count = (tier: Filter) =>
    tier === "all" ? photos.length : photos.filter((photo) => tierOf(photo) === tier).length
  const visible = photos.filter((photo) => filter === "all" || tierOf(photo) === filter || photo.pending)
  const selected =
    photos.find((photo) => photo.id === selectedId) ??
    visible.find((photo) => reviewOf(photo) === "unset") ??
    visible[0] ??
    photos[0]
  const progress = summary.priority ? (summary.handled / summary.priority) * 100 : 100

  function decide(review: Review) {
    if (!selected) return
    setReview(site, selected.id, review)
    if (review === "unset") return
    const next = visible.find((photo) => photo.id !== selected.id && reviewOf(photo) === "unset")
    if (next) setSelectedId(next.id)
  }

  function upload(list: FileList | null) {
    const files = Array.from(list ?? [])
    if (!files.length) return
    const stamp = Date.now()
    const added: Photo[] = files.map((file, index) => ({
      id: `U_${stamp}_${index}`,
      site,
      seq: file.name.match(/_(\d{4})_[TV]/)?.[1] ?? file.name.replace(/\.[^.]+$/, ""),
      capturedAt: new Date().toLocaleString("sv-SE"),
      ir: URL.createObjectURL(file),
      width: 640,
      height: 512,
      boxes: [],
      folder: "unknown",
      uploaded: true,
      pending: true,
    }))
    addUploads(added)
    setFilter("all")
    setSelectedId(added[0].id)
    added.forEach((photo, index) => {
      const file = files[index]
      queue = queue.then(async () => {
        try {
          const result = await predict(file)
          patchUpload(photo.id, {
            pending: false,
            width: result.width,
            height: result.height,
            boxes: result.defects.map(({ bbox, area }) => ({ bbox, area })),
          })
        } catch (error) {
          patchUpload(photo.id, { pending: false, error: error instanceof Error ? error.message : String(error) })
        }
      })
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={site} onValueChange={(value) => (window.location.hash = hrefOf({ page: "review", site: value as SiteId }))}>
          <TabsList>
            {SITES.map((item) => (
              <TabsTrigger key={item.id} value={item.id}>
                {item.name.replace(" 태양광발전소", "")}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <p className="text-sm text-muted-foreground">
          {siteById(site).region} · {siteById(site).capacityKw}kW
        </p>
        <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          <Button variant="outline" disabled={locked} onClick={() => fileInput.current?.click()} className="flex-1 sm:flex-none">
            <ImageUpIcon />
            열화상 추가
          </Button>
          <Button className="flex-1 sm:flex-none" render={<a href={hrefOf({ page: "record", site })} />}>
            기록표 작성
            <ArrowRightIcon />
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => {
              upload(event.target.files)
              event.target.value = ""
            }}
          />
        </div>
      </div>

      <Card size="sm">
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex justify-between text-sm">
              <span className="font-medium">우선 확인 사진 처리</span>
              <span className="tabular text-muted-foreground">
                {summary.handled} / {summary.priority}
              </span>
            </div>
            <Progress value={progress} />
          </div>
          <div className="flex gap-4 text-sm">
            <span>
              확정 <b className="tabular text-destructive">{summary.confirmed.length}</b>
            </span>
            <span>
              오탐 <b className="tabular">{summary.rejected}</b>
            </span>
            <span>
              패널 외 <b className="tabular">{summary.excluded}</b>
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(380px,460px)]">
        <div className="flex min-w-0 flex-col gap-3">
          <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
            <TabsList>
              <TabsTrigger value="review">우선 확인 {count("review")}</TabsTrigger>
              <TabsTrigger value="watch">참고 {count("watch")}</TabsTrigger>
              <TabsTrigger value="none">이상 없음 {count("none")}</TabsTrigger>
              <TabsTrigger value="all">전체 {count("all")}</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {visible.map((photo) => {
              const review = reviewOf(photo)
              return (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => setSelectedId(photo.id)}
                  aria-pressed={photo.id === selected?.id}
                  className={cn(
                    "relative flex flex-col overflow-hidden rounded-xl bg-card text-left ring-1 ring-foreground/10 transition outline-none before:absolute before:inset-x-0 before:top-0 before:z-10 before:h-1 hover:ring-foreground/25 focus-visible:ring-2 focus-visible:ring-ring",
                    STRIPE[tierOf(photo)],
                    photo.id === selected?.id && "ring-2 ring-primary hover:ring-primary",
                    review !== "unset" && "opacity-70"
                  )}
                >
                  <DetectionImage photo={photo} boxClassName="border-cyan-300 border" />
                  <div className="flex flex-col gap-1.5 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{photo.seq}번</span>
                      <span className="tabular text-xs text-muted-foreground">
                        {photo.pending ? "-" : `${totalArea(photo)}px²`}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <TierBadge photo={photo} />
                      {review !== "unset" && <ReviewBadge review={review} />}
                    </div>
                  </div>
                </button>
              )
            })}
            {visible.length === 0 && (
              <p className="col-span-full rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                이 분류에 해당하는 사진이 없습니다.
              </p>
            )}
          </div>
        </div>
        {selected && (
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <PhotoDetail photo={selected} review={reviewOf(selected)} locked={locked} onReview={decide} />
          </aside>
        )}
      </div>
    </div>
  )
}

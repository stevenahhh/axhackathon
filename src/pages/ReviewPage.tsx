import { useRef, useState, useSyncExternalStore } from "react"
import {
  ArrowRightIcon,
  BanIcon,
  CheckCircle2Icon,
  FlameIcon,
  ImageUpIcon,
  LockIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react"

import { DetectionImage } from "@/components/DetectionImage"
import { ReviewBadge, SourceBadge, TierBadge } from "@/components/StatusBadges"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SITES, siteById } from "@/data/sites"
import { predictSolar } from "@/lib/api"
import { tierOf, totalArea, type Summary } from "@/lib/inspection"
import { hrefOf } from "@/lib/route"
import { addUploads, patchUpload, setReview } from "@/lib/store"
import { cn } from "@/lib/utils"
import type { Inspection, Photo, Review, SiteId, Tier } from "@/types"

type Filter = Tier | "all"

const DESKTOP_QUERY = "(min-width: 1024px)"
const TOUCH_TABS = "group-data-horizontal/tabs:h-11 lg:group-data-horizontal/tabs:h-8"
const TOUCH_BUTTON = "h-11 lg:h-8"

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

// 서빙은 요청을 하나씩 처리하므로 한 장씩 순서대로 보낸다.
let queue = Promise.resolve()

function PhotoDetail({
  photo,
  review,
  locked,
  inSheet,
  onReview,
}: {
  photo: Photo
  review: Review
  locked: boolean
  inSheet: boolean
  onReview: (review: Review) => void
}) {
  const boxes = photo.boxes.length
  const undecidable = photo.pending || !!photo.error
  const title = `${photo.seq}번 사진`
  return (
    <>
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          {inSheet ? (
            <SheetTitle className="text-lg font-semibold">{title}</SheetTitle>
          ) : (
            <h2 className="text-lg font-semibold">{title}</h2>
          )}
          {inSheet ? (
            <SheetDescription>{photo.capturedAt}</SheetDescription>
          ) : (
            <p className="text-sm text-muted-foreground">{photo.capturedAt}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5 pt-0.5">
          <TierBadge photo={photo} />
          <ReviewBadge review={review} />
        </div>
        {inSheet && (
          <SheetClose
            render={<Button variant="ghost" size="icon" className="-mt-2 -mr-2 size-11 shrink-0" aria-label="닫기" />}
          >
            <XIcon />
          </SheetClose>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
        <div className={cn("grid gap-2", photo.rgb && "sm:grid-cols-2 lg:grid-cols-1")}>
          <figure className="flex flex-col gap-1">
            <DetectionImage photo={photo} className="rounded-lg" />
            <figcaption className="text-xs text-muted-foreground">열화상 · AI 후보 {boxes}곳</figcaption>
          </figure>
          {photo.rgb && (
            <figure className="flex flex-col gap-1">
              <img
                src={photo.rgb}
                alt={`${photo.seq}번 실화상`}
                decoding="async"
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
              <dd className="tabular text-sm font-semibold">{photo.pending ? "-" : value}</dd>
            </div>
          ))}
        </dl>
        {photo.source && (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">판정 모델</span>
            <SourceBadge source={photo.source} />
          </div>
        )}
        {photo.pending && <p className="text-sm text-muted-foreground">AIStream 서빙이 핫스팟을 찾고 있습니다.</p>}
        {photo.error && <p className="text-sm text-destructive">판정하지 못했습니다. {photo.error}</p>}
      </div>

      <div className="flex flex-col gap-2 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {locked ? (
          <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            <LockIcon className="size-4" />
            저장된 기록이라 바꿀 수 없습니다.
          </p>
        ) : (
          <>
            <Button
              variant="destructive"
              className="h-11 bg-destructive text-white hover:bg-destructive/90 dark:bg-destructive dark:text-[oklch(0.17_0.02_262)]"
              disabled={undecidable}
              onClick={() => onReview("confirmed")}
            >
              <FlameIcon />
              핫스팟으로 확정
            </Button>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" className="h-11" disabled={undecidable} onClick={() => onReview("rejected")}>
                <XIcon />
                오탐
              </Button>
              <Button variant="outline" className="h-11" disabled={undecidable} onClick={() => onReview("excluded")}>
                <BanIcon />
                패널 외
              </Button>
              <Button variant="ghost" className="h-11" disabled={review === "unset"} onClick={() => onReview("unset")}>
                <RotateCcwIcon />
                되돌리기
              </Button>
            </div>
          </>
        )}
      </div>
    </>
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
  const [sheetOpen, setSheetOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const isDesktop = useIsDesktop()
  const reviewOf = (photo: Photo) => inspection.reviews[photo.id] ?? "unset"
  const locked = !!inspection.savedAt
  const done = !locked && summary.judged > 0 && summary.pendingReview === 0
  const recordHref = hrefOf({ page: "record", site })

  const count = (tier: Filter) =>
    tier === "all" ? photos.length : photos.filter((photo) => tierOf(photo) === tier).length
  const visible = photos.filter((photo) => filter === "all" || tierOf(photo) === filter || photo.pending)
  const selected =
    photos.find((photo) => photo.id === selectedId) ??
    visible.find((photo) => reviewOf(photo) === "unset") ??
    visible[0] ??
    photos[0]
  const progress = summary.priority ? (summary.handled / summary.priority) * 100 : 100

  function open(photoId: string) {
    setSelectedId(photoId)
    if (!isDesktop) setSheetOpen(true)
  }

  function decide(review: Review) {
    if (!selected) return
    setReview(site, selected.id, review)
    if (review === "unset") return
    const next = visible.find(
      (photo) => photo.id !== selected.id && !photo.pending && !photo.error && reviewOf(photo) === "unset"
    )
    if (next) setSelectedId(next.id)
    else setSheetOpen(false)
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
    open(added[0].id)
    added.forEach((photo, index) => {
      const file = files[index]
      queue = queue.then(async () => {
        try {
          const result = await predictSolar(file)
          patchUpload(photo.id, {
            pending: false,
            width: result.width,
            height: result.height,
            boxes: result.defects.map(({ bbox, area }) => ({ bbox, area })),
            source: result.source,
          })
        } catch (error) {
          patchUpload(photo.id, { pending: false, error: error instanceof Error ? error.message : String(error) })
        }
      })
    })
  }

  const detail = selected && (
    <PhotoDetail
      photo={selected}
      review={reviewOf(selected)}
      locked={locked}
      inSheet={!isDesktop}
      onReview={decide}
    />
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="overflow-x-auto">
          <Tabs
            value={site}
            onValueChange={(value) => (window.location.hash = hrefOf({ page: "review", site: value as SiteId }))}
          >
            <TabsList className={TOUCH_TABS} aria-label="현장 선택">
              {SITES.map((item) => (
                <TabsTrigger key={item.id} value={item.id} className="px-3">
                  {item.name.replace(" 태양광발전소", "")}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <p className="text-sm text-muted-foreground">
          {siteById(site).region} · {siteById(site).capacityKw}kW
        </p>
        <div className="flex gap-2 sm:ml-auto">
          <Button
            variant="outline"
            className={cn(TOUCH_BUTTON, "flex-1 sm:flex-none")}
            disabled={locked}
            onClick={() => fileInput.current?.click()}
          >
            <ImageUpIcon />
            열화상 추가
          </Button>
          {!done && (
            <Button
              variant="outline"
              className={cn(TOUCH_BUTTON, "flex-1 sm:flex-none")}
              render={<a href={recordHref} />}
              nativeButton={false}
            >
              {locked ? "기록표 보기" : "기록표 작성"}
              <ArrowRightIcon />
            </Button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg"
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
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="font-medium">우선 확인 사진 처리</span>
                <span className="tabular text-muted-foreground" data-slot="review-progress">
                  {summary.handled} / {summary.priority}
                </span>
              </div>
              <Progress value={progress} aria-label="우선 확인 사진 처리 진행률" />
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
          </div>
          {done && (
            <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-2 text-sm">
                <CheckCircle2Icon className="size-4 shrink-0 text-success" />
                우선 확인을 모두 처리했습니다. 기록표를 작성하세요.
              </p>
              <Button className={TOUCH_BUTTON} render={<a href={recordHref} />} nativeButton={false}>
                기록표 작성
                <ArrowRightIcon />
              </Button>
            </div>
          )}
          {locked && (
            <p className="flex items-center gap-2 border-t pt-3 text-sm text-muted-foreground">
              <LockIcon className="size-4 shrink-0" />
              기록표를 저장해 사진 판정이 잠겼습니다.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(380px,460px)]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="overflow-x-auto">
            <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
              <TabsList className={TOUCH_TABS} aria-label="사진 분류">
                <TabsTrigger value="review">우선 확인 {count("review")}</TabsTrigger>
                <TabsTrigger value="watch">참고 {count("watch")}</TabsTrigger>
                <TabsTrigger value="none">이상 없음 {count("none")}</TabsTrigger>
                <TabsTrigger value="all">전체 {count("all")}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {visible.map((photo) => {
              const review = reviewOf(photo)
              return (
                <button
                  key={photo.id}
                  type="button"
                  data-slot="photo-card"
                  onClick={() => open(photo.id)}
                  aria-pressed={isDesktop ? photo.id === selected?.id : undefined}
                  className={cn(
                    "flex flex-col overflow-hidden rounded-xl bg-card text-left ring-1 ring-foreground/10 transition-[box-shadow,background-color] outline-none hover:ring-foreground/25 focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-primary/5 aria-pressed:ring-primary",
                    review !== "unset" && "opacity-70"
                  )}
                >
                  <DetectionImage photo={photo} boxClassName="border" loading="lazy" />
                  <div className="flex flex-col gap-1.5 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{photo.seq}번</span>
                      <span className="tabular text-xs text-muted-foreground">
                        {photo.pending || photo.error ? "-" : `${totalArea(photo)}px²`}
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
        {isDesktop && detail && (
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <Card className="flex max-h-[calc(100dvh-14rem)] flex-col gap-0 py-0">{detail}</Card>
          </aside>
        )}
      </div>

      {!isDesktop && detail && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="bottom" showCloseButton={false} className="max-h-[90dvh] gap-0 rounded-t-2xl">
            {detail}
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}

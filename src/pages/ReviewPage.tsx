import { useRef, useState } from "react"
import { toast } from "sonner"
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
import { ReopenButton } from "@/components/Form9Editor"
import { PhotoCompare } from "@/components/PhotoCompare"
import { PipelineStatus } from "@/components/PipelineStatus"
import { SamplePicker } from "@/components/SamplePicker"
import { SitePicker, SiteSummaryCard, type SiteChip } from "@/components/SitePicker"
import { FusionBadge, ReviewBadge, SourceBadge, TierBadge } from "@/components/StatusBadges"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SITES } from "@/data/sites"
import { alignRgb, classifyPair, predictSolar, type Sample } from "@/lib/api"
import { tierOf, totalArea, type Summary } from "@/lib/inspection"
import { useIsDesktop } from "@/lib/media"
import { hrefOf } from "@/lib/route"
import { addUploads, patchUpload, setReview } from "@/lib/store"
import { cn } from "@/lib/utils"
import type { SiteStat } from "@/pages/DashboardPage"
import type { Inspection, Photo, Review, SiteId, Tier } from "@/types"

type Filter = Tier | "all"

const TOUCH_TABS = "group-data-horizontal/tabs:h-11 lg:group-data-horizontal/tabs:h-8"
const TOUCH_BUTTON = "h-11 lg:h-8"
// 한 발전소에 사진이 수백 장이라 카드는 48장씩 더 그린다.
const PAGE = 48

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

// 업로드 사진이 도착하기 전에 카드가 빈 src로 페이지를 다시 요청하지 않게 같은 비율의 빈 그림을 둔다.
const PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="512"><rect width="640" height="512" fill="#1a1118"/></svg>'
)}`

// 서빙은 요청을 하나씩 처리하므로 한 장씩 순서대로 보낸다.
let queue = Promise.resolve()

// 서빙이 따뜻하면 네 단계가 1초 안에 끝나 무엇이 돌았는지 보이지 않는다. 단계마다 최소 이 시간만큼은 보여 준다(연산은 그대로 돈다).
const STAGE_MIN_MS = 900
const paced = async <T,>(work: Promise<T>): Promise<T> => {
  const [result] = await Promise.all([work, new Promise((resolve) => setTimeout(resolve, STAGE_MIN_MS))])
  return result
}

// 업로드 한 건. 내 컴퓨터 파일은 File로, SD 카드 샘플은 차례가 오면 /drone에서 받아 올린다.
type UploadSource = {
  seq: string
  name: string
  capturedAt?: string
  zoom?: number
  load: () => Promise<{ ir: File; rgb?: File }>
}

const asFile = async (url: string, name: string) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${name}을(를) 불러오지 못했습니다(HTTP ${response.status}).`)
  return new File([await response.blob()], name, { type: "image/jpeg" })
}

const fromSample = (sample: Sample): UploadSource => ({
  seq: sample.seq,
  name: sample.name,
  capturedAt: sample.capturedAt,
  zoom: sample.rgbZoom,
  load: async () => ({
    ir: await asFile(sample.ir, sample.name),
    rgb: sample.rgb ? await asFile(sample.rgb, sample.name.replace(/_T\.JPG$/i, "_V.JPG")) : undefined,
  }),
})

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
            <SheetDescription className="truncate">{photo.name ?? photo.capturedAt}</SheetDescription>
          ) : (
            <p className="truncate text-sm text-muted-foreground">{photo.name ?? photo.capturedAt}</p>
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
        <PhotoCompare photo={photo} caption={`열화상 · AI 후보 ${undecidable ? "-" : `${boxes}곳`}`} />
        {photo.stage && <PipelineStatus stage={photo.stage} hasRgb={!!photo.rgb} error={photo.error} />}
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            ["후보 위치", `${boxes}곳`],
            ["면적 합", `${totalArea(photo)}px²`],
            ["최대 면적", `${Math.max(0, ...photo.boxes.map((box) => box.area))}px²`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-muted px-2 py-2">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="tabular text-sm font-semibold">{undecidable ? "-" : value}</dd>
            </div>
          ))}
        </dl>
        {photo.source && (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">판정 모델</span>
            <SourceBadge source={photo.source} />
          </div>
        )}
        {photo.fusion && (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              AIStream 자체 융합 모델
              {"usedRgb" in photo.fusion && !photo.fusion.usedRgb && " · 열화상만"}
            </span>
            <FusionBadge fusion={photo.fusion} live={!!photo.stage} />
          </div>
        )}
        {photo.fusion && "error" in photo.fusion && (
          <p className="text-sm text-destructive">융합 판정을 받지 못했습니다. {photo.fusion.error}</p>
        )}
        {photo.pending && !photo.stage && (
          <p className="text-sm text-muted-foreground">AIStream 서빙이 핫스팟을 찾고 있습니다.</p>
        )}
        {photo.error && !photo.stage && <p className="text-sm text-destructive">판정하지 못했습니다. {photo.error}</p>}
      </div>

      <div className="flex flex-col gap-2 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {locked ? (
          <>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LockIcon className="size-4 shrink-0" />
              기록표를 저장해 판정이 잠겼습니다.
            </p>
            <ReopenButton site={photo.site} />
          </>
        ) : (
          <>
            <Button
              variant="destructive"
              className="h-11 bg-destructive text-white hover:bg-destructive/90 dark:bg-destructive dark:text-[oklch(0.145_0_0)]"
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
  stats,
}: {
  site: SiteId
  photos: Photo[]
  inspection: Inspection
  summary: Summary
  stats: Record<SiteId, SiteStat>
}) {
  const [filter, setFilterState] = useState<Filter>("review")
  const [limit, setLimit] = useState(PAGE)
  const setFilter = (next: Filter) => {
    setFilterState(next)
    setLimit(PAGE)
  }
  const [selectedId, setSelectedId] = useState<string>()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
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
  const chips = Object.fromEntries(
    SITES.map((item) => [
      item.id,
      { status: stats[item.id].status, note: `대기 ${stats[item.id].summary.pendingReview}` },
    ])
  ) as Record<SiteId, SiteChip>

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
    if (next) {
      setSelectedId(next.id)
      const shownUpTo = Math.ceil((visible.indexOf(next) + 1) / PAGE) * PAGE
      setLimit((current) => Math.max(current, shownUpTo))
    } else setSheetOpen(false)
  }

  function uploadFiles(list: FileList | null) {
    const all = Array.from(list ?? [])
    // DJI 실화상(_V)은 같은 번호의 열화상과 짝지어 융합 판정과 정렬에 쓴다.
    const rgbBySeq = new Map<string, File>()
    const files: File[] = []
    for (const file of all) {
      const seq = file.name.match(/_(\d{4})_V\b/i)?.[1]
      if (seq) rgbBySeq.set(seq, file)
      else files.push(file)
    }
    if (!files.length) {
      if (all.length)
        toast.warning("열화상 파일이 없습니다", {
          description: "DJI 열화상(_T) JPG를 골라 주세요. 실화상(_V)은 같은 번호의 열화상과 함께 올립니다.",
        })
      return
    }
    run(
      files.map((file) => {
        const seq = file.name.match(/_(\d{4})_T\b/i)?.[1] ?? file.name.replace(/\.[^.]+$/, "")
        return { seq, name: file.name, load: async () => ({ ir: file, rgb: rgbBySeq.get(seq) }) }
      })
    )
  }

  // 업로드 한 장마다 수신 → 핫스팟 탐지 → 융합 판정 → 실화상 정렬을 순서대로 돌리고 단계마다 화면에 반영한다.
  function run(sources: UploadSource[]) {
    const stamp = Date.now()
    const added: Photo[] = sources.map((source, index) => ({
      id: `U_${stamp}_${index}`,
      site,
      seq: source.seq,
      name: source.name,
      capturedAt: source.capturedAt ?? new Date().toLocaleString("sv-SE"),
      ir: PLACEHOLDER,
      rgbZoom: source.zoom,
      width: 640,
      height: 512,
      boxes: [],
      folder: "unknown",
      uploaded: true,
      pending: true,
      stage: "queued",
      fusion: { pending: true },
    }))
    addUploads(added)
    setFilter("all")
    open(added[0].id)
    added.forEach((photo, index) => {
      const source = sources[index]
      // 사진 수신은 바로 시작해 카드에 먼저 보이고, 서빙 호출만 차례를 기다린다.
      const loading = source.load().then((files) => {
        patchUpload(photo.id, { ir: URL.createObjectURL(files.ir), rgb: files.rgb && URL.createObjectURL(files.rgb) })
        return files
      })
      loading.catch(() => undefined)
      queue = queue.then(async () => {
        let ir: File
        let rgb: File | undefined
        try {
          ;({ ir, rgb } = await paced(loading))
        } catch (error) {
          patchUpload(photo.id, { pending: false, error: errorMessage(error), stage: "error" })
          toast.error(`${source.name}을(를) 받지 못했습니다`, { description: errorMessage(error) })
          return
        }
        patchUpload(photo.id, { stage: "detecting" })
        try {
          const result = await paced(predictSolar(ir))
          patchUpload(photo.id, {
            pending: false,
            width: result.width,
            height: result.height,
            boxes: result.defects.map(({ bbox, area }) => ({ bbox, area })),
            source: result.source,
            stage: "classifying",
          })
        } catch (error) {
          patchUpload(photo.id, { pending: false, error: errorMessage(error), stage: "error" })
          toast.error(`${source.name} 핫스팟 판정에 실패했습니다`, { description: errorMessage(error) })
          return
        }
        try {
          const { label, confidence, probs, usedRgb } = await paced(classifyPair(ir, rgb))
          patchUpload(photo.id, { fusion: { label, confidence, probs, usedRgb } })
        } catch (error) {
          patchUpload(photo.id, { fusion: { error: errorMessage(error) } })
          toast.error(`${source.name} 융합 판정에 실패했습니다`, { description: errorMessage(error) })
        }
        if (rgb) {
          patchUpload(photo.id, { stage: "aligning" })
          try {
            const aligned = await paced(alignRgb(rgb, source.zoom))
            patchUpload(photo.id, { rgbAligned: URL.createObjectURL(aligned) })
          } catch (error) {
            toast.warning(`${source.name} 실화상 정렬에 실패했습니다`, {
              description: `${errorMessage(error)} 줌 기준 배율로만 겹칩니다.`,
            })
          }
        }
        patchUpload(photo.id, { stage: "done" })
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
      <SitePicker page="review" site={site} chips={chips} />
      <SiteSummaryCard site={site} status={stats[site].status}>
        <Button
          variant="outline"
          className={cn(TOUCH_BUTTON, "flex-1 sm:flex-none")}
          disabled={locked}
          onClick={() => setPickerOpen(true)}
        >
          <ImageUpIcon />
          열화상 추가
        </Button>
        <SamplePicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          site={site}
          onUpload={(samples) => run(samples.map(fromSample))}
          onPickFiles={() => fileInput.current?.click()}
        />
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
            uploadFiles(event.target.files)
            event.target.value = ""
          }}
        />
      </SiteSummaryCard>

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
            {visible.slice(0, limit).map((photo) => {
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
                  <DetectionImage photo={photo} boxClassName="border" loading="lazy" stage={photo.stage} />
                  <div className="flex flex-col gap-1.5 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{photo.seq}번</span>
                      <span className="tabular text-xs text-muted-foreground">
                        {photo.pending || photo.error ? "-" : `${totalArea(photo)}px²`}
                      </span>
                    </div>
                    {photo.stage && photo.stage !== "done" && (
                      <PipelineStatus stage={photo.stage} hasRgb={!!photo.rgb} error={photo.error} compact />
                    )}
                    <div className="flex flex-wrap gap-1">
                      <TierBadge photo={photo} />
                      <FusionBadge fusion={photo.fusion} live={!!photo.stage} />
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
          {visible.length > limit && (
            <Button
              variant="outline"
              className={cn(TOUCH_BUTTON, "self-center")}
              data-slot="more-photos"
              onClick={() => setLimit((current) => current + PAGE)}
            >
              더 보기 ({visible.length - limit}장 남음)
            </Button>
          )}
        </div>
        {isDesktop && detail && (
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <Card className="flex max-h-[calc(100dvh-14rem)] flex-col gap-0 py-0">{detail}</Card>
          </aside>
        )}
      </div>

      {!isDesktop && detail && (
        <Sheet
          open={sheetOpen}
          // 시트 안 "기록 수정"이 띄운 토스트의 버튼을 누르면 포커스가 시트 밖으로 나가는데, 그 이유로는 닫지 않는다.
          onOpenChange={(open, details) => {
            if (!open && details.reason === "focus-out") return
            setSheetOpen(open)
          }}
        >
          <SheetContent side="bottom" showCloseButton={false} className="max-h-[90dvh] gap-0 rounded-t-2xl">
            {detail}
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}

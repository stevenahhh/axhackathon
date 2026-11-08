import { useState, type ChangeEvent, type ReactNode } from "react"
import { ArrowRightIcon, FileDownIcon, Loader2Icon, LockIcon, PrinterIcon, ThermometerIcon } from "lucide-react"

import { ReopenButton } from "@/components/Form9Editor"
import { PaperFrame } from "@/components/PaperFrame"
import { PrintPage, PrintPortal } from "@/components/PrintPortal"
import { PART_LABELS, ThermalPreview, modeOf, thermalDate, type Level } from "@/components/ThermalPreview"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { thermalJudgement, type Summary } from "@/lib/inspection"
import { pdfFileName, usePdfDownload } from "@/lib/pdf"
import { printDocument, usePrintTarget, type PrintTarget } from "@/lib/print"
import { hrefOf } from "@/lib/route"
import { EMPTY_THERMAL, setThermal } from "@/lib/store"
import { cn } from "@/lib/utils"
import type { Inspection, Photo, SiteId, ThermalEntry, ThermalMode } from "@/types"

const TOUCH_TABS = "group-data-horizontal/tabs:h-11 lg:group-data-horizontal/tabs:h-8"
const TOUCH_BUTTON = "h-11 lg:h-8"
const KEYS = ["p1", "p2", "p3"] as const

const MODES: { value: ThermalMode; label: string; hint: string }[] = [
  {
    value: "point",
    label: "점 3곳",
    hint: "핫스팟 셀 온도를 먼저 넣고 인접한 정상 셀 두 곳을 넣습니다. 온도차는 최고치와 최저치의 차이입니다.",
  },
  {
    value: "area",
    label: "박스(영역)",
    hint: "열화상 분석 프로그램의 박스(영역) 측정값 최대·평균·최소를 옮겨 적습니다. 온도차는 최대와 최소의 차이입니다.",
  },
]

const LEVEL_VARIANT: Record<Level, "success" | "warning" | "destructive"> = {
  정상: "success",
  요주의: "warning",
  이상: "destructive",
}
const LEVEL_DOT: Record<Level, string> = { 정상: "bg-success", 요주의: "bg-warning", 이상: "bg-destructive" }

const judge = (entry: ThermalEntry) => {
  const judgement = thermalJudgement(entry)
  return judgement && { delta: judgement.delta, level: judgement.level as Level }
}

function JudgementBadge({ entry }: { entry: ThermalEntry }) {
  const judgement = judge(entry)
  if (!judgement) return <Badge variant="outline">온도 2점 이상 입력</Badge>
  return (
    <Badge variant={LEVEL_VARIANT[judgement.level]} className="tabular" data-slot="thermal-judgement">
      ΔT {judgement.delta}℃ {judgement.level}
    </Badge>
  )
}

function ModeSegment({
  value,
  disabled,
  onChange,
}: {
  value: ThermalMode
  disabled: boolean
  onChange: (mode: ThermalMode) => void
}) {
  return (
    <div role="radiogroup" aria-label="측정 방식" className="grid h-11 grid-cols-2 gap-0.5 rounded-lg bg-muted p-[3px]">
      {MODES.map((mode) => {
        const active = value === mode.value
        return (
          <button
            key={mode.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(mode.value)}
            className={cn(
              "inline-flex items-center justify-center rounded-md text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60",
              active && "bg-background font-semibold text-foreground shadow-sm dark:bg-input/30"
            )}
          >
            {mode.label}
          </button>
        )
      })}
    </div>
  )
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

export function ThermalRecord({
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
  const [selectedId, setSelectedId] = useState<string>()
  const printTarget = usePrintTarget()
  const pdf = usePdfDownload()
  const confirmed = summary.confirmed
  const selected = confirmed.find((photo) => photo.id === selectedId) ?? confirmed[0]
  const locked = !!inspection.savedAt
  const entryOf = (photo: Photo): ThermalEntry => ({ ...EMPTY_THERMAL, ...inspection.thermal[photo.id] })

  if (!selected) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <ThermometerIcon className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">사진 확인에서 핫스팟을 확정하면 측정기록표가 만들어집니다</p>
          <p className="tabular text-xs text-muted-foreground">열화상 {photos.length}장 · 확정 0장</p>
          <Button
            variant="outline"
            className={cn(TOUCH_BUTTON, "mt-1")}
            render={<a href={hrefOf({ page: "review", site })} />}
            nativeButton={false}
          >
            사진 확인으로 이동
            <ArrowRightIcon />
          </Button>
        </CardContent>
      </Card>
    )
  }

  const entry = entryOf(selected)
  const mode = modeOf(entry)
  const hint = MODES.find((item) => item.value === mode)!.hint
  const pages = printTarget === "thermal-all" ? confirmed : printTarget === "thermal-one" ? [selected] : []
  const paperBusy = pdf.busy !== null
  const pdfIcon = (target: PrintTarget) =>
    pdf.busy === target ? <Loader2Icon className="animate-spin" /> : <FileDownIcon />
  const field = (key: (typeof KEYS)[number] | "part") => ({
    id: `thermal-${key}`,
    value: entry[key],
    disabled: locked,
    onChange: (event: ChangeEvent<HTMLInputElement>) => setThermal(site, selected.id, { [key]: event.target.value }),
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <Tabs value={selected.id} onValueChange={(value) => setSelectedId(value as string)}>
          <TabsList className={TOUCH_TABS} aria-label="확정 사진 선택">
            {confirmed.map((photo) => {
              const judgement = judge(entryOf(photo))
              return (
                <TabsTrigger key={photo.id} value={photo.id} className="px-3">
                  {photo.seq}번
                  {judgement && (
                    <span aria-label={judgement.level} className={cn("size-1.5 rounded-full", LEVEL_DOT[judgement.level])} />
                  )}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>{selected.seq}번 사진 온도 입력</CardTitle>
            <CardDescription className="tabular">
              {thermalDate(selected.capturedAt)} 촬영 · AI 후보 {selected.boxes.length}곳
            </CardDescription>
            <CardAction>
              <JudgementBadge entry={entry} />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ModeSegment value={mode} disabled={locked} onChange={(next) => setThermal(site, selected.id, { mode: next })} />
            <p className="text-xs text-muted-foreground">{hint}</p>
            <div className="grid grid-cols-3 gap-2">
              {KEYS.map((key, index) => (
                <Field key={key} id={`thermal-${key}`} label={`${PART_LABELS[mode][index]} (℃)`}>
                  <Input {...field(key)} inputMode="decimal" placeholder="℃" className="tabular h-11" />
                </Field>
              ))}
            </div>
            <Field id="thermal-part" label="측정부위">
              <Input {...field("part")} className="h-11" />
            </Field>
            {locked && (
              <>
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <LockIcon className="size-4 shrink-0" />
                  기록표를 저장해 온도 입력이 잠겼습니다.
                </p>
                <ReopenButton site={site} />
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">A4 미리보기 · 확정 사진마다 1장</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className={TOUCH_BUTTON}
                disabled={paperBusy}
                onClick={() => void printDocument("thermal-one")}
              >
                <PrinterIcon />
                이 장 인쇄
              </Button>
              <Button
                variant="outline"
                className={TOUCH_BUTTON}
                disabled={paperBusy}
                onClick={() =>
                  void pdf.download("thermal-one", pdfFileName("열화상측정기록표", site, `${selected.seq}번`))
                }
              >
                {pdfIcon("thermal-one")}
                이 장 PDF
              </Button>
              {confirmed.length > 1 && (
                <>
                  <Button
                    variant="outline"
                    className={TOUCH_BUTTON}
                    disabled={paperBusy}
                    onClick={() => void printDocument("thermal-all")}
                  >
                    <PrinterIcon />
                    전체 인쇄 {confirmed.length}장
                  </Button>
                  <Button
                    variant="outline"
                    className={TOUCH_BUTTON}
                    disabled={paperBusy}
                    onClick={() => void pdf.download("thermal-all", pdfFileName("열화상측정기록표", site))}
                  >
                    {pdfIcon("thermal-all")}
                    전체 PDF {confirmed.length}장
                  </Button>
                </>
              )}
            </div>
          </div>
          <PaperFrame>
            <ThermalPreview site={site} photo={selected} inspection={inspection} entry={entry} />
          </PaperFrame>
        </div>
      </div>

      <PrintPortal active={pages.length > 0}>
        {pages.map((photo, index) => (
          <PrintPage key={photo.id} last={index === pages.length - 1}>
            <ThermalPreview site={site} photo={photo} inspection={inspection} entry={entryOf(photo)} />
          </PrintPage>
        ))}
      </PrintPortal>
    </div>
  )
}

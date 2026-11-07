import { useState, type ChangeEvent, type ReactNode } from "react"
import {
  BotIcon,
  CheckIcon,
  CircleIcon,
  Loader2Icon,
  LockIcon,
  MinusIcon,
  PencilLineIcon,
  SaveIcon,
  SparklesIcon,
  WandSparklesIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { recordDate } from "@/components/Form9Preview"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { CURRENT_PERIOD, HISTORY, periodLabel, previousPeriod, siteById } from "@/data/sites"
import { requestOpinion } from "@/lib/api"
import {
  FORM9,
  HOTSPOT,
  appearanceMark,
  article5,
  draftOpinion,
  effectiveMark,
  hotspotSuggestion,
  missingCells,
  thermalJudgement,
  totalArea,
  type Summary,
} from "@/lib/inspection"
import { reopenInspection, saveInspection, setFields, setMark } from "@/lib/store"
import { cn } from "@/lib/utils"
import type { Inspection, Mark, SiteId } from "@/types"

type MarkValue = Exclude<Mark, null>

const MARKS: {
  value: MarkValue
  label: string
  icon: typeof CircleIcon
  selected: string
  glyph: string
}[] = [
  {
    value: "O",
    label: "적합",
    icon: CircleIcon,
    selected: "bg-success/15 dark:bg-success/20",
    glyph: "text-success",
  },
  {
    value: "X",
    label: "부적합",
    icon: XIcon,
    selected: "bg-destructive/10 dark:bg-destructive/20",
    glyph: "text-destructive",
  },
  {
    value: "NA",
    label: "해당없음",
    icon: MinusIcon,
    selected: "bg-background shadow-sm dark:bg-input/30",
    glyph: "text-muted-foreground",
  },
]

const MARK_LABEL: Record<MarkValue, string> = { O: "○ 적합", X: "× 부적합", NA: "해당없음" }

// sonner는 취소 버튼을 누르면 토스트를 스스로 닫으므로 추가 동작은 없다.
const CANCEL = { label: "취소", onClick: () => {} }

const savedTime = (iso: string) => new Date(iso).toLocaleString("sv-SE").slice(0, 16)

// 저장된 기록을 다시 열어 고치는 진입점. 기록표·열화상·사진 확인 화면이 같은 버튼을 쓴다.
// 확인은 동작·취소 버튼이 달린 토스트로 받고, 같은 id라 버튼을 연달아 눌러도 하나만 뜨게 한다.
export function ReopenButton({ site, className }: { site: SiteId; className?: string }) {
  function reopen() {
    toast("저장된 기록을 수정할까요?", {
      id: `reopen-${site}`,
      icon: <PencilLineIcon />,
      description: "저장 잠금이 풀리고 수정 회차가 올라갑니다.",
      duration: Infinity,
      action: {
        label: "수정",
        onClick: () => {
          reopenInspection(site)
          toast.success("기록을 다시 열었습니다", { description: "수정 후 다시 저장해 주세요." })
        },
      },
      cancel: CANCEL,
    })
  }
  return (
    <Button variant="outline" className={cn("h-11", className)} onClick={reopen}>
      <PencilLineIcon />
      기록 수정
    </Button>
  )
}

// AgentStream에 보낼 점검 요약. 서버가 key=value 줄로 바꿔 챗봇에 넘긴다.
function opinionPayload(site: SiteId, inspection: Inspection, summary: Summary) {
  const previous = previousPeriod(CURRENT_PERIOD)
  const top = [...summary.confirmed].sort((a, b) => totalArea(b) - totalArea(a)).slice(0, 3)
  return {
    site_alias: `${site}현장`,
    ym: CURRENT_PERIOD,
    period: `${periodLabel(CURRENT_PERIOD)} 정기점검`,
    photos_total: summary.total,
    excluded: summary.excluded,
    flagged: summary.flagged,
    confirmed: summary.confirmed.length,
    rejected: summary.rejected,
    top_photos: top.map((photo) => ({ seq: photo.seq, count: photo.boxes.length, area_px: totalArea(photo) })),
    previous_period: {
      ym: previous,
      confirmed: HISTORY.find((entry) => entry.site === site && entry.ym === previous)?.confirmed ?? null,
    },
    hotspot_result: effectiveMark(HOTSPOT, inspection, summary) ?? "미입력",
    article5_suggestion: article5(inspection, summary).label,
    thermal: summary.confirmed.flatMap((photo) => {
      const judgement = thermalJudgement(inspection.thermal[photo.id])
      return judgement ? [{ seq: photo.seq, delta: judgement.delta, level: judgement.level }] : []
    }),
  }
}

const TEXTAREA_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"

function MarkSegment({
  label,
  value,
  invalid,
  disabled,
  className,
  onChange,
}: {
  label: string
  value: Mark
  invalid: boolean
  disabled: boolean
  className?: string
  onChange: (mark: MarkValue) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "grid h-11 shrink-0 grid-cols-3 gap-0.5 rounded-lg bg-muted p-[3px]",
        invalid && "ring-1 ring-warning",
        className
      )}
    >
      {MARKS.map((mark) => {
        const active = value === mark.value
        return (
          <button
            key={mark.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(mark.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1 rounded-md text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60 [&_svg]:size-4 [&_svg]:shrink-0",
              active && cn("font-semibold text-foreground", mark.selected)
            )}
          >
            <mark.icon className={active ? mark.glyph : "opacity-50"} />
            {mark.label}
          </button>
        )
      })}
    </div>
  )
}

function CellRow({
  title,
  check,
  hint,
  badge,
  mark,
  locked,
  onChange,
}: {
  title: string
  check?: string
  hint?: string
  badge?: ReactNode
  mark: Mark
  locked: boolean
  onChange: (mark: MarkValue) => void
}) {
  return (
    <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 @lg:flex-row @lg:items-center @lg:gap-4">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {title}
          {badge}
        </p>
        {check && <p className="text-xs text-muted-foreground">{check}</p>}
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <MarkSegment
        label={title}
        value={mark}
        invalid={mark === null && !locked}
        disabled={locked}
        onChange={onChange}
        className="@lg:w-64"
      />
    </div>
  )
}

function Field({
  id,
  label,
  className,
  children,
}: {
  id?: string
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

export function Form9Editor({
  site,
  inspection,
  summary,
}: {
  site: SiteId
  inspection: Inspection
  summary: Summary
}) {
  const info = siteById(site)
  const locked = !!inspection.savedAt
  const revision = inspection.revision ?? 0
  const missing = missingCells(inspection, summary)
  const markOf = (cell: string) => effectiveMark(cell, inspection, summary)
  const appearance = appearanceMark(inspection, summary)
  const suggestion = hotspotSuggestion(summary)
  const hotspotChosen = inspection.marks[HOTSPOT] !== undefined
  const draft = draftOpinion(summary, inspection)
  const fromAgent = inspection.opinionSource === "agent"
  const opinion = inspection.opinionEdited || fromAgent ? inspection.opinion : draft
  const [drafting, setDrafting] = useState(false)
  const rule = article5(inspection, summary)
  const fillable = missing.cells.filter((cell) => cell !== HOTSPOT)
  const field = (key: "weather" | "org" | "inspector" | "insulation" | "ground") => ({
    id: `form9-${key}`,
    value: inspection[key],
    disabled: locked,
    onChange: (event: ChangeEvent<HTMLInputElement>) =>
      setFields(site, { [key]: event.target.value }),
  })

  const hotspotHint = hotspotChosen
    ? "점검자가 직접 골랐습니다."
    : suggestion === "X"
      ? `사진 확인에서 핫스팟 ${summary.confirmed.length}장을 확정해 ×로 제안합니다.`
      : suggestion === "O"
        ? "우선 확인 사진을 모두 처리했고 확정이 없어 ○로 제안합니다."
        : summary.judged === 0
          ? "AI 판정 사진이 없어 직접 골라야 합니다."
          : `우선 확인 사진 ${summary.pendingReview}장을 처리하면 제안이 생깁니다.`

  // 직접 고친 문장이 있으면 토스트로 바꿀지 묻고, 아니면 바로 요청한다.
  function draftWithAgent() {
    if (!inspection.opinionEdited) return void requestDraft()
    toast("직접 고친 종합의견을 AgentStream 초안으로 바꿀까요?", {
      id: `opinion-${site}`,
      icon: <BotIcon />,
      description: "지금 쓴 문장은 사라집니다.",
      duration: Infinity,
      action: { label: "바꾸기", onClick: () => void requestDraft() },
      cancel: CANCEL,
    })
  }

  async function requestDraft() {
    setDrafting(true)
    try {
      const result = await requestOpinion(opinionPayload(site, inspection, summary))
      setFields(site, {
        opinion: result.opinion,
        opinionEdited: false,
        opinionSource: "agent",
        thermalOpinion: result.thermal_opinion,
      })
      toast.success("AgentStream 초안을 넣었습니다")
      const warnings = result.warnings ?? []
      if (warnings.length)
        toast.warning("초안의 숫자를 확인해 주세요", {
          description:
            warnings.length === 1 ? (
              warnings[0]
            ) : (
              <ul className="list-disc pl-4">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ),
        })
    } catch (error) {
      // 초안을 받지 못했으므로 자동 문장으로 되돌리고 "자동 문장" 배지를 유지한다.
      if (!inspection.opinionEdited) setFields(site, { opinionSource: "template" })
      toast.error("AgentStream 초안을 받지 못했습니다", {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setDrafting(false)
    }
  }

  function fillRemaining() {
    if (!fillable.length) return
    const marks = { ...inspection.marks }
    for (const cell of fillable) marks[cell] = "O"
    setFields(site, { marks })
  }

  function save() {
    if (locked || missing.count > 0) return
    if (!inspection.opinion.trim()) setFields(site, { opinion: draft })
    if (!hotspotChosen) setMark(site, HOTSPOT, suggestion)
    saveInspection(site)
    toast.success("점검기록표를 저장했습니다", { description: "사진 판정과 입력이 잠겼습니다." })
  }

  return (
    <div className="@container flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>점검 정보</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 @lg:grid-cols-4">
          <Field label="측정장비" className="col-span-2">
            <p className="flex h-11 items-center text-sm">{info.device}</p>
          </Field>
          <Field label="점검일">
            <p className="tabular flex h-11 items-center text-sm">{recordDate(inspection)}</p>
          </Field>
          <Field id="form9-weather" label="일기">
            <Input {...field("weather")} className="h-11" />
          </Field>
          <Field id="form9-org" label="점검자 소속">
            <Input {...field("org")} className="h-11" />
          </Field>
          <Field id="form9-inspector" label="점검자 성명">
            <Input
              {...field("inspector")}
              placeholder="성명 입력"
              autoComplete="name"
              className={cn("h-11", !inspection.inspector.trim() && !locked && "border-warning")}
            />
          </Field>
          <Field id="form9-insulation" label="절연저항 (MΩ)">
            <Input {...field("insulation")} inputMode="decimal" className="tabular h-11" />
          </Field>
          <Field id="form9-ground" label="접지저항 (Ω)">
            <Input {...field("ground")} inputMode="decimal" className="tabular h-11" />
          </Field>
        </CardContent>
      </Card>

      {FORM9.map((section) => (
        <Card key={section.no}>
          <CardHeader>
            <CardTitle>
              {section.no}. {section.item}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {section.rows.map((row) =>
              row.lines ? (
                <div key={row.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{row.sub}</p>
                      <p className="text-xs text-muted-foreground">
                        아래 세 항목으로 결과 한 칸을 계산합니다.
                      </p>
                    </div>
                    <Badge variant={appearance === "X" ? "destructive" : appearance === null ? "warning" : "secondary"}>
                      {appearance === null ? "미입력" : MARK_LABEL[appearance]}
                    </Badge>
                  </div>
                  <div className="ml-1 flex flex-col divide-y border-l pl-3">
                    {row.lines.map((line) => {
                      const isHotspot = line.id === HOTSPOT
                      return (
                        <CellRow
                          key={line.id}
                          title={line.check}
                          hint={isHotspot ? hotspotHint : undefined}
                          badge={
                            isHotspot && !hotspotChosen && suggestion !== null ? (
                              <Badge variant="info">
                                <SparklesIcon />
                                AI 제안
                              </Badge>
                            ) : undefined
                          }
                          mark={markOf(line.id)}
                          locked={locked}
                          onChange={(mark) => setMark(site, line.id, mark)}
                        />
                      )
                    })}
                  </div>
                </div>
              ) : (
                <CellRow
                  key={row.id}
                  title={row.sub}
                  check={row.check}
                  mark={markOf(row.id)}
                  locked={locked}
                  onChange={(mark) => setMark(site, row.id, mark)}
                />
              )
            )}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>종합의견</CardTitle>
          <CardAction>
            <Badge variant={inspection.opinionEdited ? "secondary" : fromAgent ? "success" : "info"}>
              {inspection.opinionEdited ? "직접 수정" : fromAgent ? "AgentStream" : "자동 문장"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="rounded-lg bg-muted px-3 py-2">
            <p className="text-sm font-medium">제5조 구분: {rule.label}</p>
            <p className="text-xs text-muted-foreground">{rule.detail}</p>
          </div>
          {!locked && (
            <Button variant="outline" className="h-11" disabled={drafting} onClick={draftWithAgent}>
              {drafting ? <Loader2Icon className="animate-spin" /> : <BotIcon />}
              {drafting ? "AgentStream이 초안을 쓰는 중" : "AgentStream으로 초안 쓰기"}
            </Button>
          )}
          <textarea
            id="form9-opinion"
            aria-label="종합의견"
            rows={5}
            value={opinion}
            disabled={locked}
            onChange={(event) => setFields(site, { opinion: event.target.value, opinionEdited: true })}
            className={cn(TEXTAREA_CLASS, "h-auto min-h-32 resize-y py-2 leading-relaxed")}
          />
          {!inspection.opinionEdited && (
            <p className="text-xs text-muted-foreground">
              {fromAgent ? "AgentStream이 쓴 초안입니다." : "사진 확인 결과로 만든 초안입니다."} 고치면
              "직접 수정"으로 바뀝니다.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="sticky bottom-[var(--app-tabbar,calc(3.5rem_+_1px_+_env(safe-area-inset-bottom)))] z-10 -mx-4 border-t bg-background px-4 py-3 lg:bottom-0 lg:mx-0 lg:rounded-xl lg:border lg:bg-card lg:ring-1 lg:ring-foreground/10">
        <div className="flex flex-col gap-2 @lg:flex-row @lg:items-center @lg:justify-between">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            {locked ? (
              <>
                <LockIcon className="size-4 text-success" />
                {revision > 0
                  ? `최종 저장 ${savedTime(inspection.savedAt!)} (수정 ${revision}회)`
                  : `저장 완료 · ${savedTime(inspection.savedAt!)}`}
              </>
            ) : missing.count === 0 ? (
              <>
                <CheckIcon className="size-4 text-success" />
                모든 칸을 입력했습니다.
              </>
            ) : (
              <>
                <span>
                  미입력 <b className="tabular">{missing.count}</b>개
                </span>
                {missing.fields.length > 0 && (
                  <span className="text-muted-foreground">· {missing.fields.join(", ")}</span>
                )}
              </>
            )}
            {!locked && revision > 0 && <Badge variant="secondary">수정 {revision}회차</Badge>}
          </p>
          {locked ? (
            <ReopenButton site={site} />
          ) : (
            <div className="grid grid-cols-[1fr_auto] gap-2 @lg:flex">
              <Button
                variant="outline"
                className="h-11"
                disabled={!fillable.length}
                onClick={fillRemaining}
              >
                <WandSparklesIcon />
                남은 칸 적합으로 채우기
              </Button>
              <Button className="h-11 min-w-24" disabled={missing.count > 0} onClick={save}>
                <SaveIcon />
                {revision > 0 ? "다시 저장" : "저장"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

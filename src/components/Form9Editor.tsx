import type { ChangeEvent, ReactNode } from "react"
import {
  CheckIcon,
  CircleIcon,
  LockIcon,
  MinusIcon,
  SaveIcon,
  SparklesIcon,
  WandSparklesIcon,
  XIcon,
} from "lucide-react"

import { recordDate } from "@/components/Form9Preview"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { siteById } from "@/data/sites"
import {
  FORM9,
  HOTSPOT,
  appearanceMark,
  article5,
  draftOpinion,
  effectiveMark,
  hotspotSuggestion,
  missingCells,
  type Summary,
} from "@/lib/inspection"
import { saveInspection, setFields, setMark } from "@/lib/store"
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
  const missing = missingCells(inspection, summary)
  const markOf = (cell: string) => effectiveMark(cell, inspection, summary)
  const appearance = appearanceMark(inspection, summary)
  const suggestion = hotspotSuggestion(summary)
  const hotspotChosen = inspection.marks[HOTSPOT] !== undefined
  const draft = draftOpinion(summary, inspection)
  const opinion = inspection.opinionEdited ? inspection.opinion : draft
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
            <Badge variant={inspection.opinionEdited ? "secondary" : "info"}>
              {inspection.opinionEdited ? "직접 수정" : "자동 문장"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="rounded-lg bg-muted px-3 py-2">
            <p className="text-sm font-medium">제5조 구분: {rule.label}</p>
            <p className="text-xs text-muted-foreground">{rule.detail}</p>
          </div>
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
              사진 확인 결과로 만든 초안입니다. 고치면 "직접 수정"으로 바뀝니다.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="sticky bottom-[var(--app-tabbar,calc(3.5rem_+_1px_+_env(safe-area-inset-bottom)))] z-10 -mx-4 border-t bg-background px-4 py-3 lg:bottom-0 lg:mx-0 lg:rounded-xl lg:border lg:bg-card lg:ring-1 lg:ring-foreground/10">
        <div className="flex flex-col gap-2 @lg:flex-row @lg:items-center @lg:justify-between">
          <p className="flex items-center gap-2 text-sm">
            {locked ? (
              <>
                <LockIcon className="size-4 text-success" />
                저장 완료 · {new Date(inspection.savedAt!).toLocaleString("sv-SE").slice(0, 16)}
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
          </p>
          {!locked && (
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
                저장
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

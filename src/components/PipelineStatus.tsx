import { CheckIcon, CircleAlertIcon, MinusIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import type { Stage } from "@/types"

type StepState = "done" | "active" | "pending" | "skipped" | "error"

const STEPS = [
  { key: "receive", label: "열화상 수신", hint: "SD 카드" },
  { key: "detect", label: "핫스팟 탐지", hint: "AIStream 제공 서빙" },
  { key: "classify", label: "융합 판정", hint: "열화상+실화상 자체 모델" },
  { key: "align", label: "실화상 정렬", hint: "렌즈 왜곡 보정" },
] as const

const ORDER: Record<Stage, number> = { queued: 0, detecting: 1, classifying: 2, aligning: 3, done: 4, error: -1 }

function stepStates(stage: Stage, hasRgb: boolean, failedAt?: number): StepState[] {
  const position = ORDER[stage]
  return STEPS.map((step, index) => {
    if (step.key === "align" && !hasRgb && stage !== "error") return position >= 3 ? "skipped" : "skipped"
    if (stage === "error") return index < (failedAt ?? 1) ? "done" : index === (failedAt ?? 1) ? "error" : "pending"
    if (index < position) return "done"
    if (index === position) return stage === "done" ? "done" : "active"
    return "pending"
  })
}

export function currentStepLabel(stage: Stage): string {
  if (stage === "done") return "완료"
  if (stage === "error") return "실패"
  return STEPS[ORDER[stage]].label
}

export function PipelineStatus({
  stage,
  hasRgb,
  error,
  compact,
}: {
  stage: Stage
  hasRgb: boolean
  error?: string
  compact?: boolean
}) {
  const states = stepStates(stage, hasRgb)

  if (compact) {
    return (
      <div className="flex items-center gap-2" aria-live="polite" data-slot="pipeline-compact">
        <span className="flex gap-0.5" aria-hidden>
          {states.map((state, index) => (
            <i
              key={index}
              className={cn(
                "h-1 w-3.5 rounded-full",
                state === "done" && "bg-primary",
                state === "active" && "motion-pulse bg-primary",
                state === "pending" && "bg-foreground/15",
                state === "skipped" && "bg-foreground/10",
                state === "error" && "bg-destructive"
              )}
            />
          ))}
        </span>
        <span className={cn("truncate text-xs", stage === "error" ? "text-destructive" : "text-muted-foreground")}>
          {stage === "error" ? "판정 실패" : `${currentStepLabel(stage)} 중…`}
        </span>
      </div>
    )
  }

  return (
    <ol className="grid grid-cols-4 gap-1 text-xs" aria-label="실시간 연산 단계" aria-live="polite" data-slot="pipeline">
      {STEPS.map((step, index) => {
        const state = states[index]
        return (
          <li
            key={step.key}
            data-state={state}
            className={cn(
              "flex flex-col gap-1 rounded-lg border px-2 py-1.5 transition-colors",
              state === "active" && "border-primary/50 bg-primary/5",
              state === "done" && "border-border bg-muted/40",
              state === "pending" && "border-dashed border-border/70 text-muted-foreground",
              state === "skipped" && "border-dashed border-border/50 text-muted-foreground",
              state === "error" && "border-destructive/50 bg-destructive/5"
            )}
          >
            <span className="flex items-center gap-1.5 font-medium">
              <span
                aria-hidden
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full",
                  state === "done" && "bg-primary text-primary-foreground",
                  state === "active" && "motion-breathe bg-primary/90 text-primary-foreground",
                  state === "pending" && "ring-1 ring-foreground/25",
                  state === "skipped" && "ring-1 ring-foreground/20",
                  state === "error" && "bg-destructive text-white"
                )}
              >
                {state === "done" && <CheckIcon className="size-3" strokeWidth={3} />}
                {state === "active" && <i className="motion-pulse size-1.5 rounded-full bg-current" />}
                {state === "skipped" && <MinusIcon className="size-3" />}
                {state === "error" && <CircleAlertIcon className="size-3" />}
                {state === "pending" && <span className="text-[9px] leading-none">{index + 1}</span>}
              </span>
              <span className="truncate">{step.label}</span>
            </span>
            <span className={cn("line-clamp-2 text-[11px] leading-tight", state === "error" ? "text-destructive" : "text-muted-foreground")}>
              {state === "error"
                ? error || "실패"
                : state === "skipped"
                  ? "실화상 없음 · 건너뜀"
                  : state === "active"
                    ? `${step.hint} 처리 중…`
                    : step.hint}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

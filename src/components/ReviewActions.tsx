import { BanIcon, FlameIcon, LockIcon, RotateCcwIcon, XIcon } from "lucide-react"

import { ReopenButton } from "@/components/Form9Editor"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Photo, Review } from "@/types"

const CONFIRM =
  "bg-destructive text-white hover:bg-destructive/90 dark:bg-destructive dark:text-[oklch(0.145_0_0)]"

export function ReviewActions({
  photo,
  review,
  locked,
  orientation = "stack",
  onReview,
}: {
  photo: Photo
  review: Review
  locked: boolean
  orientation?: "stack" | "row"
  onReview: (review: Review) => void
}) {
  const undecidable = photo.pending || !!photo.error
  if (locked) {
    return (
      <div className={cn("flex gap-2", orientation === "stack" ? "flex-col" : "items-center justify-between")}>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LockIcon className="size-4 shrink-0" />
          기록표를 저장해 판정이 잠겼습니다.
        </p>
        <ReopenButton site={photo.site} />
      </div>
    )
  }
  const row = orientation === "row"
  const height = row ? "h-9" : "h-11"
  return (
    <div className={cn("gap-2", row ? "flex flex-wrap items-center" : "flex flex-col")}>
      <Button
        variant="destructive"
        className={cn(height, CONFIRM, row && "order-last ml-auto px-4")}
        disabled={undecidable}
        onClick={() => onReview("confirmed")}
      >
        <FlameIcon />
        핫스팟으로 확정
      </Button>
      <div className={cn("gap-2", row ? "flex" : "grid grid-cols-3")}>
        <Button variant="outline" className={height} disabled={undecidable} onClick={() => onReview("rejected")}>
          <XIcon />
          오탐
        </Button>
        <Button variant="outline" className={height} disabled={undecidable} onClick={() => onReview("excluded")}>
          <BanIcon />
          패널 외
        </Button>
        <Button variant="ghost" className={height} disabled={review === "unset"} onClick={() => onReview("unset")}>
          <RotateCcwIcon />
          되돌리기
        </Button>
      </div>
    </div>
  )
}

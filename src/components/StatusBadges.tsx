import { Badge } from "@/components/ui/badge"
import { tierOf } from "@/lib/inspection"
import type { Photo, Review } from "@/types"

export function TierBadge({ photo }: { photo: Photo }) {
  if (photo.pending) return <Badge variant="info">판정 중</Badge>
  if (photo.error) return <Badge variant="outline">판정 실패</Badge>
  const tier = tierOf(photo)
  if (tier === "review") return <Badge variant="destructive">우선 확인</Badge>
  if (tier === "watch") return <Badge variant="warning">참고</Badge>
  return <Badge variant="success">이상 없음</Badge>
}

const REVIEW_LABEL: Record<Review, string> = {
  unset: "미확인",
  confirmed: "핫스팟 확정",
  rejected: "오탐",
  excluded: "패널 외",
}

export function ReviewBadge({ review }: { review: Review }) {
  const variant =
    review === "confirmed" ? "destructive" : review === "unset" ? "outline" : "secondary"
  return <Badge variant={variant}>{REVIEW_LABEL[review]}</Badge>
}

export type SiteStatus = "todo" | "review" | "record" | "saved"

const SITE_STATUS: Record<SiteStatus, { label: string; variant: "outline" | "warning" | "info" | "success" }> = {
  todo: { label: "미착수", variant: "outline" },
  review: { label: "사진 확인 중", variant: "warning" },
  record: { label: "기록표 작성 중", variant: "info" },
  saved: { label: "저장 완료", variant: "success" },
}

export function SiteStatusBadge({ status }: { status: SiteStatus }) {
  const { label, variant } = SITE_STATUS[status]
  return <Badge variant={variant}>{label}</Badge>
}

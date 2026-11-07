import { BASE_PHOTOS, siteById } from "@/data/sites"
import type { Inspection, Mark, Photo, SiteId, ThermalEntry, Tier } from "@/types"

export const totalArea = (photo: Photo) => photo.boxes.reduce((sum, box) => sum + box.area, 0)

export const tierOf = (photo: Photo): Tier => {
  const area = totalArea(photo)
  if (area >= 100) return "review"
  if (area > 0) return "watch"
  return "none"
}

export const byPriority = (a: Photo, b: Photo) =>
  totalArea(b) - totalArea(a) || a.seq.localeCompare(b.seq)

export function photosOf(site: SiteId, uploads: Photo[]) {
  return [...uploads, ...BASE_PHOTOS].filter((photo) => photo.site === site).sort(byPriority)
}

export type Row = { id: string; sub: string; check: string; lines?: { id: string; check: string }[] }
export type Section = { no: number; item: string; rows: Row[] }

export const HOTSPOT = "1.appearance.hotspot"
export const APPEARANCE = "1.appearance"

export const FORM9: Section[] = [
  {
    no: 1,
    item: "태양전지",
    rows: [
      { id: "1.output", sub: "출력", check: "일사량 대비 안정적 출력(월간 발전량 등) 확인" },
      {
        id: APPEARANCE,
        sub: "외관",
        check: "",
        lines: [
          { id: "1.appearance.discolor", check: "변색(황변, 백화, Glass, Back sheet 등), 변형 여부 확인" },
          { id: HOTSPOT, check: "적외선열화상 측정시 핫스팟 등 열화현상 확인" },
          { id: "1.appearance.frame", check: "프레임 부식, 손상(파손) 확인" },
        ],
      },
      { id: "1.shade", sub: "음영", check: "태양전지 어레이 설치장소의 주변으로 인한 음영 발생 확인" },
      { id: "1.junction", sub: "접속함", check: "외함의 부식 및 손상, 접속점 및 부속품 발열 등 확인" },
    ],
  },
  {
    no: 2,
    item: "지지물",
    rows: [
      { id: "2.install", sub: "설치상태", check: "지지물이 충격 등에 대하여 안전한 상태인지 확인" },
      { id: "2.plating", sub: "도금상태", check: "용융아연도금 상태, 절단면 또는 용접부분 등 녹 방지 유지 등 확인" },
      { id: "2.foundation", sub: "기초상태", check: "기초부위, 지지대 등의 결속 및 정착상태 이상여부 확인" },
      {
        id: "2.bolt",
        sub: "볼트 체결상태",
        check: "용융아연도금 이상의 재질의 볼트 너트사용과 녹발생, 볼트체결 상태 등 이상 여부(스프링 등 풀림방지와셔 사용)",
      },
      { id: "2.bonding", sub: "본딩", check: "태양전지모듈과 지지대의 전기적 접속 상태 이상 여부 확인" },
    ],
  },
  {
    no: 3,
    item: "전선로",
    rows: [
      { id: "3.wire", sub: "전선연결", check: "스트링별 DC케이블 및 간선기준 접속부 발열 등 이상 여부 확인" },
      { id: "3.connector", sub: "커넥터", check: "모듈, 출력단자, 파손 등 습기 및 빗물 침투방지 구조 확인" },
      { id: "3.fixing", sub: "고정", check: "모듈 간의 직렬배선은 바람에 흔들리지 않도록 고정 확인" },
    ],
  },
  {
    no: 4,
    item: "전력변환장치 및 보호장치",
    rows: [
      { id: "4.appearance", sub: "외관", check: "외함 손상, 도금상태 등 변형 여부 확인" },
      { id: "4.operation", sub: "작동상태", check: "소음, 진동, 냄새 등과 같이 평소와 다른 현상 발생 확인" },
      { id: "4.wiring", sub: "전선로", check: "배선의 손상, 접속단자(AC, DC) 체결, 관통부분 마감처리 확인" },
      { id: "4.environment", sub: "설치환경", check: "제조사가 제시한 설치환경(온도, 습도, 청소상태) 준수 여부 확인" },
      { id: "4.protection", sub: "보호값 설정", check: "저주파수 설정 등 인버터 전체 보호요소 및 계전기 설정치 적정 여부" },
    ],
  },
  {
    no: 5,
    item: "주변환경",
    rows: [
      { id: "5.site_drain", sub: "부지안전", check: "배수시설 맨홀 및 배수로 정비상태 확인" },
      { id: "5.site_ground", sub: "부지안전", check: "지지대 또는 지반의 침하가 없으며, 지지대-지반의 고정상태 확인" },
      { id: "5.site_erosion", sub: "부지안전", check: "부지 내 지반 침하, 토사유출 등 현상의 흔적 유무" },
      { id: "5.site_wall", sub: "부지안전", check: "축대의 균열, 누수 등 자연재해 대비 이상 여부 확인" },
      { id: "5.structure_fix", sub: "구조물 등", check: "지붕과 기초, 구조물은 헐거움 없이 고정되었는지 확인" },
      { id: "5.structure_load", sub: "구조물 등", check: "별도의 추가 하중 적재 등 위험물 설치 여부 등 확인" },
    ],
  },
  {
    no: 6,
    item: "기타",
    rows: [
      { id: "6.measure", sub: "측정값", check: "절연 및 접지저항 측정" },
      { id: "6.standard", sub: "기술기준", check: "기타 기술기준 등 관련 규정 적합 여부" },
    ],
  },
]

export const INPUT_CELLS = FORM9.flatMap((section) =>
  section.rows.flatMap((row) => (row.lines ? row.lines.map((line) => line.id) : [row.id]))
)

export function summarize(photos: Photo[], inspection: Inspection) {
  const review = (photo: Photo) => inspection.reviews[photo.id] ?? "unset"
  const judged = photos.filter((photo) => !photo.pending && !photo.error)
  const flagged = judged.filter((photo) => tierOf(photo) !== "none")
  const priority = judged.filter((photo) => tierOf(photo) === "review")
  const handled = priority.filter((photo) => review(photo) !== "unset")
  const confirmed = judged.filter((photo) => review(photo) === "confirmed")
  return {
    total: photos.length,
    judged: judged.length,
    flagged: flagged.length,
    priority: priority.length,
    handled: handled.length,
    confirmed,
    rejected: judged.filter((photo) => review(photo) === "rejected").length,
    excluded: judged.filter((photo) => review(photo) === "excluded").length,
    pendingReview: priority.length - handled.length,
  }
}

export type Summary = ReturnType<typeof summarize>

export function hotspotSuggestion(summary: Summary): Mark {
  if (summary.confirmed.length > 0) return "X"
  if (summary.judged > 0 && summary.pendingReview === 0) return "O"
  return null
}

export function effectiveMark(cell: string, inspection: Inspection, summary: Summary): Mark {
  const mark = inspection.marks[cell]
  if (mark !== undefined) return mark
  return cell === HOTSPOT ? hotspotSuggestion(summary) : null
}

export function appearanceMark(inspection: Inspection, summary: Summary): Mark {
  const row = FORM9[0].rows[1]
  const marks = (row.lines ?? []).map((line) => effectiveMark(line.id, inspection, summary))
  if (marks.includes("X")) return "X"
  if (marks.includes(null)) return null
  if (marks.every((mark) => mark === "NA")) return "NA"
  return "O"
}

export function missingCells(inspection: Inspection, summary: Summary) {
  const cells = INPUT_CELLS.filter((cell) => effectiveMark(cell, inspection, summary) === null)
  const fields = [
    !inspection.inspector.trim() && "점검자 성명",
    !inspection.opinion.trim() && !draftOpinion(summary, inspection) && "종합의견",
  ].filter(Boolean) as string[]
  return { cells, fields, count: cells.length + fields.length }
}

export function article5(inspection: Inspection, summary: Summary) {
  const others = INPUT_CELLS.filter(
    (cell) => cell !== HOTSPOT && effectiveMark(cell, inspection, summary) === "X"
  )
  if (others.length) return { label: "부적합 검토", detail: "제5조 제1호: 기술기준 부적합 여부를 확인하세요." }
  if (effectiveMark(HOTSPOT, inspection, summary) === "X")
    return { label: "안전확보 조언", detail: "제5조 제2호 가목: 운용상태 미흡, 현장 확인 권고" }
  return { label: "해당 없음", detail: "부적합이나 조언 사항이 없습니다." }
}

export function draftOpinion(summary: Summary, inspection: Inspection) {
  if (summary.judged === 0) return ""
  const top = [...summary.confirmed].sort((a, b) => totalArea(b) - totalArea(a))[0]
  const lines = [
    `열화상 ${summary.judged}장을 AI로 판정해 ${summary.flagged}장을 후보로 선별했고, 점검자가 ${summary.confirmed.length}장을 핫스팟 의심으로 확정했습니다.`,
  ]
  if (top)
    lines.push(
      `면적이 가장 큰 ${top.seq}번 사진 위치부터 모듈 오염, 셀 손상, 바이패스 다이오드 이상 여부를 현장에서 확인하고 소유자에게 알리겠습니다.`
    )
  else lines.push("핫스팟 의심 부위가 확인되지 않아 다음 분기 정기점검에서 추이를 계속 살피겠습니다.")
  if (summary.rejected + summary.excluded > 0)
    lines.push(`오탐 ${summary.rejected}장과 패널 외 ${summary.excluded}장은 기록에서 제외했습니다.`)
  if (inspection.insulation || inspection.ground)
    lines.push(
      `절연저항 ${inspection.insulation || "-"} MΩ, 접지저항 ${inspection.ground || "-"} Ω을 측정했습니다.`
    )
  return lines.join(" ")
}

export function thermalJudgement(entry?: ThermalEntry) {
  const values = [entry?.p1, entry?.p2, entry?.p3]
    .map((value) => Number.parseFloat(value ?? ""))
    .filter((value) => Number.isFinite(value))
  if (values.length < 2) return null
  const delta = Math.max(...values) - Math.min(...values)
  const level = delta <= 5 ? "정상" : delta < 10 ? "요주의" : "이상"
  return { delta: Math.round(delta * 10) / 10, level }
}

export const siteName = (site: SiteId) => siteById(site).name

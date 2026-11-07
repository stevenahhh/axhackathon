import { DetectionImage } from "@/components/DetectionImage"
import { siteById } from "@/data/sites"
import { thermalJudgement } from "@/lib/inspection"
import { cn } from "@/lib/utils"
import type { Inspection, Photo, SiteId, ThermalEntry, ThermalMode } from "@/types"

export const LEVELS = ["정상", "요주의", "이상"] as const
export type Level = (typeof LEVELS)[number]

// 양식 칸의 문구. 구간 자체는 inspection.ts의 thermalJudgement가 정한다(5 이하, 5 초과 10 미만, 10 이상).
const LEVEL_HEAD: Record<Level, string> = { 정상: "정 상", 요주의: "요주의", 이상: "이 상" }
const CRITERIA: Record<Level, string> = { 정상: "5℃ 이하", 요주의: "5℃ 초과 ~ 10℃", 이상: "10℃ 이상" }

export const PART_LABELS: Record<ThermalMode, [string, string, string]> = {
  point: ["핫스팟 셀", "인접 셀 1", "인접 셀 2"],
  area: ["박스(영역) 최대", "박스(영역) 평균", "박스(영역) 최소"],
}

export const modeOf = (entry: ThermalEntry): ThermalMode => entry.mode ?? "point"

export const readings = (entry: ThermalEntry) =>
  [entry.p1, entry.p2, entry.p3].map((value) => Number.parseFloat(value)).filter(Number.isFinite)

export function thermalDate(capturedAt: string) {
  const [y, m, d] = capturedAt.slice(0, 10).split("-")
  return y && m && d ? `${y}. ${m}. ${d}` : capturedAt
}

// 문장 형식은 전기안전관리 실무 기록표의 종합의견을 따른다.
export function thermalOpinion(entry: ThermalEntry) {
  const judgement = thermalJudgement(entry)
  if (!judgement) return ""
  if (judgement.level === "정상") return "특별한 이상징후 또는 이상 발열현상은 없습니다."
  const max = Math.max(...readings(entry))
  const subject =
    modeOf(entry) === "area" ? `박스 최대 ${max}℃로 최소 대비` : `핫스팟 셀 ${max}℃로 인접 셀 대비`
  return `${subject} 온도차 ${judgement.delta}℃(${judgement.level}) — 해당 모듈 오염·셀 손상·바이패스 다이오드 상태 현장 점검 요망.`
}

// 종이는 테마를 따르지 않으므로 색은 index.css의 .paper 값과 고정 회색(neutral)만 쓴다.
export function ThermalPreview({
  site,
  photo,
  inspection,
  entry,
}: {
  site: SiteId
  photo: Photo
  inspection: Inspection
  entry: ThermalEntry
}) {
  const info = siteById(site)
  const mode = modeOf(entry)
  const judgement = thermalJudgement(entry)
  const values = [entry.p1, entry.p2, entry.p3]
  const head = "bg-neutral-100 text-center font-semibold"
  const voltage = info.voltageV === 380 ? "380/220V" : `${info.voltageV}V`

  return (
    <div className="flex flex-col gap-[4mm] p-[10mm] text-[9.5pt] leading-snug print:p-0">
      <h2 className="text-center text-[14pt] font-bold tracking-wide">
        적외선 열화상분포 측정기록표
        <span className="text-[10pt] font-normal tracking-normal">(분기 · 반기 · 연차)</span>
      </h2>

      <div className="flex items-end justify-between px-[1mm]">
        <p>
          측정자 :{" "}
          <span className="inline-block min-w-[24mm] text-center font-semibold">
            {inspection.inspector || "　"}
          </span>{" "}
          (서명)
        </p>
        <p className="tabular">측정일자 : {thermalDate(photo.capturedAt)}</p>
      </div>

      <table>
        <colgroup>
          <col className="w-[20mm]" />
          <col />
          <col className="w-[20mm]" />
          <col className="w-[26mm]" />
          <col className="w-[20mm]" />
          <col className="w-[22mm]" />
        </colgroup>
        <tbody>
          <tr>
            <th className={head}>측정대상</th>
            <td className="text-center">
              {info.name} / {entry.part || "태양전지 모듈"} (사진 {photo.seq}번)
            </td>
            <th className={head}>사용전압</th>
            <td className="tabular text-center">{voltage}</td>
            <th className={head}>측정조건</th>
            <td className="text-center">운전 중</td>
          </tr>
        </tbody>
      </table>

      <section className="flex flex-col gap-[1.5mm]">
        <h3 className="font-bold">1. 판정기준(3상 비교법)</h3>
        <table className="text-center">
          <colgroup>
            <col className="w-[34mm]" />
            <col />
            <col />
            <col />
            <col className="w-[30mm]" />
          </colgroup>
          <tbody>
            <tr>
              <th className={cn(head, "relative h-[11mm] p-0")}>
                <svg
                  aria-hidden
                  className="absolute inset-0 size-full"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  <line x1="0" y1="0" x2="100" y2="100" stroke="#222" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                </svg>
                <span className="absolute top-[1mm] right-[2mm]">구 분</span>
                <span className="absolute bottom-[1mm] left-[2mm]">판정요소</span>
              </th>
              {LEVELS.map((level) => (
                <th key={level} className={head}>
                  {LEVEL_HEAD[level]}
                </th>
              ))}
              <th className={head}>비 고</th>
            </tr>
            <tr>
              <td>온도차</td>
              {LEVELS.map((level) => (
                <td
                  key={level}
                  data-level={level}
                  data-active={judgement?.level === level || undefined}
                  className={cn("tabular", judgement?.level === level && "bg-neutral-200 font-bold")}
                >
                  {CRITERIA[level]}
                </td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>
        <p className="text-[8.5pt]">※ 온도차는 최고치와 최저치의 차이임</p>
      </section>

      <section className="flex flex-col gap-[1.5mm]">
        <h3 className="font-bold">2. 부위별 측정온도</h3>
        <table className="tabular text-center">
          <colgroup>
            <col className="w-[34mm]" />
            <col />
            <col />
            <col />
            <col className="w-[30mm]" />
          </colgroup>
          <tbody>
            <tr>
              <th className={head}>측정부위</th>
              {PART_LABELS[mode].map((label) => (
                <th key={label} className={head}>
                  {label}
                </th>
              ))}
              <th className={head}>온도차</th>
            </tr>
            <tr>
              <th className={head}>온도측정</th>
              {values.map((value, index) => (
                <td key={index}>{value.trim() ? `${value.trim()} ℃` : ""}</td>
              ))}
              <td data-slot="thermal-delta" className="font-semibold">
                {judgement ? `${judgement.delta} ℃` : ""}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-[1.5mm]">
        <h3 className="font-bold">3. 측정부위의 Thermographic</h3>
        <table className="text-center">
          <colgroup>
            <col className="w-1/2" />
            <col className="w-1/2" />
          </colgroup>
          <tbody>
            <tr>
              <td className="p-[2mm] align-middle">
                {photo.rgb ? (
                  <img
                    src={photo.rgb}
                    alt={`${photo.seq}번 실화상`}
                    decoding="async"
                    className="block aspect-[4/3] w-full bg-neutral-100 object-cover"
                  />
                ) : (
                  <p className="py-[30mm] text-neutral-500">실화상 없음</p>
                )}
              </td>
              <td className="p-[2mm] align-middle">
                <DetectionImage photo={photo} boxClassName="border" className="bg-neutral-100" />
              </td>
            </tr>
            <tr>
              <td>측정부위</td>
              <td>측정부위 온도분포</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-[1.5mm]">
        <h3 className="font-bold">4. 종합의견</h3>
        <table>
          <tbody>
            <tr>
              <td data-slot="thermal-opinion" className="h-[30mm] p-[2mm] align-top whitespace-pre-wrap">
                {judgement && judgement.level !== "정상" && inspection.thermalOpinion
                  ? inspection.thermalOpinion
                  : thermalOpinion(entry)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  )
}

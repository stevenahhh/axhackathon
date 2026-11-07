import { siteById } from "@/data/sites"
import {
  FORM9,
  appearanceMark,
  draftOpinion,
  effectiveMark,
  type Summary,
} from "@/lib/inspection"
import type { Inspection, Mark, SiteId } from "@/types"

const SYMBOL: Record<Exclude<Mark, null>, string> = { O: "○", X: "×", NA: "해당없음" }
const symbol = (mark: Mark) => (mark ? SYMBOL[mark] : "")

export function recordDate(inspection: Inspection) {
  const source = inspection.savedAt ?? inspection.startedAt
  return (source ? new Date(source) : new Date()).toLocaleDateString("sv-SE")
}

const koreanDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number)
  return `${y}년 ${m}월 ${d}일`
}

// 종이는 테마를 따르지 않으므로 색은 index.css의 .paper 값과 고정 회색(neutral)만 쓴다.
export function Form9Preview({
  site,
  inspection,
  summary,
}: {
  site: SiteId
  inspection: Inspection
  summary: Summary
}) {
  const info = siteById(site)
  const markOf = (cell: string) => effectiveMark(cell, inspection, summary)
  const appearance = appearanceMark(inspection, summary)
  const opinion = inspection.opinion.trim() || draftOpinion(summary, inspection)
  const head = "bg-neutral-100 text-center font-semibold"

  return (
    <div className="flex flex-col gap-[3mm] p-[10mm] text-[8.5pt] leading-snug print:p-0">
      <header className="flex flex-col gap-[1.5mm]">
        <p className="text-[8pt]">[별지 제9호 서식]</p>
        <h2 className="text-center text-[14pt] font-bold tracking-wide">태양광발전설비 점검기록표</h2>
      </header>

      <table>
        <colgroup>
          <col className="w-[22mm]" />
          <col />
          <col className="w-[22mm]" />
          <col className="w-[48mm]" />
        </colgroup>
        <tbody>
          <tr>
            <th className={head}>설비명</th>
            <td>{info.name}</td>
            <th className={head}>점검일</th>
            <td>{koreanDate(recordDate(inspection))}</td>
          </tr>
          <tr>
            <th className={head}>설비용량</th>
            <td className="tabular">
              {info.capacityKw} kW / {info.voltageV} V
            </td>
            <th className={head}>측정장비</th>
            <td>{info.device}</td>
          </tr>
          <tr>
            <th className={head}>점검자</th>
            <td>
              {inspection.org} {inspection.inspector || "　"}{" "}
              {inspection.savedAt ? "(서명: 확인)" : "(서명)"}
            </td>
            <th className={head}>일기</th>
            <td>{inspection.weather}</td>
          </tr>
        </tbody>
      </table>

      <table className="tabular">
        <colgroup>
          <col className="w-[22mm]" />
          <col />
          <col className="w-[30mm]" />
          <col className="w-[30mm]" />
          <col className="w-[30mm]" />
        </colgroup>
        <tbody>
          <tr>
            <th className={head}>구분</th>
            <th className={head}>형식</th>
            <th className={head}>최대전력용량 [kW]</th>
            <th className={head}>최대동작전압 [V]</th>
            <th className={head}>최대동작전류 [A]</th>
          </tr>
          <tr>
            <td className="text-center">태양전지</td>
            <td>{info.module.type}</td>
            <td className="text-center">{info.module.pmaxKw}</td>
            <td className="text-center">{info.module.vmpV}</td>
            <td className="text-center">{info.module.impA}</td>
          </tr>
          <tr>
            <th className={head}>구분</th>
            <th className={head}>형식</th>
            <th className={head}>정격용량 [kW]</th>
            <th className={head}>입력전압범위 [V]</th>
            <th className={head}>출력전압 [V]</th>
          </tr>
          <tr>
            <td className="text-center">전력변환장치</td>
            <td>{info.pcs.type}</td>
            <td className="text-center">{info.pcs.ratedKw}</td>
            <td className="text-center">
              {info.pcs.vinMin}~{info.pcs.vinMax}
            </td>
            <td className="text-center">{info.pcs.voutV}</td>
          </tr>
        </tbody>
      </table>

      <table>
        <colgroup>
          <col className="w-[8mm]" />
          <col className="w-[22mm]" />
          <col className="w-[24mm]" />
          <col />
          <col className="w-[18mm]" />
        </colgroup>
        <thead>
          <tr>
            <th className={head}>NO</th>
            <th className={head}>항목</th>
            <th className={head}>소분류</th>
            <th className={head}>점검 사항</th>
            <th className={head}>점검 결과</th>
          </tr>
        </thead>
        <tbody>
          {FORM9.map((section) => {
            const span = section.rows.reduce((count, row) => count + (row.lines?.length ?? 1), 0)
            let first = true
            return section.rows.flatMap((row) => {
              const lines = row.lines ?? [{ id: row.id, check: row.check }]
              const mark = row.lines ? appearance : markOf(row.id)
              return lines.map((line, index) => {
                const cells = (
                  <tr key={line.id}>
                    {first && (
                      <td rowSpan={span} className="text-center align-middle">
                        {section.no}
                      </td>
                    )}
                    {first && (
                      <td rowSpan={span} className="text-center align-middle">
                        {section.item}
                      </td>
                    )}
                    {index === 0 && (
                      <td rowSpan={lines.length} className="text-center align-middle">
                        {row.sub}
                      </td>
                    )}
                    <td>
                      {line.check}
                      {row.id === "6.measure" && (
                        <span className="tabular">
                          {" "}
                          (절연저항 {inspection.insulation || "-"} MΩ, 접지저항 {inspection.ground || "-"} Ω)
                        </span>
                      )}
                    </td>
                    {index === 0 && (
                      <td rowSpan={lines.length} className="text-center align-middle text-[10pt]">
                        {symbol(mark)}
                      </td>
                    )}
                  </tr>
                )
                first = false
                return cells
              })
            })
          })}
        </tbody>
      </table>

      <table>
        <colgroup>
          <col className="w-[22mm]" />
          <col />
        </colgroup>
        <tbody>
          <tr>
            <th className={head}>종합의견</th>
            <td className="h-[24mm] align-top whitespace-pre-wrap">{opinion}</td>
          </tr>
        </tbody>
      </table>

      <p className="text-[8pt]">비고: ○ 적합 × 부적합 / 해당없음</p>
    </div>
  )
}

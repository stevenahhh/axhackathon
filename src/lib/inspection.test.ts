import { describe, expect, test } from "bun:test"

import {
  HOTSPOT,
  appearanceMark,
  hotspotSuggestion,
  missingCells,
  summarize,
  thermalJudgement,
  tierOf,
} from "@/lib/inspection"
import type { Inspection, Photo } from "@/types"

const photo = (id: string, area: number): Photo => ({
  id,
  site: "A",
  seq: id,
  capturedAt: "2025-11-05 12:00:00",
  ir: "",
  width: 640,
  height: 512,
  boxes: area ? [{ bbox: [0, 0, 1, 1], area }] : [],
  folder: "unknown",
})

const inspection = (patch: Partial<Inspection> = {}): Inspection => ({
  reviews: {},
  marks: {},
  opinion: "",
  opinionEdited: false,
  inspector: "",
  org: "",
  weather: "",
  insulation: "",
  ground: "",
  thermal: {},
  ...patch,
})

const photos = [photo("p1", 300), photo("p2", 120), photo("p3", 40), photo("p4", 0)]

describe("tierOf", () => {
  test("splits photos by total hotspot area", () => {
    expect([0, 50, 100].map((area) => tierOf(photo("x", area)))).toEqual(["none", "watch", "review"])
  })
})

describe("hotspotSuggestion", () => {
  test("suggests X once any photo is confirmed", () => {
    const record = inspection({ reviews: { p1: "confirmed" } })
    expect(hotspotSuggestion(summarize(photos, record))).toBe("X")
  })

  test("suggests O when every priority photo is handled without a confirmation", () => {
    const record = inspection({ reviews: { p1: "rejected", p2: "excluded" } })
    expect(hotspotSuggestion(summarize(photos, record))).toBe("O")
  })

  test("stays empty while priority photos are unhandled", () => {
    const record = inspection({ reviews: { p1: "rejected" } })
    expect(hotspotSuggestion(summarize(photos, record))).toBeNull()
  })
})

describe("appearanceMark", () => {
  const done = summarize(photos, inspection({ reviews: { p1: "rejected", p2: "rejected" } }))
  const marks = (discolor: Inspection["marks"][string], frame: Inspection["marks"][string], hotspot = "O" as const) =>
    inspection({
      marks: { "1.appearance.discolor": discolor, "1.appearance.frame": frame, [HOTSPOT]: hotspot },
    })

  test("is X when any line is X", () => {
    expect(appearanceMark(marks("O", "X"), done)).toBe("X")
  })

  test("is empty when any line is empty", () => {
    expect(appearanceMark(marks("O", null), done)).toBeNull()
  })

  test("is NA only when every line is NA", () => {
    const record = inspection({
      marks: { "1.appearance.discolor": "NA", "1.appearance.frame": "NA", [HOTSPOT]: "NA" },
    })
    expect(appearanceMark(record, done)).toBe("NA")
  })

  test("is O when lines mix O and NA", () => {
    expect(appearanceMark(marks("O", "NA"), done)).toBe("O")
  })
})

describe("missingCells", () => {
  test("lists every input cell and the inspector name on a fresh record", () => {
    const missing = missingCells(inspection(), summarize(photos, inspection()))
    expect(missing.cells).toHaveLength(27)
    expect(missing.fields).toEqual(["점검자 성명"])
  })
})

describe("thermalJudgement", () => {
  test("grades the spread between the hottest and coolest point", () => {
    expect(thermalJudgement({ p1: "30", p2: "24", p3: "25", part: "" })).toEqual({ delta: 6, level: "요주의" })
    expect(thermalJudgement({ p1: "40", p2: "28", p3: "29", part: "" })).toEqual({ delta: 12, level: "이상" })
    expect(thermalJudgement({ p1: "29", p2: "25", p3: "", part: "" })).toEqual({ delta: 4, level: "정상" })
  })

  test("needs at least two readings", () => {
    expect(thermalJudgement({ p1: "30", p2: "", p3: "", part: "" })).toBeNull()
  })
})

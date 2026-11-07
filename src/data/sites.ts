import drone from "@/data/drone.json"
import type { Folder, HistoryEntry, Photo, Site, SiteId } from "@/types"

// 점검 주기는 분기다. HistoryEntry.ym에는 "2026-Q4"처럼 연도와 분기를 적는다.
export const CURRENT_PERIOD = "2026-Q4"

export const quarterOf = (period: string) => `${Number(period.slice(6))}분기`
export const quarterShort = (period: string) => `${Number(period.slice(6))}Q`
export const periodLabel = (period: string) => `${period.slice(0, 4)}년 ${quarterOf(period)}`
export function previousPeriod(period: string) {
  const year = Number(period.slice(0, 4))
  const quarter = Number(period.slice(6))
  return quarter === 1 ? `${year - 1}-Q4` : `${year}-Q${quarter - 1}`
}

const MODULE = { type: "HiS-S440 단결정", pmaxKw: 0.44, vmpV: 41.2, impA: 10.68 }

export const SITES: Site[] = [
  {
    id: "A",
    name: "하동 태양광발전소",
    region: "경남 하동",
    capacityKw: 9000,
    voltageV: 22900,
    device: "DJI M3T 열화상 드론",
    module: MODULE,
    pcs: { type: "3상 계통연계형 500kW × 18대", ratedKw: 9000, vinMin: 600, vinMax: 1500, voutV: 380 },
  },
  {
    id: "B",
    name: "영광 태양광발전소",
    region: "전남 영광",
    capacityKw: 10000,
    voltageV: 22900,
    device: "DJI M3T 열화상 드론",
    module: MODULE,
    pcs: { type: "3상 계통연계형 500kW × 20대", ratedKw: 10000, vinMin: 600, vinMax: 1500, voutV: 380 },
  },
  {
    id: "C",
    name: "음성 태양광발전소",
    region: "충북 음성",
    capacityKw: 1000,
    voltageV: 22900,
    device: "DJI M3T 열화상 드론",
    module: MODULE,
    pcs: { type: "3상 계통연계형 500kW × 2대", ratedKw: 1000, vinMin: 600, vinMax: 1500, voutV: 380 },
  },
  {
    id: "D",
    name: "이천 태양광발전소",
    region: "경기 이천",
    capacityKw: 3000,
    voltageV: 22900,
    device: "DJI M3T 열화상 드론",
    module: MODULE,
    pcs: { type: "3상 계통연계형 500kW × 6대", ratedKw: 3000, vinMin: 600, vinMax: 1500, voutV: 380 },
  },
  {
    id: "E",
    name: "제주 와산 태양광발전소",
    region: "제주 제주시",
    capacityKw: 5000,
    voltageV: 22900,
    device: "DJI M3T 열화상 드론",
    module: MODULE,
    pcs: { type: "3상 계통연계형 500kW × 10대", ratedKw: 5000, vinMin: 600, vinMax: 1500, voutV: 380 },
  },
]

export const formatCapacity = (kw: number) =>
  kw >= 1000 ? `${(kw / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}MW` : `${kw.toLocaleString("ko-KR")}kW`

export const formatVoltage = (v: number) => (v === 380 ? "380/220V" : `${v.toLocaleString("ko-KR")}V`)

export const formatKv = (v: number) => `${(v / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}kV`

// 칩과 탭처럼 좁은 자리에 쓰는 이름: "하동 태양광발전소" → "하동"
export const shortName = (site: Site) => site.name.replace(/ 태양광발전소$/, "")

export const siteById = (id: SiteId) => SITES.find((site) => site.id === id) ?? SITES[0]

// A(하동)·B(영광)·C(음성)·D(이천)·E(제주 와산)의 드론 열화상·실화상 쌍 전부다. scripts/prepare_demo.py가 만든다.
export const BASE_PHOTOS: Photo[] = (
  drone as (Omit<Photo, "site" | "folder"> & { site: string; folder: string })[]
).map((photo) => ({ ...photo, site: photo.site as SiteId, folder: photo.folder as Folder }))

// 올해 1~3분기 정기점검의 시연용 예시 기록. 4분기(CURRENT_PERIOD)는 앱 상태에서 계산한다.
export const HISTORY: HistoryEntry[] = [
  { site: "A", ym: "2026-Q1", photos: 299, confirmed: 3, savedAt: "2026-03-12", seeded: true },
  { site: "A", ym: "2026-Q2", photos: 301, confirmed: 4, savedAt: "2026-06-10", seeded: true },
  { site: "A", ym: "2026-Q3", photos: 300, confirmed: 6, savedAt: "2026-09-14", seeded: true },
  { site: "B", ym: "2026-Q1", photos: 648, confirmed: 2, savedAt: "2026-03-19", seeded: true },
  { site: "B", ym: "2026-Q2", photos: 652, confirmed: 2, savedAt: "2026-06-17", seeded: true },
  { site: "B", ym: "2026-Q3", photos: 650, confirmed: 3, savedAt: "2026-09-22", seeded: true },
  { site: "C", ym: "2026-Q1", photos: 18, confirmed: 1, savedAt: "2026-03-08", seeded: true },
  { site: "C", ym: "2026-Q2", photos: 19, confirmed: 1, savedAt: "2026-06-09", seeded: true },
  { site: "C", ym: "2026-Q3", photos: 19, confirmed: 2, savedAt: "2026-09-07", seeded: true },
  { site: "D", ym: "2026-Q1", photos: 46, confirmed: 1, savedAt: "2026-03-13", seeded: true },
  { site: "D", ym: "2026-Q2", photos: 48, confirmed: 2, savedAt: "2026-06-11", seeded: true },
  { site: "D", ym: "2026-Q3", photos: 47, confirmed: 2, savedAt: "2026-09-15", seeded: true },
  { site: "E", ym: "2026-Q1", photos: 76, confirmed: 2, savedAt: "2026-03-21", seeded: true },
  { site: "E", ym: "2026-Q2", photos: 78, confirmed: 2, savedAt: "2026-06-18", seeded: true },
  { site: "E", ym: "2026-Q3", photos: 77, confirmed: 3, savedAt: "2026-09-23", seeded: true },
]

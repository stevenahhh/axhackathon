import drone from "@/data/drone.json"
import samples from "@/data/photos.json"
import type { Folder, HistoryEntry, Photo, Site, SiteId } from "@/types"

export const CURRENT_YM = "2026-11"

const MODULE = { type: "HiS-S440 단결정", pmaxKw: 0.44, vmpV: 41.2, impA: 10.68 }

export const SITES: Site[] = [
  {
    id: "A",
    name: "A 태양광발전소",
    region: "경남 하동",
    capacityKw: 9000,
    voltageV: 22900,
    device: "DJI M3T 열화상 드론",
    module: MODULE,
    pcs: { type: "3상 계통연계형 500kW × 18대", ratedKw: 9000, vinMin: 600, vinMax: 1500, voutV: 380 },
  },
  {
    id: "B",
    name: "B 태양광발전소",
    region: "전남 영광",
    capacityKw: 10000,
    voltageV: 22900,
    device: "DJI M3T 열화상 드론",
    module: MODULE,
    pcs: { type: "3상 계통연계형 500kW × 20대", ratedKw: 10000, vinMin: 600, vinMax: 1500, voutV: 380 },
  },
  {
    id: "C",
    name: "C 태양광발전소",
    region: "충북 음성",
    capacityKw: 1000,
    voltageV: 22900,
    device: "DJI M3T 열화상 드론",
    module: MODULE,
    pcs: { type: "3상 계통연계형 500kW × 2대", ratedKw: 1000, vinMin: 600, vinMax: 1500, voutV: 380 },
  },
]

export const formatCapacity = (kw: number) =>
  kw >= 1000 ? `${(kw / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}MW` : `${kw.toLocaleString("ko-KR")}kW`

export const formatVoltage = (v: number) => (v === 380 ? "380/220V" : `${v.toLocaleString("ko-KR")}V`)

export const siteById = (id: SiteId) => SITES.find((site) => site.id === id) ?? SITES[0]

type SamplePhoto = {
  id: string
  datetime: string
  width: number
  height: number
  boxes: { bbox: number[]; area: number }[]
}

const samplePhotos: Photo[] = (samples as SamplePhoto[]).map((sample, index) => ({
  id: `C_${sample.id}`,
  site: "C",
  seq: String(index + 1).padStart(4, "0"),
  capturedAt: sample.datetime,
  ir: `samples/${sample.id}.webp`,
  width: sample.width,
  height: sample.height,
  boxes: sample.boxes.map(({ bbox, area }) => ({ bbox, area })),
  folder: sample.id.includes("Positive") ? "abnormal" : "normal",
}))

export const BASE_PHOTOS: Photo[] = [
  ...(drone as (Omit<Photo, "site" | "folder"> & { site: string; folder: string })[]).map(
    (photo) => ({ ...photo, site: photo.site as SiteId, folder: photo.folder as Folder })
  ),
  ...samplePhotos,
]

export const HISTORY: HistoryEntry[] = [
  { site: "A", ym: "2026-08", photos: 284, confirmed: 3, savedAt: "2026-08-12", seeded: true },
  { site: "A", ym: "2026-09", photos: 296, confirmed: 4, savedAt: "2026-09-10", seeded: true },
  { site: "A", ym: "2026-10", photos: 301, confirmed: 6, savedAt: "2026-10-14", seeded: true },
  { site: "B", ym: "2026-08", photos: 640, confirmed: 2, savedAt: "2026-08-19", seeded: true },
  { site: "B", ym: "2026-09", photos: 652, confirmed: 2, savedAt: "2026-09-17", seeded: true },
  { site: "B", ym: "2026-10", photos: 648, confirmed: 3, savedAt: "2026-10-22", seeded: true },
  { site: "C", ym: "2026-08", photos: 18, confirmed: 1, savedAt: "2026-08-08", seeded: true },
  { site: "C", ym: "2026-09", photos: 19, confirmed: 1, savedAt: "2026-09-09", seeded: true },
  { site: "C", ym: "2026-10", photos: 19, confirmed: 2, savedAt: "2026-10-07", seeded: true },
]

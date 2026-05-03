/** Natural Earth 解像度（管理境界） */
export type TopoLodId = "110" | "50" | "10";

export const TOPO_LOD_URL: Record<TopoLodId, string> = {
  "110": "/assets/flag-guesser/countries-110m.json",
  "50": "/assets/flag-guesser/countries-50m.json",
  "10": "/assets/flag-guesser/countries-10m.json",
};

export const DEFAULT_LOD_THRESHOLD_LOW = 300;
export const DEFAULT_LOD_THRESHOLD_HIGH = 1000;

/**
 * 投影の scale() × ズーム倍率 k を想定した指標に対するティア。
 * 閾値はデバッグパネルから上書き可能。
 */
export function lodTierForMetric(metric: number, low: number, high: number): TopoLodId {
  if (metric < low) return "110";
  if (metric < high) return "50";
  return "10";
}

export function lodTierLabel(id: TopoLodId): string {
  switch (id) {
    case "110":
      return "110m";
    case "50":
      return "50m";
    case "10":
      return "10m";
    default:
      return id;
  }
}

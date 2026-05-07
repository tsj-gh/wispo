"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type { Topology } from "topojson-specification";
import {
  buildMercatorForCollection,
  buildPathStrings,
  cloneCountryFeatureUnwrapped,
  computeUnwrapCenterMeridian,
  featureIdString,
} from "@/lib/flag-guesser/mapProjections";
import { filterWorldTopoFeatures } from "@/lib/flag-guesser/topoFeatureFilter";
import { countryFeaturesFromTopology } from "@/lib/flag-guesser/selectRound";
import { indexIsoByCountryCode } from "@/lib/flag-guesser/isoIndex";
import type { CountryFeature, Iso3166Row } from "@/lib/flag-guesser/types";

const TOPO_URL = "/assets/flag-guesser/countries-50m.json";

const SEA = "color-mix(in srgb, var(--color-bg) 92%, #1e3a5f 8%)";
const LAND = "color-mix(in srgb, var(--color-muted) 18%, transparent)";
const LAND_HI = "color-mix(in srgb, var(--color-primary) 45%, transparent)";
const BORDER = "color-mix(in srgb, var(--color-text) 22%, transparent)";
const BORDER_HI = "color-mix(in srgb, var(--color-primary) 55%, transparent)";

export type FlagExplorerMapProps = {
  /** ISO 3166-1 numeric（`country-code`）— TopoJSON の id と一致 */
  highlightCountryCode: string | null;
  isoRows: readonly Iso3166Row[];
  className?: string;
};

export function FlagExplorerMap({ highlightCountryCode, isoRows, className = "" }: FlagExplorerMapProps) {
  const [topo, setTopo] = useState<Topology | null>(null);
  const [size, setSize] = useState({ w: 320, h: 220 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(TOPO_URL)
      .then((r) => r.json())
      .then((t: Topology) => {
        if (!cancelled) setTopo(t);
      })
      .catch(() => {
        if (!cancelled) setTopo(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const apply = () => {
      const r = el.getBoundingClientRect();
      setSize({
        w: Math.max(200, Math.floor(r.width)),
        h: Math.max(160, Math.floor(r.height)),
      });
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const paths = useMemo(() => {
    if (!topo) return null;
    const allRaw = countryFeaturesFromTopology(topo);
    const isoByCode = indexIsoByCountryCode(isoRows);
    const filtered = filterWorldTopoFeatures(allRaw, isoByCode);
    const { w, h } = size;
    if (filtered.length === 0) return { w, h, entries: [] as { id: string; d: string; hi: boolean }[], missing: false };

    const fcWorld: FeatureCollection<Geometry, GeoJsonProperties> = {
      type: "FeatureCollection",
      features: filtered as CountryFeature[],
    };
    const meridianWorld = computeUnwrapCenterMeridian(fcWorld);
    const unwrappedAll = filtered.map((f) => cloneCountryFeatureUnwrapped(f, meridianWorld));

    const hi = highlightCountryCode?.trim() || null;
    const selectedRaw = hi ? filtered.find((f) => featureIdString(f) === hi) : undefined;

    if (hi && selectedRaw) {
      const fcOne: FeatureCollection<Geometry, GeoJsonProperties> = {
        type: "FeatureCollection",
        features: [selectedRaw as CountryFeature],
      };
      const meridian = computeUnwrapCenterMeridian(fcOne);
      const unwrapped = filtered.map((f) => cloneCountryFeatureUnwrapped(f, meridian));
      const fitFc: FeatureCollection<Geometry, GeoJsonProperties> = {
        type: "FeatureCollection",
        features: [cloneCountryFeatureUnwrapped(selectedRaw, meridian)],
      };
      const projection = buildMercatorForCollection(fitFc, w, h, 12, meridian);
      const pathDById = buildPathStrings(projection, unwrapped);
      const entries: { id: string; d: string; hi: boolean }[] = [];
      for (const f of unwrapped) {
        const id = featureIdString(f);
        if (!id) continue;
        const d = pathDById.get(id);
        if (!d) continue;
        entries.push({ id, d, hi: id === hi });
      }
      return { w, h, entries, missing: false };
    }

    const fitFc: FeatureCollection<Geometry, GeoJsonProperties> = {
      type: "FeatureCollection",
      features: unwrappedAll as CountryFeature[],
    };
    const projection = buildMercatorForCollection(fitFc, w, h, 6, meridianWorld);
    const pathDById = buildPathStrings(projection, unwrappedAll);
    const entries: { id: string; d: string; hi: boolean }[] = [];
    for (const f of unwrappedAll) {
      const id = featureIdString(f);
      if (!id) continue;
      const d = pathDById.get(id);
      if (!d) continue;
      entries.push({ id, d, hi: hi != null && id === hi });
    }
    return { w, h, entries, missing: Boolean(hi) && !selectedRaw };
  }, [topo, isoRows, size, highlightCountryCode]);

  return (
    <div ref={containerRef} className={`relative w-full min-h-[160px] ${className}`.trim()}>
      {!topo ? (
        <div className="flex h-48 items-center justify-center text-xs text-[var(--color-muted)]">地図データを読み込み中…</div>
      ) : paths && paths.entries.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-xs text-[var(--color-muted)]">表示できる領域がありません</div>
      ) : paths ? (
        <>
          <svg
            width={paths.w}
            height={paths.h}
            viewBox={`0 0 ${paths.w} ${paths.h}`}
            className="block w-full overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--color-text)_12%,transparent)] bg-[var(--color-bg)]"
            role="img"
            aria-label="選択した国を強調した世界地図"
          >
            <rect width={paths.w} height={paths.h} fill={SEA} />
            {paths.entries.map(({ id, d, hi }) => (
              <path
                key={id}
                d={d}
                fill={hi ? LAND_HI : LAND}
                stroke={hi ? BORDER_HI : BORDER}
                strokeWidth={hi ? 1.1 : 0.35}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          {paths.missing ? (
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              この国のポリゴンは小さすぎるため、地図データから省略されている可能性があります（全体地図のみ表示します）。
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

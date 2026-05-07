"use client";

import { geoArea, geoCentroid } from "d3-geo";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
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
const PIN_FALLBACK_URL = "/assets/flag-guesser/country_map_pin_fallback.json";

/** 小国ポリゴンが画面上で判別しにくいときにピンを重ねる（球面面積・おおよそ steradians） */
const SMALL_FEATURE_AREA_STERADIANS = 6e-9;
const MIN_PATH_STRING_LENGTH = 72;

const SEA = "color-mix(in srgb, var(--color-bg) 92%, #1e3a5f 8%)";
const LAND = "color-mix(in srgb, var(--color-muted) 18%, transparent)";
const LAND_HI = "color-mix(in srgb, var(--color-primary) 45%, transparent)";
const BORDER = "color-mix(in srgb, var(--color-text) 22%, transparent)";
const BORDER_HI = "color-mix(in srgb, var(--color-primary) 55%, transparent)";

export type FlagExplorerMapProps = {
  /** ISO 3166-1 numeric（`country-code`）— TopoJSON の id と一致 */
  highlightCountryCode: string | null;
  isoRows: readonly Iso3166Row[];
  /** 同じ中間リージョン（またはサブリージョン）に属する ISO numeric の一覧 — 地図はこの集合の外接矩形にフィット */
  regionFitCountryCodes?: readonly string[] | null;
  className?: string;
};

export function FlagExplorerMap({
  highlightCountryCode,
  isoRows,
  regionFitCountryCodes,
  className = "",
}: FlagExplorerMapProps) {
  const [topo, setTopo] = useState<Topology | null>(null);
  const [pinFallback, setPinFallback] = useState<Record<string, [number, number]> | null>(null);
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
    let cancelled = false;
    fetch(PIN_FALLBACK_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j && typeof j === "object") setPinFallback(j as Record<string, [number, number]>);
      })
      .catch(() => {
        if (!cancelled) setPinFallback(null);
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
    if (filtered.length === 0) return { w, h, entries: [] as { id: string; d: string; hi: boolean }[], missing: false, marker: null as { x: number; y: number } | null };

    const hi = highlightCountryCode?.trim() || null;
    const regionSet =
      regionFitCountryCodes && regionFitCountryCodes.length > 0
        ? new Set(regionFitCountryCodes.map((c) => c.trim()).filter(Boolean))
        : null;

    let fitRaw: CountryFeature[] = [];
    if (regionSet && regionSet.size > 0) {
      fitRaw = filtered.filter((f) => {
        const id = featureIdString(f);
        return id ? regionSet.has(id) : false;
      });
    }
    if (fitRaw.length === 0 && hi) {
      const one = filtered.find((f) => featureIdString(f) === hi);
      if (one) fitRaw = [one];
    }
    if (fitRaw.length === 0) {
      fitRaw = [...filtered];
    }

    const fcFit: FeatureCollection<Geometry, GeoJsonProperties> = {
      type: "FeatureCollection",
      features: fitRaw as Feature<Geometry, GeoJsonProperties>[],
    };
    const meridian = computeUnwrapCenterMeridian(fcFit);
    const unwrappedAll = filtered.map((f) => cloneCountryFeatureUnwrapped(f, meridian));
    const fitIds = new Set(
      fitRaw.map((f) => featureIdString(f)).filter((x): x is string => Boolean(x))
    );
    const unwrappedFit = unwrappedAll.filter((f) => {
      const id = featureIdString(f);
      return id ? fitIds.has(id) : false;
    });
    const fcFitUnwrapped: FeatureCollection<Geometry, GeoJsonProperties> = {
      type: "FeatureCollection",
      features: unwrappedFit as Feature<Geometry, GeoJsonProperties>[],
    };
    const projection = buildMercatorForCollection(fcFitUnwrapped, w, h, 12, meridian);
    const pathDById = buildPathStrings(projection, unwrappedAll);

    const entries: { id: string; d: string; hi: boolean }[] = [];
    for (const f of unwrappedAll) {
      const id = featureIdString(f);
      if (!id) continue;
      const d = pathDById.get(id);
      if (!d) continue;
      entries.push({ id, d, hi: hi != null && id === hi });
    }

    let marker: { x: number; y: number } | null = null;
    if (hi) {
      const hiFeat = unwrappedAll.find((f) => featureIdString(f) === hi);
      const dHi = pathDById.get(hi);
      const inTopo = Boolean(hiFeat && dHi);
      const area =
        hiFeat != null
          ? geoArea(hiFeat as Feature<Geometry, GeoJsonProperties>)
          : 0;
      const pathTiny = !dHi || dHi.length < MIN_PATH_STRING_LENGTH;
      const areaTiny = inTopo && area > 0 && area < SMALL_FEATURE_AREA_STERADIANS;
      const omitted = !inTopo;
      const needsPin = omitted || pathTiny || areaTiny;

      if (needsPin) {
        let lonLat: [number, number] | null = null;
        if (hiFeat && dHi) {
          const c = geoCentroid(hiFeat as Feature<Geometry, GeoJsonProperties>);
          lonLat = [c[0] as number, c[1] as number];
        } else if (pinFallback?.[hi]) {
          lonLat = pinFallback[hi]!;
        }
        if (lonLat) {
          const p = projection(lonLat);
          if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
            marker = { x: p[0]!, y: p[1]! };
          }
        }
      }
    }

    const missing = Boolean(hi) && !filtered.some((f) => featureIdString(f) === hi);

    return { w, h, entries, missing, marker };
  }, [topo, isoRows, size, highlightCountryCode, regionFitCountryCodes, pinFallback]);

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
            aria-label="中間リージョン（またはサブリージョン）を収めた地域地図"
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
            {paths.marker ? (
              <g transform={`translate(${paths.marker.x},${paths.marker.y})`} aria-hidden>
                <circle r={6} fill="var(--color-primary)" stroke="white" strokeWidth={2} />
                <text
                  x={10}
                  y={4}
                  fontSize={13}
                  fill="var(--color-primary)"
                  fontFamily="system-ui, sans-serif"
                  fontWeight={700}
                  transform="rotate(45 10 4)"
                >
                  →
                </text>
              </g>
            ) : null}
          </svg>
          {paths.missing ? (
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              この国のポリゴンはデータ上省略されているため、おおよその位置を記号で示しています。
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

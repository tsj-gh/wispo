"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Topology } from "topojson-specification";
import {
  buildRegionRoundModel,
  countryIdAtPixel,
  projectCentroid,
  sortFeaturesForHitTest,
} from "@/lib/flag-guesser/mapProjections";
import type { CountryFeature, Iso3166Row, RegionRoundModel } from "@/lib/flag-guesser/types";
import {
  countryFeaturesFromTopology,
  createRoundPlan,
  flagUrlForAlpha2,
  topoNumericIdSet,
  resolveIsoRows,
} from "@/lib/flag-guesser/selectRound";
import { spawnBubbleLike, stepBubbleLikeInBox, type FloatingBubbleLike } from "@/lib/flag-guesser/floatingFlagPhysics";
import { useI18n } from "@/lib/i18n-context";
import { getCountryDisplayName } from "@/components/lab/flag-guesser/MapCanvas";

const TOPO_URL = "/assets/flag-guesser/countries-50m.json";
const ISO_URL = "/assets/flag-guesser/iso-3166.json";

/** Tailwind の `in_srgb` はクラス名用エスケープ。生の CSS では `in srgb` とスペースが必須。 */
const MAP_FILL_DEFAULT = "color-mix(in srgb, var(--color-primary) 12%, transparent)";
const MAP_FILL_HOVER = "color-mix(in srgb, var(--color-primary) 28%, transparent)";
const MAP_FILL_DRAG = "color-mix(in srgb, var(--color-primary) 42%, transparent)";
const MAP_FILL_CORRECT = "color-mix(in srgb, #22c55e 42%, transparent)";
const MAP_FILL_WRONG = "color-mix(in srgb, #ef4444 42%, transparent)";

const CARD_W = 72;
const CARD_H = 54;

type DragState = {
  cardId: string;
  offsetX: number;
  offsetY: number;
};

function clientToLocal(clientX: number, clientY: number, rect: DOMRect, innerW: number, innerH: number): [number, number] {
  const x = ((clientX - rect.left) / rect.width) * innerW;
  const y = ((clientY - rect.top) / rect.height) * innerH;
  return [x, y];
}

type PlayCard = { id: string; alpha2: string };

export function FlagGuesserPlayfield() {
  const { locale } = useI18n();
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 520, h: 390 });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isoRows, setIsoRows] = useState<Iso3166Row[]>([]);
  const [allTopoFeatures, setAllTopoFeatures] = useState<CountryFeature[]>([]);
  const initRoundRef = useRef(false);

  const [roundSeq, setRoundSeq] = useState(0);
  const [roundPlan, setRoundPlan] = useState<{ targetRow: Iso3166Row; cardAlpha2s: string[] } | null>(null);
  const [excludeAlphas, setExcludeAlphas] = useState<Set<string>>(new Set());

  const [placedByCard, setPlacedByCard] = useState<Record<string, string>>({});
  const placedRef = useRef(placedByCard);
  placedRef.current = placedByCard;

  const [floatByCard, setFloatByCard] = useState<Record<string, FloatingBubbleLike>>({});
  const floatRef = useRef(floatByCard);
  floatRef.current = floatByCard;

  const [drag, setDrag] = useState<DragState | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [hoverCountryId, setHoverCountryId] = useState<string | null>(null);
  const [dragTargetCountryId, setDragTargetCountryId] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [resultByCountryId, setResultByCountryId] = useState<Record<string, "correct" | "wrong">>({});

  const lastTsRef = useRef(0);
  const rafRef = useRef(0);

  const { byCountryCode } = useMemo(() => resolveIsoRows(isoRows), [isoRows]);

  const topoIds = useMemo(() => topoNumericIdSet(allTopoFeatures), [allTopoFeatures]);

  const regionModel = useMemo<RegionRoundModel | null>(() => {
    if (!roundPlan || !allTopoFeatures.length || size.w < 32 || size.h < 32) return null;
    try {
      return buildRegionRoundModel({
        target: roundPlan.targetRow,
        region: roundPlan.targetRow.region!,
        allFeatures: allTopoFeatures,
        isoByCode: byCountryCode,
        width: size.w,
        height: size.h,
      });
    } catch {
      return null;
    }
  }, [roundPlan, allTopoFeatures, byCountryCode, size.w, size.h]);

  const hitFeatures = useMemo(() => {
    if (!regionModel) return [];
    return sortFeaturesForHitTest(regionModel.allFeatures as CountryFeature[]);
  }, [regionModel]);

  const cards: PlayCard[] = useMemo(() => {
    if (!roundPlan) return [];
    return roundPlan.cardAlpha2s.map((a2, i) => ({
      id: `fc-${roundSeq}-${i}`,
      alpha2: a2,
    }));
  }, [roundPlan, roundSeq]);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    Promise.all([
      fetch(TOPO_URL).then((r) => r.json() as Promise<Topology>),
      fetch(ISO_URL).then((r) => r.json() as Promise<Iso3166Row[]>),
    ])
      .then(([topo, iso]) => {
        if (cancelled) return;
        setIsoRows(iso);
        const feats = countryFeaturesFromTopology(topo);
        setAllTopoFeatures(feats);
      })
      .catch(() => {
        if (!cancelled) setLoadError("データの読み込みに失敗しました");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isoRows.length || !allTopoFeatures.length || initRoundRef.current) return;
    const plan = createRoundPlan(isoRows, topoNumericIdSet(allTopoFeatures), new Set(), 3);
    if (plan) {
      setRoundPlan(plan);
      initRoundRef.current = true;
    }
  }, [isoRows, allTopoFeatures]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const w = Math.max(280, Math.floor(r.width));
      const h = Math.max(280, Math.floor(r.height));
      if (w > 0 && h > 0) setSize({ w, h });
    };
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!cards.length || answered) return;
    const r = CARD_W * 0.45;
    setFloatByCard(() => {
      const next: Record<string, FloatingBubbleLike> = {};
      for (const c of cards) {
        next[c.id] = spawnBubbleLike({
          width: size.w,
          height: size.h,
          radius: r,
          speedScale: 0.95,
          restitution: 0.88,
        });
      }
      return next;
    });
  }, [roundSeq, size.w, size.h, answered, cards.length]);

  useEffect(() => {
    if (!cards.length || answered) return;
    const tick = (ts: number) => {
      const last = lastTsRef.current || ts;
      const dt = Math.min(0.033, Math.max(0.001, (ts - last) / 1000));
      lastTsRef.current = ts;
      setFloatByCard((prev) => {
        const next = { ...prev };
        for (const c of cards) {
          if (placedByCard[c.id] || drag?.cardId === c.id) continue;
          const b = next[c.id];
          if (!b) continue;
          stepBubbleLikeInBox(b, size.w, size.h, dt);
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [cards, placedByCard, drag, answered, size.w, size.h, roundSeq]);

  const projection = regionModel?.projection;

  const handleSvgPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!projection || !regionModel || answered || drag) return;
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const [x, y] = clientToLocal(event.clientX, event.clientY, rect, size.w, size.h);
      const id = countryIdAtPixel(projection, hitFeatures, x, y);
      setHoverCountryId(id);
    },
    [projection, regionModel, hitFeatures, answered, drag, size.w, size.h]
  );

  const handleSvgLeave = useCallback(() => {
    if (!drag) setHoverCountryId(null);
  }, [drag]);

  const countryFill = (id: string): string => {
    if (answered) {
      const m = resultByCountryId[id];
      if (m === "correct") return MAP_FILL_CORRECT;
      if (m === "wrong") return MAP_FILL_WRONG;
    }
    if (drag && dragTargetCountryId === id) return MAP_FILL_DRAG;
    if (hoverCountryId === id) return MAP_FILL_HOVER;
    return MAP_FILL_DEFAULT;
  };

  const beginDrag = useCallback(
    (cardId: string, clientX: number, clientY: number) => {
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect || !projection) return;
      const [x, y] = clientToLocal(clientX, clientY, rect, size.w, size.h);
      let cx = x;
      let cy = y;
      const fl = floatRef.current[cardId];
      if (fl) {
        cx = fl.x;
        cy = fl.y;
      }
      setDrag({ cardId, offsetX: x - cx, offsetY: y - cy });
      setDragPos({ x: cx, y: cy });
      if (fl) {
        setFloatByCard((prev) => {
          const next = { ...prev };
          delete next[cardId];
          return next;
        });
      }
    },
    [projection, regionModel, size.w, size.h]
  );

  const moveDrag = useCallback(
    (clientX: number, clientY: number) => {
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect || !projection || !drag) return;
      const [x, y] = clientToLocal(clientX, clientY, rect, size.w, size.h);
      const nx = x - drag.offsetX;
      const ny = y - drag.offsetY;
      setDragPos({ x: nx, y: ny });
      const id = countryIdAtPixel(projection, hitFeatures, nx, ny);
      setDragTargetCountryId(id);
    },
    [projection, drag, hitFeatures, size.w, size.h]
  );

  const endDrag = useCallback(
    (cardId: string) => {
      const countryId = dragTargetCountryId;
      setDrag(null);
      setDragTargetCountryId(null);

      if (countryId) {
        const prevPlaced = placedRef.current;
        const occupied = Object.entries(prevPlaced).find(([other, cid]) => cid === countryId && other !== cardId);
        if (occupied) {
          setFloatByCard((prev) => ({
            ...prev,
            [cardId]: spawnBubbleLike({
              width: size.w,
              height: size.h,
              radius: CARD_W * 0.45,
              speedScale: 0.95,
              restitution: 0.88,
            }),
          }));
          return;
        }
        setPlacedByCard((prev) => ({ ...prev, [cardId]: countryId }));
        return;
      }

      setFloatByCard((prev) => ({
        ...prev,
        [cardId]: spawnBubbleLike({
          width: size.w,
          height: size.h,
          radius: CARD_W * 0.45,
          speedScale: 0.95,
          restitution: 0.88,
        }),
      }));
    },
    [dragTargetCountryId, size.w, size.h]
  );

  const peelStuck = useCallback(
    (cardId: string) => {
      setPlacedByCard((prev) => {
        const next = { ...prev };
        delete next[cardId];
        return next;
      });
      setFloatByCard((prev) => ({
        ...prev,
        [cardId]: spawnBubbleLike({
          width: size.w,
          height: size.h,
          radius: CARD_W * 0.45,
          speedScale: 0.95,
          restitution: 0.88,
        }),
      }));
    },
    [size.w, size.h]
  );

  const handleCardPointerDown = (cardId: string, e: ReactPointerEvent) => {
    if (answered) return;
    e.preventDefault();
    if (placedByCard[cardId]) {
      peelStuck(cardId);
      return;
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    beginDrag(cardId, e.clientX, e.clientY);
  };

  useEffect(() => {
    if (!drag) return;
    const cardId = drag.cardId;
    const onMove = (e: PointerEvent) => moveDrag(e.clientX, e.clientY);
    const onUp = () => endDrag(cardId);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, moveDrag, endDrag]);

  const submitAnswer = () => {
    if (!roundPlan) return;
    const byC: Record<string, "correct" | "wrong"> = {};
    for (const c of cards) {
      const cid = placedByCard[c.id];
      if (!cid) continue;
      const row = byCountryCode.get(cid);
      const ok = row?.["alpha-2"].toUpperCase() === c.alpha2.toUpperCase();
      byC[cid] = ok ? "correct" : "wrong";
    }
    setResultByCountryId(byC);
    setAnswered(true);
    const a2 = roundPlan.targetRow["alpha-2"]?.toUpperCase();
    if (a2) setExcludeAlphas((prev) => new Set([...Array.from(prev), a2]));
  };

  const startNewRound = useCallback(() => {
    if (!isoRows.length || !allTopoFeatures.length) return;
    const plan = createRoundPlan(isoRows, topoIds, excludeAlphas, 3);
    if (!plan) return;
    setRoundSeq((s) => s + 1);
    setRoundPlan(plan);
    setPlacedByCard({});
    setAnswered(false);
    setResultByCountryId({});
    setHoverCountryId(null);
    setDragTargetCountryId(null);
    setDrag(null);
  }, [isoRows, allTopoFeatures, topoIds, excludeAlphas]);

  const mapScale = !drag && hoverCountryId ? 1.03 : 1;

  const hoverCountryLabel = useMemo(() => {
    if (!hoverCountryId) return null;
    const row = byCountryCode.get(hoverCountryId);
    if (!row) return locale === "ja" ? "国を選択中" : "Select a country";
    const localized = getCountryDisplayName(row["alpha-2"], locale);
    return localized ?? row.name;
  }, [hoverCountryId, byCountryCode, locale]);

  if (loadError) {
    return <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{loadError}</div>;
  }

  if (!regionModel || !roundPlan) {
    return (
      <div className="flex min-h-[320px] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] p-6">
        <div className="h-40 w-full max-w-md animate-pulse rounded-xl bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)]" />
        <p className="text-sm text-[var(--color-muted)]">地図と国旗データを読み込み中…</p>
      </div>
    );
  }

  return (
    <div
      ref={stageRef}
      className="relative flex h-full min-h-[min(58dvh,640px)] w-full flex-1 flex-col touch-none overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_12%,transparent)] bg-[color-mix(in_srgb,var(--color-bg)_94%,white_6%)] shadow-inner"
    >
      <div className="pointer-events-none absolute right-2 top-2 z-30 md:right-3 md:top-3">
        {!answered ? (
          <button
            type="button"
            disabled={Object.keys(placedByCard).length === 0}
            onClick={submitAnswer}
            className="pointer-events-auto rounded-full border border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_92%,var(--color-bg))] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] shadow-sm transition hover:bg-[color-mix(in_srgb,var(--color-primary)_22%,transparent)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            こたえる
          </button>
        ) : (
          <button
            type="button"
            onClick={startNewRound}
            className="pointer-events-auto rounded-full border border-[color-mix(in_srgb,var(--color-primary)_35%,transparent)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--color-on-primary)] shadow-sm transition hover:opacity-95"
          >
            つぎの国
          </button>
        )}
      </div>

      <div className="relative flex min-h-0 w-full flex-1 flex-col items-center justify-center">
      <div
        className="relative mx-auto min-h-0 w-full max-w-full flex-1 origin-center transition-transform duration-300 ease-out"
        style={{ transform: `scale(${mapScale})`, width: size.w, height: size.h }}
      >
        <svg
          width={size.w}
          height={size.h}
          className="block select-none"
          role="img"
          aria-label="地域マップ"
          onPointerMove={handleSvgPointerMove}
          onPointerLeave={handleSvgLeave}
        >
          {/*
            1) fill 属性に color-mix を渡すと SVG パーサが無効扱い → #000。
            2) JS 文字列で in_srgb / var(--x)_12% と書くと CSS として無効 → やはり #000。
            style + 正しい color-mix(in srgb, …) 構文を使う。
          */}
          <rect
            width={size.w}
            height={size.h}
            style={{ fill: "color-mix(in srgb, var(--color-bg) 96%, transparent)" }}
          />
          {regionModel.allFeatures.map((f) => {
            const id = String(f.id ?? "");
            const d = regionModel.pathDById.get(id);
            if (!d) return null;
            return (
              <path
                key={id}
                d={d}
                className="transition-[fill] duration-150"
                style={{
                  fill: countryFill(id),
                  stroke: "color-mix(in srgb, var(--color-text) 18%, transparent)",
                  strokeWidth: 0.6,
                }}
              />
            );
          })}
        </svg>

        {projection &&
          cards.map((c) => {
            const cid = placedByCard[c.id];
            if (!cid || drag?.cardId === c.id) return null;
            const feat = regionModel.allFeatures.find((f) => String(f.id) === cid);
            if (!feat) return null;
            const p = projectCentroid(projection, feat as CountryFeature);
            if (!p) return null;
            return (
              <button
                key={`stuck-${c.id}`}
                type="button"
                className="pointer-events-auto absolute z-20 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-md border-2 border-white/40 bg-white/10 p-0.5 shadow-md backdrop-blur-sm active:cursor-grabbing"
                style={{ left: p[0], top: p[1], width: CARD_W, height: CARD_H }}
                onPointerDown={(e) => handleCardPointerDown(c.id, e)}
                aria-label="国旗を戻す"
              >
                <Image
                  src={flagUrlForAlpha2(c.alpha2)}
                  alt=""
                  width={CARD_W - 4}
                  height={CARD_H - 4}
                  className="pointer-events-none h-full w-full rounded object-contain"
                  draggable={false}
                  unoptimized
                />
              </button>
            );
          })}

        {drag &&
          (() => {
            const c = cards.find((x) => x.id === drag.cardId);
            if (!c) return null;
            return (
              <div
                className="pointer-events-none absolute z-40 -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-[var(--color-primary)] bg-white/90 p-0.5 shadow-xl"
                style={{ left: dragPos.x, top: dragPos.y, width: CARD_W, height: CARD_H }}
              >
                <Image
                  src={flagUrlForAlpha2(c.alpha2)}
                  alt=""
                  width={CARD_W - 4}
                  height={CARD_H - 4}
                  className="h-full w-full rounded object-contain"
                  draggable={false}
                  unoptimized
                />
              </div>
            );
          })()}

        {!answered &&
          cards.map((c) => {
            if (placedByCard[c.id] || drag?.cardId === c.id) return null;
            const fl = floatByCard[c.id];
            if (!fl) return null;
            return (
              <button
                key={c.id}
                type="button"
                className="pointer-events-auto absolute z-20 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-md border border-[color-mix(in_srgb,var(--color-text)_15%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_88%,transparent)] p-0.5 shadow-md active:cursor-grabbing"
                style={{ left: fl.x, top: fl.y, width: CARD_W, height: CARD_H }}
                onPointerDown={(e) => handleCardPointerDown(c.id, e)}
              >
                <Image
                  src={flagUrlForAlpha2(c.alpha2)}
                  alt=""
                  width={CARD_W - 4}
                  height={CARD_H - 4}
                  className="pointer-events-none rounded object-contain"
                  draggable={false}
                  unoptimized
                />
              </button>
            );
          })}
      </div>
      </div>

      {hoverCountryId && projection && !drag && (
        <div className="pointer-events-none absolute bottom-2 left-2 right-2 z-10 rounded-lg bg-[color-mix(in_srgb,var(--color-bg)_88%,transparent)] px-2 py-1 text-center text-[11px] text-[var(--color-text)] backdrop-blur-sm md:text-xs">
          {hoverCountryLabel ?? (locale === "ja" ? "国を選択中" : "Select a country")}
        </div>
      )}
    </div>
  );
}

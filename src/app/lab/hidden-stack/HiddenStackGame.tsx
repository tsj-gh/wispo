"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import { PairLinkAdSlot } from "@/components/PairLinkAdSlots";
import { GamePageHeader } from "@/components/GamePageHeader";
import { DevDebugUserStats } from "@/components/DevDebugUserStats";
import {
  GAME_AD_GAP_AFTER_SLOT_1_PX,
  GAME_AD_GAP_BEFORE_SLOT_2_PX,
  HIDDEN_STACK_INITIAL_SCROLL_TOP_FUDGE_PX,
  HIDDEN_STACK_PC_ANSWER_BAND_FALLBACK_PX,
  HIDDEN_STACK_PC_CANVAS_VERTICAL_FUDGE_PX,
  HIDDEN_STACK_PC_TOP_AD_SASH_HEIGHT_PX,
} from "@/lib/gameLayout";
import { generateHiddenStackPuzzle } from "@/lib/hidden-stack/hiddenStackPuzzle";
import { useI18n } from "@/lib/i18n-context";
import { EXTERNAL_WOOD_TEXTURE_COUNT } from "@/lib/hidden-stack/externalWoodTextures";

const EXTERNAL_WOOD_DEBUG_LABEL_KEYS = [
  "games.hiddenStack.woodTexWalnut01",
  "games.hiddenStack.woodTexWalnut02",
  "games.hiddenStack.woodTexWalnut03",
  "games.hiddenStack.woodTexOak01",
  "games.hiddenStack.woodTexOak02",
  "games.hiddenStack.woodTexOak03",
] as const;
import type {
  BlockMaterialVariant,
  CollapsePatternId,
  FeedbackSpotlightParams,
  GoldLumpParams,
  SemiGlossColorId,
} from "./HiddenStackCanvas";

const SEMI_GLOSS_COLOR_IDS = ["pink", "turquoise", "beige", "green", "mauve", "terracotta"] as const satisfies readonly SemiGlossColorId[];
const SEMI_GLOSS_COLOR_GROUP_1 = ["pink", "turquoise", "beige"] as const satisfies readonly SemiGlossColorId[];
const SEMI_GLOSS_COLOR_GROUP_2 = ["green", "mauve", "terracotta"] as const satisfies readonly SemiGlossColorId[];

const HiddenStackCanvas = dynamic(() => import("./HiddenStackCanvas"), { ssr: false });

const ICON_SLOTS = 10;
const TWIST_MAX = 15;

const DEFAULT_RESULT_MESSAGE_DELAY_MS = 500;
const DEFAULT_RESULT_MESSAGE_ORIGIN_Y_PCT = 20;
const RESULT_MESSAGE_DELAY_MS_MIN = 0;
const RESULT_MESSAGE_DELAY_MS_MAX = 2500;
const RESULT_MESSAGE_ORIGIN_Y_MIN = 15;
const RESULT_MESSAGE_ORIGIN_Y_MAX = 48;
const RESULT_MESSAGE_FONT_PX_MIN = 10;
const RESULT_MESSAGE_FONT_PX_MAX = 46;
const DEFAULT_RESULT_MESSAGE_FONT_PX = 28;
const AMBIENT_LIGHT_INTENSITY_MIN = 0;
const AMBIENT_LIGHT_INTENSITY_MAX = 1.8;
const DEFAULT_AMBIENT_LIGHT_INTENSITY = 0.7;
const WOOD_TEX_SHADOW_LIFT_MIN = 0;
const WOOD_TEX_SHADOW_LIFT_MAX = 1;
const DEFAULT_WOOD_TEX_SHADOW_LIFT = 0.7;
const WOOD_TEX_ROUGHNESS_MIN = 0.2;
const WOOD_TEX_ROUGHNESS_MAX = 1;
const DEFAULT_WOOD_TEX_ROUGHNESS = 0.9;
const WOOD_TEX_ENVMAP_INTENSITY_MIN = 0;
const WOOD_TEX_ENVMAP_INTENSITY_MAX = 3;
const DEFAULT_WOOD_TEX_ENVMAP_INTENSITY = 1.7;
const WOOD_TEX_REPEAT_SCALE_MIN = 0.05;
const WOOD_TEX_REPEAT_SCALE_MAX = 1.0;
const DEFAULT_WOOD_TEX_REPEAT_SCALE = 0.25;
const WOOD_TEX_FILL_LIGHT_MIN = 0;
const WOOD_TEX_FILL_LIGHT_MAX = 1.2;
const DEFAULT_WOOD_TEX_FILL_LIGHT = 0.8;
const WOOD_TEX_FILL_LIGHT_SECONDARY_MIN = 0;
const WOOD_TEX_FILL_LIGHT_SECONDARY_MAX = 1.2;
const DEFAULT_WOOD_TEX_FILL_LIGHT_SECONDARY = 0.9;
const WOOD_TEX_RIM_LIGHT_MIN = 0;
const WOOD_TEX_RIM_LIGHT_MAX = 1.2;
const DEFAULT_WOOD_TEX_RIM_LIGHT = 0.5;
const REVIEW_MESH_VISUAL_SCALE_MIN = 0.8;
const REVIEW_MESH_VISUAL_SCALE_MAX = 1.2;
const DEFAULT_REVIEW_MESH_VISUAL_SCALE = 1.1;
/** 正誤判定中の可視セル枠線（GhostBox）のみ。床格子は変更しない */
const FEEDBACK_VISIBLE_CELL_OUTLINE_OPACITY_MIN = 0.06;
const FEEDBACK_VISIBLE_CELL_OUTLINE_OPACITY_MAX = 0.72;
const DEFAULT_FEEDBACK_VISIBLE_CELL_OUTLINE_OPACITY = 0.1;
const GOLD_ENV_INTENSITY_MIN = 0;
const GOLD_ENV_INTENSITY_MAX = 4;
const GOLD_TEX_REPEAT_MIN = 0.1;
const GOLD_TEX_REPEAT_MAX = 1.0;
const SPOT_OVERALL_LIGHT_RATIO_MIN = 0.3;
const SPOT_OVERALL_LIGHT_RATIO_MAX = 0.8;
const SPOT_INTENSITY_MIN = 0;
const SPOT_INTENSITY_MAX = 50;
const SPOT_ANGLE_MIN = 0.1;
const SPOT_ANGLE_MAX = 1.1;
const SPOT_ANGULAR_VEL_MIN = 0.1;
/** 大きいほど1周が短い（角速度 rad/s、2π/ω で周期秒） */
const SPOT_ANGULAR_VEL_MAX = 10;
const SPOT_MOVEMENT_RANGE_MIN = 30;
const SPOT_MOVEMENT_RANGE_MAX = 1080;
const SPOT_GOLD_ENV_BOOST_MIN = 0;
const SPOT_GOLD_ENV_BOOST_MAX = 5;
const SPOT_FOLLOW_POINT_MIN = 0;
const SPOT_FOLLOW_POINT_MAX = 50;

const INTRO_FALL_TIME_SCALE_MIN = 0.35;
const INTRO_FALL_TIME_SCALE_MAX = 4;
const DEFAULT_INTRO_FALL_TIME_SCALE = 3;
const INTRO_DROP_HEIGHT_SCALE_MIN = 0.35;
const INTRO_DROP_HEIGHT_SCALE_MAX = 2.2;
const DEFAULT_INTRO_DROP_HEIGHT_SCALE = 1;
const FEEDBACK_GRAVITY_Y_MIN = 6;
const FEEDBACK_GRAVITY_Y_MAX = 28;
const DEFAULT_FEEDBACK_GRAVITY_Y = 16;
const FEEDBACK_IMPULSE_SCALE_MIN = 0.35;
const FEEDBACK_IMPULSE_SCALE_MAX = 1.8;
const DEFAULT_FEEDBACK_IMPULSE_SCALE = 1;

/** メッシュ見た目のみ（隙間対策）。HiddenStackCanvas の DEFAULT_BLOCK_MESH_VISUAL_SCALE と揃える */
const DEFAULT_BLOCK_MESH_VISUAL_SCALE = 1.03;

const KEY_LIGHT_SHADOW_YAW_MIN = -180;
const KEY_LIGHT_SHADOW_YAW_MAX = 180;
const DEFAULT_KEY_LIGHT_SHADOW_YAW_DEG = 14;

const ORTHO_ZOOM_MUL_MIN = 0.35;
const ORTHO_ZOOM_MUL_MAX = 2.4;
const DEFAULT_ORTHO_CAMERA_ZOOM_MUL = 1;
const ORTHO_ZOOM_MUL_LARGE_GRID = 1.28;
const BACK_HIGH_BIAS_WEIGHT_MIN = 0;
const BACK_HIGH_BIAS_WEIGHT_MAX = 1;
const DEFAULT_BACK_HIGH_BIAS_WEIGHT = 0.5;

const THINK_IDLE_ORBIT_SPEED_MIN = 0;
const THINK_IDLE_ORBIT_SPEED_MAX = 10;
const DEFAULT_THINK_IDLE_ORBIT_DEG_PER_SEC = 2.2;
const THINK_IDLE_ORBIT_PAUSE_MIN = 0;
const THINK_IDLE_ORBIT_PAUSE_MAX = 3.5;
const DEFAULT_THINK_IDLE_ORBIT_PAUSE_SEC = 0.55;

type Phase = "intro" | "think" | "feedback";
type StatusOverlayPhase = "hidden" | "pending" | "animating" | "docked";
type HiddenStackGrade = 1 | 2 | 3 | 4;

const GRADE_PRESETS: ReadonlyArray<{
  grade: HiddenStackGrade;
  gridSize: 3 | 4;
  backHighBiasEnabled: boolean;
  backHighBiasWeight: number;
  labelKey: "games.hiddenStack.gradeG1" | "games.hiddenStack.gradeG2" | "games.hiddenStack.gradeG3" | "games.hiddenStack.gradeG4";
}> = [
  { grade: 1, gridSize: 3, backHighBiasEnabled: false, backHighBiasWeight: DEFAULT_BACK_HIGH_BIAS_WEIGHT, labelKey: "games.hiddenStack.gradeG1" },
  { grade: 2, gridSize: 3, backHighBiasEnabled: true, backHighBiasWeight: 0.8, labelKey: "games.hiddenStack.gradeG2" },
  { grade: 3, gridSize: 4, backHighBiasEnabled: false, backHighBiasWeight: DEFAULT_BACK_HIGH_BIAS_WEIGHT, labelKey: "games.hiddenStack.gradeG3" },
  { grade: 4, gridSize: 4, backHighBiasEnabled: true, backHighBiasWeight: 0.8, labelKey: "games.hiddenStack.gradeG4" },
] as const;

export default function HiddenStackGame() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const isDevTj = searchParams.get("devtj") === "true";
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [isDebugPanelExpanded, setIsDebugPanelExpanded] = useState(true);
  const [gridSize, setGridSize] = useState(3);

  const [materialVariant, setMaterialVariant] = useState<BlockMaterialVariant>("A");
  /** 外部木目（Walnut/Oak 各3）。質感 B で使用。プレビュー用に常に保持 */
  const [externalWoodTextureIndex, setExternalWoodTextureIndex] = useState(0);
  const [semiGlossColorId, setSemiGlossColorId] = useState<SemiGlossColorId>("terracotta");
  const [collapsePattern, setCollapsePattern] = useState<CollapsePatternId>(1);
  const [goldLumpParams, setGoldLumpParams] = useState<GoldLumpParams>({
    metalness: 1,
    roughness: 0.25,
    envMapIntensity: 2.0,
    texRepeatScale: 0.25,
  });
  /** メッシュ見た目のみ（隙間対策）。物理コライダは HiddenStackCanvas 側で変更しない */
  const [blockMeshVisualScale, setBlockMeshVisualScale] = useState(DEFAULT_BLOCK_MESH_VISUAL_SCALE);
  const [reviewBlockMeshVisualScale, setReviewBlockMeshVisualScale] = useState(DEFAULT_REVIEW_MESH_VISUAL_SCALE);
  const [isWoodTexDebugExpanded, setIsWoodTexDebugExpanded] = useState(false);
  const [isSpotlightDebugExpanded, setIsSpotlightDebugExpanded] = useState(false);
  const [isGoldLumpDebugExpanded, setIsGoldLumpDebugExpanded] = useState(false);
  const [feedbackVisibleCellOutlineOpacity, setFeedbackVisibleCellOutlineOpacity] = useState(
    DEFAULT_FEEDBACK_VISIBLE_CELL_OUTLINE_OPACITY
  );
  const [introFallTimeScale, setIntroFallTimeScale] = useState(DEFAULT_INTRO_FALL_TIME_SCALE);
  const [introDropHeightScale, setIntroDropHeightScale] = useState(DEFAULT_INTRO_DROP_HEIGHT_SCALE);
  const [feedbackPhysicsGravityY, setFeedbackPhysicsGravityY] = useState(DEFAULT_FEEDBACK_GRAVITY_Y);
  const [feedbackImpulseScale, setFeedbackImpulseScale] = useState(DEFAULT_FEEDBACK_IMPULSE_SCALE);

  const [backHighBiasEnabled, setBackHighBiasEnabled] = useState(false);
  const [backHighBiasWeight, setBackHighBiasWeight] = useState(DEFAULT_BACK_HIGH_BIAS_WEIGHT);
  const [puzzle, setPuzzle] = useState(() =>
    generateHiddenStackPuzzle(`${Date.now()}`, {
      gridSize: 3,
      backHighBiasEnabled: false,
      backHighBiasWeight: DEFAULT_BACK_HIGH_BIAS_WEIGHT,
    })
  );
  const [phase, setPhase] = useState<Phase>("intro");
  const [twistDeg, setTwistDeg] = useState(0);
  const [selectedN, setSelectedN] = useState(4);
  const [feedbackKey, setFeedbackKey] = useState(0);
  const [resultLine, setResultLine] = useState<string | null>(null);
  const [isAnswerCorrect, setIsAnswerCorrect] = useState<boolean | null>(null);
  const [reviewMode, setReviewMode] = useState(false);
  /** ふりかえり中：可視ソリッド表示。オフで枠線のみ（初期はオン） */
  const [reviewShowVisibleSolids, setReviewShowVisibleSolids] = useState(true);
  /** ふりかえり時の左右スワイプ誘導（回転検知でフェードアウト、同一問題では再表示しない） */
  const [reviewSwipeHintVisible, setReviewSwipeHintVisible] = useState(false);
  const [statusMessageStyle, setStatusMessageStyle] = useState<"card" | "plain">("card");
  const [debugNormalMaterial, setDebugNormalMaterial] = useState(false);
  const [ambientLightIntensity, setAmbientLightIntensity] = useState(DEFAULT_AMBIENT_LIGHT_INTENSITY);
  const [woodTexShadowLift, setWoodTexShadowLift] = useState(DEFAULT_WOOD_TEX_SHADOW_LIFT);
  const [woodTexRoughness, setWoodTexRoughness] = useState(DEFAULT_WOOD_TEX_ROUGHNESS);
  const [woodTexEnvMapIntensity, setWoodTexEnvMapIntensity] = useState(DEFAULT_WOOD_TEX_ENVMAP_INTENSITY);
  const [woodTexRepeatScale, setWoodTexRepeatScale] = useState(DEFAULT_WOOD_TEX_REPEAT_SCALE);
  const [woodTexFillLightIntensity, setWoodTexFillLightIntensity] = useState(DEFAULT_WOOD_TEX_FILL_LIGHT);
  const [woodTexFillLightSecondaryIntensity, setWoodTexFillLightSecondaryIntensity] = useState(
    DEFAULT_WOOD_TEX_FILL_LIGHT_SECONDARY
  );
  const [woodTexRimLightIntensity, setWoodTexRimLightIntensity] = useState(DEFAULT_WOOD_TEX_RIM_LIGHT);
  const [feedbackSpotlightParams, setFeedbackSpotlightParams] = useState<FeedbackSpotlightParams>({
    overallLightRatio: 0.32,
    spotIntensity: 40,
    spotAngle: 0.5,
    angularVelocity: 2.85,
    movementRangeDeg: 360,
    goldEnvMapBoost: 1.25,
    followPointIntensity: 18.5,
  });
  const [statusOverlayPhase, setStatusOverlayPhase] = useState<StatusOverlayPhase>("hidden");
  const [resultMessageDelayMs, setResultMessageDelayMs] = useState(DEFAULT_RESULT_MESSAGE_DELAY_MS);
  const [resultMessageOriginYPercent, setResultMessageOriginYPercent] = useState(DEFAULT_RESULT_MESSAGE_ORIGIN_Y_PCT);
  const [resultMessageFontPx, setResultMessageFontPx] = useState(DEFAULT_RESULT_MESSAGE_FONT_PX);
  const [keyLightShadowYawDeg, setKeyLightShadowYawDeg] = useState(DEFAULT_KEY_LIGHT_SHADOW_YAW_DEG);
  const [orthoCameraZoomMul, setOrthoCameraZoomMul] = useState(DEFAULT_ORTHO_CAMERA_ZOOM_MUL);
  const [thinkIdleOrbitDegPerSec, setThinkIdleOrbitDegPerSec] = useState(DEFAULT_THINK_IDLE_ORBIT_DEG_PER_SEC);
  const [thinkIdleOrbitPauseSec, setThinkIdleOrbitPauseSec] = useState(DEFAULT_THINK_IDLE_ORBIT_PAUSE_SEC);
  const [seedInput, setSeedInput] = useState("");

  const dragTwistRef = useRef<{ active: boolean; lastX: number }>({ active: false, lastX: 0 });
  const lastMaterialGroupRef = useRef<-1 | 0 | 1 | 2 | 3 | 4>(-1);
  const twistDegRef = useRef(0);
  const thinkIdleOrbitRef = useRef<{ twist: number; dir: 1 | -1; pauseLeft: number }>({ twist: 0, dir: 1, pauseLeft: 0 });
  const stripRef = useRef<HTMLDivElement>(null);
  const stripPointerDownRef = useRef(false);
  const topAdRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const answerBandRef = useRef<HTMLDivElement>(null);
  const [isLgViewport, setIsLgViewport] = useState(false);
  const [answerBandHeightPx, setAnswerBandHeightPx] = useState(HIDDEN_STACK_PC_ANSWER_BAND_FALLBACK_PX);
  const activeGrade = useMemo(() => {
    const preset = GRADE_PRESETS.find(
      (g) =>
        g.gridSize === gridSize &&
        g.backHighBiasEnabled === backHighBiasEnabled &&
        Math.abs(g.backHighBiasWeight - backHighBiasWeight) < 0.005
    );
    return preset?.grade ?? null;
  }, [backHighBiasEnabled, backHighBiasWeight, gridSize]);

  const pickRandom = useCallback(<T,>(items: readonly T[]): T => {
    return items[Math.floor(Math.random() * items.length)];
  }, []);

  const applyRandomMaterialPreset = useCallback(() => {
    const choices = [0, 1, 2, 3, 4].filter((id) => id !== lastMaterialGroupRef.current);
    const bucket = choices[Math.floor(Math.random() * choices.length)] ?? 0;
    lastMaterialGroupRef.current = bucket as 0 | 1 | 2 | 3 | 4;
    if (bucket === 0) {
      setMaterialVariant("A");
      return;
    }
    if (bucket === 1) {
      setMaterialVariant("B");
      setExternalWoodTextureIndex(Math.floor(Math.random() * 3));
      return;
    }
    if (bucket === 2) {
      setMaterialVariant("B");
      setExternalWoodTextureIndex(3 + Math.floor(Math.random() * 3));
      return;
    }
    if (bucket === 3) {
      setMaterialVariant("C");
      setSemiGlossColorId(pickRandom(SEMI_GLOSS_COLOR_GROUP_1));
      return;
    }
    setMaterialVariant("C");
    setSemiGlossColorId(pickRandom(SEMI_GLOSS_COLOR_GROUP_2));
  }, [pickRandom]);

  useEffect(() => {
    stripPointerDownRef.current = false;
  }, [phase]);
  useEffect(() => {
    applyRandomMaterialPreset();
  }, [applyRandomMaterialPreset]);
  useEffect(() => {
    setOrthoCameraZoomMul(gridSize >= 4 ? ORTHO_ZOOM_MUL_LARGE_GRID : DEFAULT_ORTHO_CAMERA_ZOOM_MUL);
  }, [gridSize]);
  useEffect(() => {
    if (!seedInput) setSeedInput(puzzle.sourceSeed);
  }, [puzzle.sourceSeed, seedInput]);

  useEffect(() => {
    twistDegRef.current = twistDeg;
  }, [twistDeg]);

  useEffect(() => {
    if (phase !== "think" || thinkIdleOrbitDegPerSec <= 0.001) return;
    thinkIdleOrbitRef.current.twist = twistDegRef.current;
    let rafId = 0;
    let last = performance.now();
    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      const dt = Math.min(0.08, (now - last) / 1000);
      last = now;
      if (dragTwistRef.current.active) return;
      const o = thinkIdleOrbitRef.current;
      const speed = thinkIdleOrbitDegPerSec;
      const pause = thinkIdleOrbitPauseSec;
      if (o.pauseLeft > 0) {
        o.pauseLeft -= dt;
        if (o.pauseLeft < 0) o.pauseLeft = 0;
      } else {
        o.twist += o.dir * speed * dt;
        if (o.twist >= TWIST_MAX) {
          o.twist = TWIST_MAX;
          o.dir = -1;
          o.pauseLeft = pause;
        } else if (o.twist <= -TWIST_MAX) {
          o.twist = -TWIST_MAX;
          o.dir = 1;
          o.pauseLeft = pause;
        }
      }
      setTwistDeg(o.twist);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [phase, thinkIdleOrbitDegPerSec, thinkIdleOrbitPauseSec]);

  const answerSlots = useMemo(() => {
    return Math.max(ICON_SLOTS, Math.min(24, puzzle.hiddenCount + 4));
  }, [puzzle.hiddenCount]);

  const resetRoundStates = useCallback((nextHiddenCount: number) => {
    setPhase("intro");
    setTwistDeg(0);
    setSelectedN(Math.max(1, Math.min(Math.max(ICON_SLOTS, Math.min(24, nextHiddenCount + 4)), Math.floor((nextHiddenCount + 1) / 2))));
    setResultLine(null);
    setIsAnswerCorrect(null);
    setReviewMode(false);
    setReviewShowVisibleSolids(true);
    setStatusOverlayPhase("hidden");
    setFeedbackKey((k) => k + 1);
  }, []);

  const newRound = useCallback((nextGridSize?: number) => {
    const g = nextGridSize ?? gridSize;
    const next = generateHiddenStackPuzzle(`${Date.now()}:${Math.random().toString(36).slice(2)}`, {
      gridSize: g,
      backHighBiasEnabled,
      backHighBiasWeight,
    });
    setPuzzle(next);
    if (nextGridSize != null) setGridSize(g);
    applyRandomMaterialPreset();
    setSeedInput(next.sourceSeed);
    resetRoundStates(next.hiddenCount);
  }, [applyRandomMaterialPreset, backHighBiasEnabled, backHighBiasWeight, gridSize, resetRoundStates]);

  const generateFromSeed = useCallback(() => {
    const s = seedInput.trim();
    if (!s) return;
    const next = generateHiddenStackPuzzle(s, { gridSize, backHighBiasEnabled, backHighBiasWeight });
    setPuzzle(next);
    applyRandomMaterialPreset();
    setSeedInput(next.sourceSeed);
    resetRoundStates(next.hiddenCount);
  }, [applyRandomMaterialPreset, backHighBiasEnabled, backHighBiasWeight, gridSize, resetRoundStates, seedInput]);

  const applyGradePreset = useCallback(
    (grade: HiddenStackGrade) => {
      const preset = GRADE_PRESETS.find((g) => g.grade === grade);
      if (!preset) return;
      setGridSize(preset.gridSize);
      setBackHighBiasEnabled(preset.backHighBiasEnabled);
      setBackHighBiasWeight(preset.backHighBiasWeight);
      const next = generateHiddenStackPuzzle(`${Date.now()}:${Math.random().toString(36).slice(2)}`, {
        gridSize: preset.gridSize,
        backHighBiasEnabled: preset.backHighBiasEnabled,
        backHighBiasWeight: preset.backHighBiasWeight,
      });
      setPuzzle(next);
      applyRandomMaterialPreset();
      setSeedInput(next.sourceSeed);
      resetRoundStates(next.hiddenCount);
    },
    [applyRandomMaterialPreset, resetRoundStates]
  );

  useEffect(() => {
    setSelectedN((n) => Math.max(1, Math.min(answerSlots, n)));
  }, [answerSlots]);

  useEffect(() => {
    if (phase !== "feedback" || !resultLine) return;
    if (statusOverlayPhase !== "pending") return;
    const id = window.setTimeout(() => {
      setStatusOverlayPhase("animating");
    }, resultMessageDelayMs);
    return () => window.clearTimeout(id);
  }, [phase, resultLine, resultMessageDelayMs, statusOverlayPhase]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsLgViewport(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const scrollToTopAdSlot1 = useCallback(() => {
    if (typeof window === "undefined") return;
    const el = topAdRef.current;
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - HIDDEN_STACK_INITIAL_SCROLL_TOP_FUDGE_PX;
    window.scrollTo({ top: Math.max(0, y), left: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let previousRestoration: ScrollRestoration | undefined;
    if ("scrollRestoration" in history) {
      previousRestoration = history.scrollRestoration;
      history.scrollRestoration = "manual";
    }

    const applyAfterPaint = () => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          scrollToTopAdSlot1();
        });
      });
    };

    const onWindowLoad = () => {
      applyAfterPaint();
    };

    if (document.readyState === "complete") {
      onWindowLoad();
    } else {
      window.addEventListener("load", onWindowLoad);
    }

    return () => {
      window.removeEventListener("load", onWindowLoad);
      if (previousRestoration != null && "scrollRestoration" in history) {
        history.scrollRestoration = previousRestoration;
      }
    };
  }, [scrollToTopAdSlot1]);

  useEffect(() => {
    if (!isLgViewport) return;
    const el = answerBandRef.current;
    if (!el) return;
    const apply = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h > 0) setAnswerBandHeightPx(h);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isLgViewport, answerSlots, phase, puzzle]);

  const pcCanvasShellStyle = useMemo((): CSSProperties | undefined => {
    if (!isLgViewport) return undefined;
    const h = `calc(100vh - ${HIDDEN_STACK_PC_TOP_AD_SASH_HEIGHT_PX}px - ${answerBandHeightPx}px - ${HIDDEN_STACK_PC_CANVAS_VERTICAL_FUDGE_PX}px)`;
    return { height: h, minHeight: h };
  }, [isLgViewport, answerBandHeightPx]);

  const onIntroComplete = useCallback(() => {
    setPhase("think");
  }, []);

  const submitAnswer = useCallback(() => {
    if (phase !== "think") return;
    const ok = selectedN === puzzle.hiddenCount;
    const line = t(ok ? "games.hiddenStack.resultCorrect" : "games.hiddenStack.resultWrong").replace("{n}", String(puzzle.hiddenCount));
    setResultLine(line);
    setIsAnswerCorrect(ok);
    setReviewMode(false);
    setStatusOverlayPhase("pending");
    setPhase("feedback");
    setFeedbackKey((k) => k + 1);
  }, [phase, selectedN, puzzle.hiddenCount, t]);

  const startReview = useCallback(() => {
    if (phase !== "feedback") return;
    setReviewShowVisibleSolids(true);
    setReviewMode(true);
  }, [phase]);

  useEffect(() => {
    if (reviewMode) setReviewSwipeHintVisible(true);
    else setReviewSwipeHintVisible(false);
  }, [reviewMode]);

  useEffect(() => {
    if (!reviewMode) setReviewShowVisibleSolids(true);
  }, [reviewMode]);

  const dismissReviewSwipeHint = useCallback(() => {
    setReviewSwipeHintVisible(false);
  }, []);

  const onCanvasPointerDown = (e: React.PointerEvent) => {
    if (phase !== "think") return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragTwistRef.current = { active: true, lastX: e.clientX };
  };

  const onCanvasPointerMove = (e: React.PointerEvent) => {
    if (!dragTwistRef.current.active || phase !== "think") return;
    const dx = e.clientX - dragTwistRef.current.lastX;
    dragTwistRef.current.lastX = e.clientX;
    setTwistDeg((deg) => Math.min(TWIST_MAX, Math.max(-TWIST_MAX, deg + dx * 0.12)));
  };

  const onCanvasPointerUp = (e: React.PointerEvent) => {
    if (phase === "think" && dragTwistRef.current.active) {
      thinkIdleOrbitRef.current.twist = twistDegRef.current;
      thinkIdleOrbitRef.current.pauseLeft = 0;
    }
    dragTwistRef.current.active = false;
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const pickNFromClientX = useCallback(
    (clientX: number) => {
      const el = stripRef.current;
      if (!el || phase !== "think") return;
      const r = el.getBoundingClientRect();
      if (r.width <= 1) return;
      const x = clientX - r.left;
      const slotW = r.width / answerSlots;
      let i = Math.floor(x / slotW);
      i = Math.max(0, Math.min(answerSlots - 1, i));
      setSelectedN(i + 1);
    },
    [answerSlots, phase]
  );

  const onStripPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (phase !== "think") return;
    stripPointerDownRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    pickNFromClientX(e.clientX);
  };

  const onStripPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!stripPointerDownRef.current || phase !== "think") return;
    pickNFromClientX(e.clientX);
  };

  const onStripPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    stripPointerDownRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative isolate flex w-full flex-1 flex-col lg:min-h-0">
      {isDevTj && !isDebugMode && (
        <div className="fixed right-4 top-24 z-50">
          <button
            type="button"
            onClick={() => setIsDebugMode(true)}
            className="rounded border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_55%,var(--color-bg))] px-2 py-1 font-mono text-xs text-[var(--color-text)]"
          >
            DEBUG OFF
          </button>
        </div>
      )}
      {isDevTj && isDebugMode && (
        <div className="fixed right-4 top-24 z-50 max-h-[88vh] w-[min(100vw-2rem,280px)] overflow-y-auto rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_16%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_92%,var(--color-bg))] p-3 text-left text-xs font-mono text-[var(--color-text)] shadow-lg backdrop-blur-md">
          <div className="mb-2 flex items-center justify-between gap-2">
            {isDebugPanelExpanded && <span className="font-bold text-[var(--color-primary)]">{t("games.hiddenStack.debugPanel")}</span>}
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsDebugMode(false)}
                className="rounded border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] bg-[var(--color-primary)] px-2 py-1 text-[var(--color-on-primary)]"
              >
                DEBUG ON
              </button>
              <button
                type="button"
                onClick={() => setIsDebugPanelExpanded((v) => !v)}
                className="rounded border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] p-1 text-[var(--color-muted)]"
                aria-expanded={isDebugPanelExpanded}
              >
                {isDebugPanelExpanded ? "▲" : "▼"}
              </button>
            </div>
          </div>
          {isDebugPanelExpanded && (
            <div className="space-y-3 text-[10px] text-[var(--color-muted)]/95">
              <DevDebugUserStats />
              <div>
                <div className="mb-1 font-semibold text-[var(--color-text)]">{t("games.hiddenStack.debugMaterial")}</div>
                <div className="flex flex-wrap gap-1">
                  {(["A", "B", "C"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setMaterialVariant(v)}
                      className={`rounded px-2 py-0.5 text-[10px] border ${
                        materialVariant === v
                          ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_18%,var(--color-bg))] text-[var(--color-primary)]"
                          : "border-[color-mix(in_srgb,var(--color-text)_18%,transparent)]"
                      }`}
                    >
                      {v === "A" ? t("games.hiddenStack.matA") : v === "B" ? t("games.hiddenStack.matB") : t("games.hiddenStack.matC")}
                    </button>
                  ))}
                </div>
                <div className="mt-2">
                  <div className="mb-1 font-semibold text-[var(--color-text)]">{t("games.hiddenStack.debugExternalWoodTextures")}</div>
                  <div className="flex flex-wrap gap-1">
                    {Array.from({ length: EXTERNAL_WOOD_TEXTURE_COUNT }, (_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setExternalWoodTextureIndex(idx)}
                        className={`rounded px-2 py-0.5 text-[10px] border ${
                          externalWoodTextureIndex === idx
                            ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_18%,var(--color-bg))] text-[var(--color-primary)]"
                            : "border-[color-mix(in_srgb,var(--color-text)_18%,transparent)]"
                        }`}
                      >
                        {t(EXTERNAL_WOOD_DEBUG_LABEL_KEYS[idx])}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-2">
                  <div className="mb-1 font-semibold text-[var(--color-text)]">{t("games.hiddenStack.debugSemiGlossColors")}</div>
                  <div className="flex flex-wrap gap-1">
                    {SEMI_GLOSS_COLOR_IDS.map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setSemiGlossColorId(id)}
                        className={`rounded px-2 py-0.5 text-[10px] border ${
                          semiGlossColorId === id
                            ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_18%,var(--color-bg))] text-[var(--color-primary)]"
                            : "border-[color-mix(in_srgb,var(--color-text)_18%,transparent)]"
                        }`}
                      >
                        {id === "pink"
                          ? t("games.hiddenStack.semiGlossPink")
                          : id === "turquoise"
                            ? t("games.hiddenStack.semiGlossTurquoise")
                            : id === "beige"
                              ? t("games.hiddenStack.semiGlossBeige")
                              : id === "green"
                                ? t("games.hiddenStack.semiGlossGreen")
                                : id === "mauve"
                                  ? t("games.hiddenStack.semiGlossMauve")
                                  : t("games.hiddenStack.semiGlossTerracotta")}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <div className="mb-1 font-semibold text-[var(--color-text)]">{t("games.hiddenStack.debugBackHighBias")}</div>
                <button
                  type="button"
                  onClick={() => setBackHighBiasEnabled((v) => !v)}
                  className={`rounded px-2 py-0.5 text-[10px] border ${
                    backHighBiasEnabled
                      ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_18%,var(--color-bg))] text-[var(--color-primary)]"
                      : "border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] text-[var(--color-muted)]"
                  }`}
                >
                  {backHighBiasEnabled ? t("games.hiddenStack.debugBackHighBiasOn") : t("games.hiddenStack.debugBackHighBiasOff")}
                </button>
                <label className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugBackHighBiasWeight")}</span>
                  <input
                    type="range"
                    min={BACK_HIGH_BIAS_WEIGHT_MIN}
                    max={BACK_HIGH_BIAS_WEIGHT_MAX}
                    step={0.01}
                    value={backHighBiasWeight}
                    onChange={(e) => setBackHighBiasWeight(Number(e.target.value))}
                    className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                  />
                  <span className="tabular-nums text-[var(--color-text)]">{backHighBiasWeight.toFixed(2)}</span>
                </label>
              </div>
              <div>
                <div className="mb-1 font-semibold text-[var(--color-text)]">{t("games.hiddenStack.debugNormalProbe")}</div>
                <button
                  type="button"
                  onClick={() => setDebugNormalMaterial((v) => !v)}
                  className={`rounded px-2 py-0.5 text-[10px] border ${
                    debugNormalMaterial
                      ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_18%,var(--color-bg))] text-[var(--color-primary)]"
                      : "border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] text-[var(--color-muted)]"
                  }`}
                >
                  {debugNormalMaterial ? t("games.hiddenStack.debugNormalProbeOn") : t("games.hiddenStack.debugNormalProbeOff")}
                </button>
              </div>
              <div>
                <div className="mb-1 font-semibold text-[var(--color-text)]">{t("games.hiddenStack.debugBlockMotion")}</div>
                <label className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugIntroFallTimeScale")}</span>
                  <input
                    type="range"
                    min={INTRO_FALL_TIME_SCALE_MIN}
                    max={INTRO_FALL_TIME_SCALE_MAX}
                    step={0.05}
                    value={introFallTimeScale}
                    onChange={(e) => setIntroFallTimeScale(Number(e.target.value))}
                    className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                  />
                  <span className="tabular-nums text-[var(--color-text)]">{introFallTimeScale.toFixed(2)}×</span>
                </label>
                <label className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugIntroDropHeightScale")}</span>
                  <input
                    type="range"
                    min={INTRO_DROP_HEIGHT_SCALE_MIN}
                    max={INTRO_DROP_HEIGHT_SCALE_MAX}
                    step={0.05}
                    value={introDropHeightScale}
                    onChange={(e) => setIntroDropHeightScale(Number(e.target.value))}
                    className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                  />
                  <span className="tabular-nums text-[var(--color-text)]">{introDropHeightScale.toFixed(2)}×</span>
                </label>
                <label className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugFeedbackGravityY")}</span>
                  <input
                    type="range"
                    min={FEEDBACK_GRAVITY_Y_MIN}
                    max={FEEDBACK_GRAVITY_Y_MAX}
                    step={0.5}
                    value={feedbackPhysicsGravityY}
                    onChange={(e) => setFeedbackPhysicsGravityY(Number(e.target.value))}
                    className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                  />
                  <span className="tabular-nums text-[var(--color-text)]">{feedbackPhysicsGravityY.toFixed(1)}</span>
                </label>
                <label className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugFeedbackImpulseScale")}</span>
                  <input
                    type="range"
                    min={FEEDBACK_IMPULSE_SCALE_MIN}
                    max={FEEDBACK_IMPULSE_SCALE_MAX}
                    step={0.05}
                    value={feedbackImpulseScale}
                    onChange={(e) => setFeedbackImpulseScale(Number(e.target.value))}
                    className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                  />
                  <span className="tabular-nums text-[var(--color-text)]">{feedbackImpulseScale.toFixed(2)}×</span>
                </label>
              </div>
              <div>
                <div className="mb-1 font-semibold text-[var(--color-text)]">{t("games.hiddenStack.debugThinkPresentation")}</div>
                <label className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugKeyLightShadowYaw")}</span>
                  <input
                    type="range"
                    min={KEY_LIGHT_SHADOW_YAW_MIN}
                    max={KEY_LIGHT_SHADOW_YAW_MAX}
                    step={1}
                    value={keyLightShadowYawDeg}
                    onChange={(e) => setKeyLightShadowYawDeg(Number(e.target.value))}
                    className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                  />
                  <span className="tabular-nums text-[var(--color-text)]">{keyLightShadowYawDeg}°</span>
                </label>
                <label className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugThinkIdleOrbitSpeed")}</span>
                  <input
                    type="range"
                    min={THINK_IDLE_ORBIT_SPEED_MIN}
                    max={THINK_IDLE_ORBIT_SPEED_MAX}
                    step={0.1}
                    value={thinkIdleOrbitDegPerSec}
                    onChange={(e) => setThinkIdleOrbitDegPerSec(Number(e.target.value))}
                    className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                  />
                  <span className="tabular-nums text-[var(--color-text)]">{thinkIdleOrbitDegPerSec.toFixed(1)}°/s</span>
                </label>
                <label className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugThinkIdleOrbitPause")}</span>
                  <input
                    type="range"
                    min={THINK_IDLE_ORBIT_PAUSE_MIN}
                    max={THINK_IDLE_ORBIT_PAUSE_MAX}
                    step={0.05}
                    value={thinkIdleOrbitPauseSec}
                    onChange={(e) => setThinkIdleOrbitPauseSec(Number(e.target.value))}
                    className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                  />
                  <span className="tabular-nums text-[var(--color-text)]">{thinkIdleOrbitPauseSec.toFixed(2)}s</span>
                </label>
                <label className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugOrthoZoomMul")}</span>
                  <input
                    type="range"
                    min={ORTHO_ZOOM_MUL_MIN}
                    max={ORTHO_ZOOM_MUL_MAX}
                    step={0.01}
                    value={orthoCameraZoomMul}
                    onChange={(e) => setOrthoCameraZoomMul(Number(e.target.value))}
                    className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                  />
                  <span className="tabular-nums text-[var(--color-text)]">{orthoCameraZoomMul.toFixed(2)}×</span>
                </label>
              </div>
              <div>
                <div className="mb-1 font-semibold text-[var(--color-text)]">{t("games.hiddenStack.debugMeshCrevice")}</div>
                <label className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <input
                    type="range"
                    min={1}
                    max={1.2}
                    step={0.001}
                    value={blockMeshVisualScale}
                    onChange={(e) => setBlockMeshVisualScale(Number(e.target.value))}
                    className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                  />
                  <span className="tabular-nums text-[var(--color-text)]">{blockMeshVisualScale.toFixed(3)}×</span>
                </label>
                <label className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugReviewMeshCrevice")}</span>
                  <input
                    type="range"
                    min={REVIEW_MESH_VISUAL_SCALE_MIN}
                    max={REVIEW_MESH_VISUAL_SCALE_MAX}
                    step={0.001}
                    value={reviewBlockMeshVisualScale}
                    onChange={(e) => setReviewBlockMeshVisualScale(Number(e.target.value))}
                    className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                  />
                  <span className="tabular-nums text-[var(--color-text)]">{reviewBlockMeshVisualScale.toFixed(3)}×</span>
                </label>
              </div>
              <div>
                <div className="mb-1 font-semibold text-[var(--color-text)]">{t("games.hiddenStack.debugAmbientLight")}</div>
                <label className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <input
                    type="range"
                    min={AMBIENT_LIGHT_INTENSITY_MIN}
                    max={AMBIENT_LIGHT_INTENSITY_MAX}
                    step={0.02}
                    value={ambientLightIntensity}
                    onChange={(e) => setAmbientLightIntensity(Number(e.target.value))}
                    className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                  />
                  <span className="tabular-nums text-[var(--color-text)]">{ambientLightIntensity.toFixed(2)}</span>
                </label>
              </div>
              <div className="rounded border border-[color-mix(in_srgb,var(--color-text)_12%,transparent)] px-2 py-1">
                <button
                  type="button"
                  onClick={() => setIsSpotlightDebugExpanded((v) => !v)}
                  className="flex w-full items-center justify-between text-left"
                  aria-expanded={isSpotlightDebugExpanded}
                >
                  <span className="font-semibold text-[var(--color-text)]">{t("games.hiddenStack.debugSpotlight")}</span>
                  <span className="text-[var(--color-muted)]">{isSpotlightDebugExpanded ? "▲" : "▼"}</span>
                </button>
                {isSpotlightDebugExpanded && (
                  <div className="mt-2">
                    <label className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugFeedbackVisibleCellOutlineOpacity")}</span>
                      <input
                        type="range"
                        min={FEEDBACK_VISIBLE_CELL_OUTLINE_OPACITY_MIN}
                        max={FEEDBACK_VISIBLE_CELL_OUTLINE_OPACITY_MAX}
                        step={0.02}
                        value={feedbackVisibleCellOutlineOpacity}
                        onChange={(e) => setFeedbackVisibleCellOutlineOpacity(Number(e.target.value))}
                        className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                      />
                      <span className="tabular-nums text-[var(--color-text)]">{feedbackVisibleCellOutlineOpacity.toFixed(2)}</span>
                    </label>
                    <label className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugOverallLightRatio")}</span>
                      <input
                        type="range"
                        min={SPOT_OVERALL_LIGHT_RATIO_MIN}
                        max={SPOT_OVERALL_LIGHT_RATIO_MAX}
                        step={0.01}
                        value={feedbackSpotlightParams.overallLightRatio}
                        onChange={(e) =>
                          setFeedbackSpotlightParams((p) => ({ ...p, overallLightRatio: Number(e.target.value) }))
                        }
                        className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                      />
                      <span className="tabular-nums text-[var(--color-text)]">{feedbackSpotlightParams.overallLightRatio.toFixed(2)}</span>
                    </label>
                    <label className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugSpotlightIntensity")}</span>
                      <input
                        type="range"
                        min={SPOT_INTENSITY_MIN}
                        max={SPOT_INTENSITY_MAX}
                        step={0.1}
                        value={feedbackSpotlightParams.spotIntensity}
                        onChange={(e) => setFeedbackSpotlightParams((p) => ({ ...p, spotIntensity: Number(e.target.value) }))}
                        className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                      />
                      <span className="tabular-nums text-[var(--color-text)]">{feedbackSpotlightParams.spotIntensity.toFixed(1)}</span>
                    </label>
                    <label className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugSpotlightAngle")}</span>
                      <input
                        type="range"
                        min={SPOT_ANGLE_MIN}
                        max={SPOT_ANGLE_MAX}
                        step={0.01}
                        value={feedbackSpotlightParams.spotAngle}
                        onChange={(e) => setFeedbackSpotlightParams((p) => ({ ...p, spotAngle: Number(e.target.value) }))}
                        className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                      />
                      <span className="tabular-nums text-[var(--color-text)]">{feedbackSpotlightParams.spotAngle.toFixed(2)}</span>
                    </label>
                    <label className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugAngularVelocity")}</span>
                      <input
                        type="range"
                        min={SPOT_ANGULAR_VEL_MIN}
                        max={SPOT_ANGULAR_VEL_MAX}
                        step={0.05}
                        value={feedbackSpotlightParams.angularVelocity}
                        onChange={(e) =>
                          setFeedbackSpotlightParams((p) => ({ ...p, angularVelocity: Number(e.target.value) }))
                        }
                        className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                      />
                      <span className="tabular-nums text-[var(--color-text)]">{feedbackSpotlightParams.angularVelocity.toFixed(2)}</span>
                    </label>
                    <label className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugMovementRange")}</span>
                      <input
                        type="range"
                        min={SPOT_MOVEMENT_RANGE_MIN}
                        max={SPOT_MOVEMENT_RANGE_MAX}
                        step={10}
                        value={feedbackSpotlightParams.movementRangeDeg}
                        onChange={(e) =>
                          setFeedbackSpotlightParams((p) => ({ ...p, movementRangeDeg: Number(e.target.value) }))
                        }
                        className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                      />
                      <span className="tabular-nums text-[var(--color-text)]">{Math.round(feedbackSpotlightParams.movementRangeDeg)}deg</span>
                    </label>
                    <label className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugGoldEnvMapBoostFeedback")}</span>
                      <input
                        type="range"
                        min={SPOT_GOLD_ENV_BOOST_MIN}
                        max={SPOT_GOLD_ENV_BOOST_MAX}
                        step={0.05}
                        value={feedbackSpotlightParams.goldEnvMapBoost}
                        onChange={(e) =>
                          setFeedbackSpotlightParams((p) => ({ ...p, goldEnvMapBoost: Number(e.target.value) }))
                        }
                        className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                      />
                      <span className="tabular-nums text-[var(--color-text)]">{feedbackSpotlightParams.goldEnvMapBoost.toFixed(2)}</span>
                    </label>
                    <label className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugFollowPointIntensity")}</span>
                      <input
                        type="range"
                        min={SPOT_FOLLOW_POINT_MIN}
                        max={SPOT_FOLLOW_POINT_MAX}
                        step={0.5}
                        value={feedbackSpotlightParams.followPointIntensity}
                        onChange={(e) =>
                          setFeedbackSpotlightParams((p) => ({ ...p, followPointIntensity: Number(e.target.value) }))
                        }
                        className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                      />
                      <span className="tabular-nums text-[var(--color-text)]">{feedbackSpotlightParams.followPointIntensity.toFixed(1)}</span>
                    </label>
                  </div>
                )}
              </div>
              <div className="rounded border border-[color-mix(in_srgb,var(--color-text)_12%,transparent)] px-2 py-1">
                <button
                  type="button"
                  onClick={() => setIsWoodTexDebugExpanded((v) => !v)}
                  className="flex w-full items-center justify-between text-left"
                  aria-expanded={isWoodTexDebugExpanded}
                >
                  <span className="font-semibold text-[var(--color-text)]">{t("games.hiddenStack.debugWoodTexSection")}</span>
                  <span className="text-[var(--color-muted)]">{isWoodTexDebugExpanded ? "▲" : "▼"}</span>
                </button>
                {isWoodTexDebugExpanded && (
                  <div className="mt-2">
                    <label className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugWoodTexShadowLift")}</span>
                      <input
                        type="range"
                        min={WOOD_TEX_SHADOW_LIFT_MIN}
                        max={WOOD_TEX_SHADOW_LIFT_MAX}
                        step={0.02}
                        value={woodTexShadowLift}
                        onChange={(e) => setWoodTexShadowLift(Number(e.target.value))}
                        className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                      />
                      <span className="tabular-nums text-[var(--color-text)]">{woodTexShadowLift.toFixed(2)}</span>
                    </label>
                    <label className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugWoodTexRoughness")}</span>
                      <input
                        type="range"
                        min={WOOD_TEX_ROUGHNESS_MIN}
                        max={WOOD_TEX_ROUGHNESS_MAX}
                        step={0.02}
                        value={woodTexRoughness}
                        onChange={(e) => setWoodTexRoughness(Number(e.target.value))}
                        className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                      />
                      <span className="tabular-nums text-[var(--color-text)]">{woodTexRoughness.toFixed(2)}</span>
                    </label>
                    <label className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugWoodTexEnvMap")}</span>
                      <input
                        type="range"
                        min={WOOD_TEX_ENVMAP_INTENSITY_MIN}
                        max={WOOD_TEX_ENVMAP_INTENSITY_MAX}
                        step={0.05}
                        value={woodTexEnvMapIntensity}
                        onChange={(e) => setWoodTexEnvMapIntensity(Number(e.target.value))}
                        className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                      />
                      <span className="tabular-nums text-[var(--color-text)]">{woodTexEnvMapIntensity.toFixed(2)}</span>
                    </label>
                    <label className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugWoodTexScale")}</span>
                      <input
                        type="range"
                        min={WOOD_TEX_REPEAT_SCALE_MIN}
                        max={WOOD_TEX_REPEAT_SCALE_MAX}
                        step={0.05}
                        value={woodTexRepeatScale}
                        onChange={(e) => setWoodTexRepeatScale(Number(e.target.value))}
                        className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                      />
                      <span className="tabular-nums text-[var(--color-text)]">{woodTexRepeatScale.toFixed(2)}</span>
                    </label>
                    <label className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugWoodTexFillLight")}</span>
                      <input
                        type="range"
                        min={WOOD_TEX_FILL_LIGHT_MIN}
                        max={WOOD_TEX_FILL_LIGHT_MAX}
                        step={0.02}
                        value={woodTexFillLightIntensity}
                        onChange={(e) => setWoodTexFillLightIntensity(Number(e.target.value))}
                        className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                      />
                      <span className="tabular-nums text-[var(--color-text)]">{woodTexFillLightIntensity.toFixed(2)}</span>
                    </label>
                    <label className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugWoodTexFillLight2")}</span>
                      <input
                        type="range"
                        min={WOOD_TEX_FILL_LIGHT_SECONDARY_MIN}
                        max={WOOD_TEX_FILL_LIGHT_SECONDARY_MAX}
                        step={0.02}
                        value={woodTexFillLightSecondaryIntensity}
                        onChange={(e) => setWoodTexFillLightSecondaryIntensity(Number(e.target.value))}
                        className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                      />
                      <span className="tabular-nums text-[var(--color-text)]">{woodTexFillLightSecondaryIntensity.toFixed(2)}</span>
                    </label>
                    <label className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugWoodTexRimLight")}</span>
                      <input
                        type="range"
                        min={WOOD_TEX_RIM_LIGHT_MIN}
                        max={WOOD_TEX_RIM_LIGHT_MAX}
                        step={0.02}
                        value={woodTexRimLightIntensity}
                        onChange={(e) => setWoodTexRimLightIntensity(Number(e.target.value))}
                        className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                      />
                      <span className="tabular-nums text-[var(--color-text)]">{woodTexRimLightIntensity.toFixed(2)}</span>
                    </label>
                  </div>
                )}
              </div>
              <div>
                <div className="mb-1 font-semibold text-[var(--color-text)]">{t("games.hiddenStack.debugResultMessageTiming")}</div>
                <label className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugResultMessageDelay")}</span>
                  <input
                    type="range"
                    min={RESULT_MESSAGE_DELAY_MS_MIN}
                    max={RESULT_MESSAGE_DELAY_MS_MAX}
                    step={50}
                    value={resultMessageDelayMs}
                    onChange={(e) => setResultMessageDelayMs(Number(e.target.value))}
                    className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                  />
                  <span className="tabular-nums text-[var(--color-text)]">{resultMessageDelayMs}ms</span>
                </label>
                <label className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugResultMessageOriginY")}</span>
                  <input
                    type="range"
                    min={RESULT_MESSAGE_ORIGIN_Y_MIN}
                    max={RESULT_MESSAGE_ORIGIN_Y_MAX}
                    step={1}
                    value={resultMessageOriginYPercent}
                    onChange={(e) => setResultMessageOriginYPercent(Number(e.target.value))}
                    className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                  />
                  <span className="tabular-nums text-[var(--color-text)]">{resultMessageOriginYPercent}%</span>
                </label>
                <label className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugResultMessageFontSize")}</span>
                  <input
                    type="range"
                    min={RESULT_MESSAGE_FONT_PX_MIN}
                    max={RESULT_MESSAGE_FONT_PX_MAX}
                    step={1}
                    value={resultMessageFontPx}
                    onChange={(e) => setResultMessageFontPx(Number(e.target.value))}
                    className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                  />
                  <span className="tabular-nums text-[var(--color-text)]">{resultMessageFontPx}px</span>
                </label>
              </div>
              <div>
                <div className="mb-1 font-semibold text-[var(--color-text)]">{t("games.hiddenStack.debugStatusStyle")}</div>
                <div className="flex flex-wrap gap-1">
                  {(["card", "plain"] as const).map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setStatusMessageStyle(style)}
                      className={`rounded px-2 py-0.5 text-[10px] border ${
                        statusMessageStyle === style
                          ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_18%,var(--color-bg))] text-[var(--color-primary)]"
                          : "border-[color-mix(in_srgb,var(--color-text)_18%,transparent)]"
                      }`}
                    >
                      {style === "card" ? t("games.hiddenStack.statusStyleCard") : t("games.hiddenStack.statusStylePlain")}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded border border-[color-mix(in_srgb,var(--color-text)_12%,transparent)] px-2 py-1">
                <button
                  type="button"
                  onClick={() => setIsGoldLumpDebugExpanded((v) => !v)}
                  className="flex w-full items-center justify-between text-left"
                  aria-expanded={isGoldLumpDebugExpanded}
                >
                  <span className="font-semibold text-[var(--color-text)]">{t("games.hiddenStack.debugGoldLump")}</span>
                  <span className="text-[var(--color-muted)]">{isGoldLumpDebugExpanded ? "▲" : "▼"}</span>
                </button>
                {isGoldLumpDebugExpanded && (
                  <div className="mt-2 space-y-2">
                    <label className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugGoldMetalness")}</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={goldLumpParams.metalness}
                        onChange={(e) => setGoldLumpParams((p) => ({ ...p, metalness: Number(e.target.value) }))}
                        className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                      />
                      <span className="tabular-nums text-[var(--color-text)]">{goldLumpParams.metalness.toFixed(2)}</span>
                    </label>
                    <label className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugGoldRoughness")}</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={goldLumpParams.roughness}
                        onChange={(e) => setGoldLumpParams((p) => ({ ...p, roughness: Number(e.target.value) }))}
                        className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                      />
                      <span className="tabular-nums text-[var(--color-text)]">{goldLumpParams.roughness.toFixed(2)}</span>
                    </label>
                    <label className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugGoldEnvMapIntensity")}</span>
                      <input
                        type="range"
                        min={GOLD_ENV_INTENSITY_MIN}
                        max={GOLD_ENV_INTENSITY_MAX}
                        step={0.05}
                        value={goldLumpParams.envMapIntensity}
                        onChange={(e) => setGoldLumpParams((p) => ({ ...p, envMapIntensity: Number(e.target.value) }))}
                        className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                      />
                      <span className="tabular-nums text-[var(--color-text)]">{goldLumpParams.envMapIntensity.toFixed(2)}</span>
                    </label>
                    <label className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugGoldTexScale")}</span>
                      <input
                        type="range"
                        min={GOLD_TEX_REPEAT_MIN}
                        max={GOLD_TEX_REPEAT_MAX}
                        step={0.05}
                        value={goldLumpParams.texRepeatScale}
                        onChange={(e) => setGoldLumpParams((p) => ({ ...p, texRepeatScale: Number(e.target.value) }))}
                        className="min-w-[120px] flex-1 accent-[var(--color-primary)]"
                      />
                      <span className="tabular-nums text-[var(--color-text)]">{goldLumpParams.texRepeatScale.toFixed(2)}</span>
                    </label>
                  </div>
                )}
              </div>
              <div>
                <div className="mb-1 font-semibold text-[var(--color-text)]">{t("games.hiddenStack.debugCollapse")}</div>
                <div className="flex flex-wrap gap-1">
                  {([1, 2, 3] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setCollapsePattern(p)}
                      className={`rounded px-2 py-0.5 text-[10px] border ${
                        collapsePattern === p
                          ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_18%,var(--color-bg))] text-[var(--color-primary)]"
                          : "border-[color-mix(in_srgb,var(--color-text)_18%,transparent)]"
                      }`}
                    >
                      {p === 1 ? t("games.hiddenStack.pat1") : p === 2 ? t("games.hiddenStack.pat2") : t("games.hiddenStack.pat3")}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1 font-semibold text-[var(--color-text)]">
                  {t("games.hiddenStack.debugGridSize")}: <span className="tabular-nums">{gridSize}</span>
                </div>
                <input
                  type="range"
                  min={3}
                  max={5}
                  step={1}
                  value={gridSize}
                  onChange={(e) => {
                    const g = Number(e.target.value);
                    if (!Number.isFinite(g)) return;
                    newRound(Math.max(3, Math.min(5, Math.floor(g))));
                  }}
                  className="w-full accent-[var(--color-primary)]"
                />
              </div>
              <div className="rounded border border-[color-mix(in_srgb,var(--color-text)_12%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_05%,var(--color-bg))] px-2 py-1.5 text-[var(--color-text)]">
                {t("games.hiddenStack.debugHiddenLabel")}: <span className="font-bold tabular-nums text-[var(--color-primary)]">{puzzle.hiddenCount}</span>
              </div>
              <div className="space-y-1.5 rounded border border-[color-mix(in_srgb,var(--color-text)_12%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_05%,var(--color-bg))] px-2 py-2 text-[10px]">
                <div className="flex items-center gap-1">
                  <span className="shrink-0 text-[var(--color-muted)]">{t("games.hiddenStack.debugCurrentSeed")}</span>
                  <code className="truncate rounded bg-[color-mix(in_srgb,var(--color-text)_06%,var(--color-bg))] px-1 text-[var(--color-text)]" title={puzzle.sourceSeed}>
                    {puzzle.sourceSeed}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(puzzle.sourceSeed).catch(() => {});
                    }}
                    className="ml-auto rounded border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_10%,transparent)] px-1.5 py-0.5 text-[9px]"
                  >
                    {t("games.hiddenStack.debugCopy")}
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={seedInput}
                    onChange={(e) => setSeedInput(e.target.value)}
                    placeholder={t("games.hiddenStack.debugSeedInputPlaceholder")}
                    className="min-w-0 flex-1 rounded border border-[color-mix(in_srgb,var(--color-text)_16%,transparent)] bg-[color-mix(in_srgb,var(--color-bg)_82%,transparent)] px-2 py-1 text-[10px] text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
                  />
                  <button
                    type="button"
                    onClick={generateFromSeed}
                    disabled={!seedInput.trim()}
                    className="rounded border border-[color-mix(in_srgb,var(--color-primary)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_12%,var(--color-bg))] px-2 py-1 text-[10px] text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t("games.hiddenStack.debugGenerateFromSeed")}
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => newRound()}
                className="w-full rounded border border-[color-mix(in_srgb,var(--color-primary)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_12%,var(--color-bg))] py-1.5 text-[11px] text-[var(--color-primary)]"
              >
                {t("games.hiddenStack.debugNewRound")}
              </button>
            </div>
          )}
        </div>
      )}

      <div ref={headerRef} className="mx-auto w-full max-w-[min(100%,1080px)] shrink-0 px-4 pt-0 md:pt-1 lg:px-6 lg:pt-0">
        <GamePageHeader
          titleEn="Hidden Stack"
          titleJa={t("games.hiddenStack.titleJa")}
          breadcrumbs={[
            { label: "ホーム", href: "/" },
            { label: "教材一覧", href: "/#lab-cards" },
            { label: "Hidden Stack", href: "/lab/hidden-stack" },
          ]}
          className="mb-3 md:mb-4"
        />
      </div>

      <div
        ref={topAdRef}
        className="relative left-1/2 w-screen max-w-[100vw] shrink-0 -translate-x-1/2 lg:left-0 lg:w-full lg:translate-x-0"
        style={{ marginBottom: GAME_AD_GAP_AFTER_SLOT_1_PX }}
      >
        <div
          className="mx-auto flex w-full max-w-[min(100%,1200px)] min-h-0 items-center justify-center px-2 sm:px-3 lg:min-h-[var(--hs-ad)] lg:max-h-[var(--hs-ad)] lg:px-4"
          style={{ ["--hs-ad" as string]: `${HIDDEN_STACK_PC_TOP_AD_SASH_HEIGHT_PX}px` } as CSSProperties}
        >
          <PairLinkAdSlot slotIndex={1} />
        </div>
      </div>

      <div className="flex h-auto min-h-0 w-full flex-1 flex-col gap-3 px-4 pb-3 pt-1 lg:min-h-0 lg:flex-row lg:items-stretch lg:gap-6 lg:px-6 lg:pb-4 lg:pt-0">
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col lg:min-h-0 lg:flex-[1_1_0%] lg:overflow-hidden">
          <section className="relative flex h-auto w-full min-h-[280px] flex-1 flex-col overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[var(--color-surface)] shadow-inner lg:min-h-0 lg:flex-1">
            <div
              className={`relative min-h-0 w-full flex-1 overflow-hidden rounded-2xl bg-[#f1f5f9] lg:min-h-0 ${isLgViewport ? "lg:flex-none" : ""}`}
              style={pcCanvasShellStyle}
              onPointerDown={onCanvasPointerDown}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={onCanvasPointerUp}
              onPointerCancel={onCanvasPointerUp}
              onPointerLeave={onCanvasPointerUp}
            >
                <div className="absolute inset-0 min-h-0">
                  <HiddenStackCanvas
                    phase={phase}
                    puzzle={puzzle}
                    twistDeg={twistDeg}
                    materialVariant={materialVariant}
                    collapsePattern={collapsePattern}
                    onIntroComplete={onIntroComplete}
                    feedbackKey={feedbackKey}
                    goldLumpParams={goldLumpParams}
                    blockMeshVisualScale={blockMeshVisualScale}
                    reviewBlockMeshVisualScale={reviewBlockMeshVisualScale}
                    reviewMode={reviewMode}
                    reviewShowVisibleSolids={reviewShowVisibleSolids}
                    reviewAzimuthHintLimitDeg={TWIST_MAX}
                    onReviewAzimuthHintThresholdExceeded={dismissReviewSwipeHint}
                    feedbackAnswerCorrect={isAnswerCorrect}
                    debugNormalMaterial={debugNormalMaterial}
                    externalWoodTextureIndex={externalWoodTextureIndex}
                    semiGlossColorId={semiGlossColorId}
                    ambientLightIntensity={ambientLightIntensity}
                    woodTexShadowLift={woodTexShadowLift}
                    woodTexRoughness={woodTexRoughness}
                    woodTexEnvMapIntensity={woodTexEnvMapIntensity}
                    woodTexRepeatScale={woodTexRepeatScale}
                    woodTexFillLightIntensity={woodTexFillLightIntensity}
                    woodTexFillLightSecondaryIntensity={woodTexFillLightSecondaryIntensity}
                    woodTexRimLightIntensity={woodTexRimLightIntensity}
                    feedbackSpotlightParams={feedbackSpotlightParams}
                    feedbackVisibleCellOutlineOpacity={feedbackVisibleCellOutlineOpacity}
                    introFallTimeScale={introFallTimeScale}
                    introDropHeightScale={introDropHeightScale}
                    feedbackPhysicsGravityY={feedbackPhysicsGravityY}
                    feedbackImpulseScale={feedbackImpulseScale}
                    keyLightShadowYawDeg={keyLightShadowYawDeg}
                    orthoCameraZoomMul={orthoCameraZoomMul}
                  />
                </div>
                {phase === "feedback" && reviewMode && (
                  <div
                    className={`pointer-events-none absolute bottom-3 left-3 z-[52] flex justify-start transition-opacity duration-500 ease-out max-lg:bottom-2 max-lg:left-2 ${
                      reviewSwipeHintVisible ? "opacity-100" : "opacity-0"
                    }`}
                    aria-hidden
                  >
                    <div className="origin-bottom-left scale-[0.72] rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_14%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_94%,var(--color-bg))] px-2 py-1.5 shadow-sm backdrop-blur-sm max-lg:scale-[0.62]">
                      <svg
                        className="hs-review-swipe-hint__svg text-[var(--color-text)]"
                        width={100}
                        height={34}
                        viewBox="0 0 120 40"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <g className="hs-review-swipe-hint__motion">
                          <path d="M6 20 L14 12 L14 28 Z" fill="currentColor" fillOpacity={0.32} />
                          <path d="M114 20 L106 12 L106 28 Z" fill="currentColor" fillOpacity={0.32} />
                          <rect x="50" y="10" width="20" height="22" rx="7" fill="currentColor" fillOpacity={0.88} />
                          <circle cx="60" cy="16" r="4" fill="var(--color-bg)" fillOpacity={0.35} />
                          <path
                            d="M56 8 L60 4 L64 8"
                            stroke="currentColor"
                            strokeWidth={1.6}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeOpacity={0.45}
                          />
                        </g>
                      </svg>
                    </div>
                  </div>
                )}
                {phase === "feedback" && resultLine && (statusOverlayPhase === "animating" || statusOverlayPhase === "docked") && (
                  <div
                    className={`result-message hs-status-overlay ${
                      statusOverlayPhase === "animating" ? "hs-status-overlay--animating" : "hs-status-overlay--docked"
                    } ${isAnswerCorrect ? "hs-status-overlay--ok" : "hs-status-overlay--ng"} ${
                      statusMessageStyle === "plain" ? "hs-status-overlay--plain" : ""
                    } ${statusOverlayPhase === "docked" && reviewMode ? "hs-status-overlay--docked-with-review" : ""}`}
                    style={{
                      ["--hs-result-origin-y" as string]: `${resultMessageOriginYPercent}%`,
                    }}
                    onAnimationEnd={() => {
                      if (statusOverlayPhase === "animating") setStatusOverlayPhase("docked");
                    }}
                  >
                    <p
                      className="m-0 font-bold"
                      style={
                        isLgViewport
                          ? { fontSize: `${resultMessageFontPx}px` }
                          : { fontSize: "clamp(0.66rem, 3.25vw, 0.92rem)" }
                      }
                    >
                      {isAnswerCorrect ? (
                        resultLine
                      ) : (
                        <>
                          {t("games.hiddenStack.resultWrongLead")}
                          <span className="ml-1 font-black">{t("games.hiddenStack.resultWrong").replace("{n}", String(puzzle.hiddenCount))}</span>
                        </>
                      )}
                    </p>
                    {statusOverlayPhase === "docked" && reviewMode && (
                      <button
                        type="button"
                        onClick={() => setReviewShowVisibleSolids((v) => !v)}
                        className="pointer-events-auto mt-1.5 w-full max-w-[min(100%,14rem)] shrink-0 rounded-full border border-[color-mix(in_srgb,var(--color-text)_24%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_88%,var(--color-bg))] px-3 py-1.5 text-xs font-bold text-[var(--color-text)]"
                        aria-pressed={reviewShowVisibleSolids}
                      >
                        {reviewShowVisibleSolids ? t("games.hiddenStack.reviewBlocksOn") : t("games.hiddenStack.reviewBlocksOff")}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div
                ref={answerBandRef}
                className="z-40 w-full shrink-0 border-t border-[color-mix(in_srgb,var(--color-text)_12%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_96%,var(--color-bg))] px-3 pb-[max(env(safe-area-inset-bottom),8px)] pt-1.5 backdrop-blur-md lg:mt-auto"
              >
                <div className="mx-auto flex w-full max-w-[520px] flex-col gap-1.5 lg:mx-0 lg:max-w-none">
                  <div className="flex w-full min-w-0 flex-nowrap items-center justify-between gap-2 lg:min-h-[44px] lg:justify-center lg:gap-x-4">
                    {phase === "feedback" && !reviewMode && (
                      <button
                        type="button"
                        onClick={startReview}
                        className="shrink-0 rounded-full border border-[color-mix(in_srgb,var(--color-text)_24%,transparent)] bg-transparent px-3 py-2 text-xs font-bold text-[var(--color-text)] max-lg:max-w-[5.5rem] max-lg:truncate sm:px-5 sm:text-sm"
                      >
                        {t("games.hiddenStack.review")}
                      </button>
                    )}
                    <div className="flex min-w-0 flex-1 items-baseline justify-center gap-2 sm:gap-2.5 lg:gap-3">
                      {phase === "think" && (
                        <span className="min-w-0 max-w-[min(58vw,13rem)] shrink truncate text-left text-sm font-bold leading-tight text-[var(--color-text)] sm:max-w-none sm:shrink-0 sm:truncate sm:text-base lg:max-w-none lg:text-[1.05rem]">
                          {t("games.hiddenStack.thinkHiddenCountLead")}
                        </span>
                      )}
                      <div className="grid w-[3.25ch] min-w-[3.25ch] max-w-[3.25ch] shrink-0 place-items-center text-center tabular-nums sm:w-[3.5ch] sm:min-w-[3.5ch] sm:max-w-[3.5ch]">
                        <span className="text-2xl font-black tabular-nums leading-none text-[var(--color-text)] sm:text-3xl lg:text-[1.65rem]">
                          {selectedN}
                        </span>
                      </div>
                    </div>
                    {phase === "feedback" ? (
                      <button
                        type="button"
                        onClick={() => newRound()}
                        className="hs-cta-pulse shrink-0 rounded-full bg-[var(--color-primary)] px-4 py-2 text-xs font-bold text-[var(--color-on-primary)] sm:px-6 sm:text-base"
                      >
                        {t("games.hiddenStack.nextRound")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={submitAnswer}
                        disabled={phase !== "think"}
                        className={`shrink-0 rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-black text-[var(--color-on-primary)] disabled:opacity-40 sm:px-6 sm:text-base ${
                          phase === "think" ? "hs-cta-pulse" : ""
                        }`}
                      >
                        {t("games.hiddenStack.submit")}
                      </button>
                    )}
                  </div>
                  <div className="mx-auto flex w-full max-w-[min(100%,420px)] justify-center px-1 lg:max-w-full">
                    <div
                      className={`box-border inline-flex h-9 max-w-full shrink-0 items-center gap-1 overflow-x-auto rounded-2xl border-2 border-[color-mix(in_srgb,var(--color-text)_16%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_92%,var(--color-bg))] p-1 sm:h-10 ${
                        phase === "feedback" || reviewMode ? "pointer-events-none opacity-45" : ""
                      }`}
                      style={{ WebkitOverflowScrolling: "touch" }}
                    >
                      <div
                        ref={stripRef}
                        role="slider"
                        aria-valuemin={1}
                        aria-valuemax={answerSlots}
                        aria-valuenow={selectedN}
                        aria-label={t("games.hiddenStack.sliderAria").replace("{max}", String(answerSlots))}
                        className="flex h-full min-h-0 shrink-0 touch-none select-none gap-1"
                        style={{ touchAction: "none" }}
                        onPointerDown={onStripPointerDown}
                        onPointerMove={onStripPointerMove}
                        onPointerUp={onStripPointerEnd}
                        onPointerCancel={onStripPointerEnd}
                        onLostPointerCapture={() => {
                          stripPointerDownRef.current = false;
                        }}
                      >
                        {Array.from({ length: answerSlots }, (_, i) => {
                          const n = i + 1;
                          const lit = n <= selectedN;
                          return (
                            <div
                              key={n}
                              className={`flex aspect-square h-full min-h-0 shrink-0 items-center justify-center rounded-xl border transition-transform duration-150 ${
                                lit
                                  ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_28%,var(--color-bg))] shadow-[0_0_10px_color-mix(in_srgb,var(--color-primary)_30%,transparent)]"
                                  : "border-[color-mix(in_srgb,var(--color-text)_14%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_05%,var(--color-bg))]"
                              }`}
                            >
                              <span
                                className={`flex size-[85%] max-h-full max-w-full items-center justify-center text-[clamp(1.1rem,5.5vmin,1.85rem)] leading-none sm:text-[clamp(1.2rem,5vmin,2rem)] lg:text-[clamp(1.05rem,4.2vmin,1.75rem)] ${
                                  lit ? "scale-105 drop-shadow-sm" : "opacity-40 grayscale"
                                }`}
                                aria-hidden
                              >
                                💎
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <aside className="order-2 flex w-full shrink-0 flex-col lg:order-none lg:min-h-0 lg:w-[min(360px,35%)] lg:max-w-[35%] lg:flex-[0_1_auto] lg:self-start lg:overflow-y-auto lg:overflow-x-hidden lg:overscroll-y-contain">
            <div className="mt-1 flex w-full flex-col gap-2 lg:mt-0">
              <div className="rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] px-3 py-2 text-[var(--color-text)] lg:hidden">
                <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">{t("games.hiddenStack.chooseGrade")}</label>
                <div
                  className="flex w-full min-w-0 gap-2 overflow-x-auto py-1 [scrollbar-width:none] [-ms-overflow-style:none] snap-x snap-mandatory [&::-webkit-scrollbar]:[display:none]"
                  style={{ WebkitOverflowScrolling: "touch" }}
                >
                  {GRADE_PRESETS.map(({ grade, labelKey }) => {
                    const isActive = activeGrade === grade;
                    return (
                      <button
                        key={grade}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => applyGradePreset(grade)}
                        className={`min-h-[44px] shrink-0 snap-center touch-manipulation whitespace-nowrap rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                          isActive
                            ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-on-primary)]"
                            : "border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_78%,var(--color-bg))] text-[var(--color-text)] hover:bg-[color-mix(in_srgb,var(--color-text)_70%,var(--color-bg))]"
                        }`}
                      >
                        {t(labelKey)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <details className="rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] text-[var(--color-text)] lg:hidden">
                <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-[var(--color-text)]">
                  {t("games.hiddenStack.howToTitle")}
                </summary>
                <div className="border-t border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] px-3 pb-3 pt-2 text-xs leading-relaxed text-[var(--color-muted)]">
                  <p className="m-0">{t("games.hiddenStack.howToBody")}</p>
                </div>
              </details>

              <div className="mt-1 hidden w-full flex-col gap-2 lg:mt-0 lg:flex lg:shrink-0">
                <section className="rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] px-3 py-2">
                  <h3 className="text-sm font-semibold text-[var(--color-text)]">{t("games.hiddenStack.howToTitle")}</h3>
                  <p className="mt-2 m-0 text-xs leading-relaxed text-[var(--color-muted)]">{t("games.hiddenStack.howToBody")}</p>
                </section>
                <section className="rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] px-3 py-2">
                  <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">{t("games.hiddenStack.chooseGrade")}</label>
                  <div className="flex flex-wrap gap-2">
                    {GRADE_PRESETS.map(({ grade, labelKey }) => {
                      const isActive = activeGrade === grade;
                      return (
                        <button
                          key={grade}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() => applyGradePreset(grade)}
                          className={`min-h-[40px] rounded-lg border px-3 py-2 text-xs font-medium transition-colors sm:text-sm ${
                            isActive
                              ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-on-primary)]"
                              : "border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_78%,var(--color-bg))] text-[var(--color-text)] hover:bg-[color-mix(in_srgb,var(--color-text)_70%,var(--color-bg))]"
                          }`}
                        >
                          {t(labelKey)}
                        </button>
                      );
                    })}
                  </div>
                </section>
              </div>
            </div>

            <div className="relative z-0 w-full shrink-0" style={{ marginTop: `${GAME_AD_GAP_BEFORE_SLOT_2_PX}px` }}>
              <PairLinkAdSlot slotIndex={2} />
            </div>
          </aside>
        </div>
      <style jsx>{`
        .hs-status-overlay {
          position: absolute;
          left: 50%;
          top: var(--hs-result-origin-y, 20%);
          z-index: 60;
          pointer-events: none;
          border-radius: 12px;
          border: 1px solid color-mix(in srgb, var(--color-text) 16%, transparent);
          background: rgba(255, 255, 255, 0.95);
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.2);
          padding: 8px 14px;
          white-space: nowrap;
          transform: translate(-50%, -50%) scale(0);
          opacity: 0;
        }
        .hs-status-overlay--plain {
          box-shadow: none;
          background: rgba(255, 255, 255, 0.88);
        }
        .hs-status-overlay--ok {
          color: #166534;
          border-color: rgba(34, 197, 94, 0.45);
          background: rgba(240, 253, 244, 0.95);
        }
        .hs-status-overlay--ng {
          color: #b91c1c;
          border-color: rgba(239, 68, 68, 0.5);
          background: rgba(254, 242, 242, 0.95);
        }
        .hs-status-overlay--animating {
          animation: hs-pop-and-slide 1450ms cubic-bezier(0.22, 0.9, 0.31, 1) forwards;
        }
        .hs-status-overlay--docked {
          left: auto;
          top: 20px;
          right: 20px;
          transform: scale(0.8);
          transform-origin: top right;
          opacity: 1;
        }
        .hs-status-overlay--docked-with-review {
          display: flex;
          flex-direction: column;
          align-items: center;
          pointer-events: auto;
          white-space: normal;
        }
        .hs-status-overlay--docked-with-review > p {
          pointer-events: none;
          white-space: nowrap;
        }
        @media (max-width: 1023px) {
          .hs-status-overlay--docked {
            top: max(6px, env(safe-area-inset-top, 0px));
            right: max(6px, env(safe-area-inset-right, 0px));
            padding: 5px 9px;
            transform: scale(0.68);
          }
        }
        .hs-review-swipe-hint__svg {
          display: block;
        }
        .hs-review-swipe-hint__motion {
          animation: hs-review-swipe-x 1.35s ease-in-out infinite;
        }
        @keyframes hs-review-swipe-x {
          0%,
          100% {
            transform: translateX(-6px);
          }
          50% {
            transform: translateX(6px);
          }
        }
        .hs-cta-pulse {
          animation: hs-cta-heartbeat 2.65s ease-in-out infinite;
        }
        @keyframes hs-cta-heartbeat {
          0%,
          82%,
          100% {
            transform: scale(1);
          }
          86% {
            transform: scale(1.07);
          }
          90% {
            transform: scale(1);
          }
          94% {
            transform: scale(1.035);
          }
          98% {
            transform: scale(1);
          }
        }
        @keyframes hs-pop-and-slide {
          0% {
            left: 50%;
            top: var(--hs-result-origin-y, 20%);
            transform: translate(-50%, -50%) scale(0);
            opacity: 0;
          }
          20% {
            left: 50%;
            top: var(--hs-result-origin-y, 20%);
            transform: translate(-50%, -50%) scale(1.2);
            opacity: 1;
          }
          60% {
            left: 50%;
            top: var(--hs-result-origin-y, 20%);
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
          }
          100% {
            left: 100%;
            top: 0;
            transform: translate(calc(-100% - 20px), 20px) scale(0.8);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

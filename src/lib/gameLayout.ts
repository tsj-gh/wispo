/**
 * ゲーム本編（ヘッダー・広告・盤面・操作UI）の共通最大幅。
 * Tailwind のクラス文字列としてそのまま使用する（JIT 検出用に分割しない）。
 */
export const GAME_COLUMN_CLASS = "mx-auto w-full max-w-[520px]";

/** Pres-Sure Judge 用（640px 列） */
export const GAME_COLUMN_CLASS_WIDE = "mx-auto w-full max-w-[640px]";

/**
 * 教材概要・ねらい・運営メモ等の周辺解説。PCでは `GameTroubleshootingSection`（max 1080px）と同じ列幅に揃える。
 * Tailwind JIT 用に分割しない。
 */
export const LAB_SUPPLEMENT_BAND_CLASS = "mx-auto w-full max-w-3xl lg:max-w-[1080px]";

/** 広告#1 の下〜盤面セクションまでの縦余白（誤タップ防止の最低 24px を満たす） */
export const GAME_AD_GAP_AFTER_SLOT_1_PX = 24;

/** 操作UI〜広告#2 までの縦余白（誤タップ防止の最低 24px を満たす） */
export const GAME_AD_GAP_BEFORE_SLOT_2_PX = 32;

/** 広告スロットの最小高さ（プレースホルダー・CLS 対策） */
export const GAME_AD_SLOT_MIN_HEIGHT_PX = 100;

/** Hidden Stack PC 没入: 広告#1 行の固定高（スポンサー行＋枠内の余白込みの目安） */
export const HIDDEN_STACK_PC_TOP_AD_SASH_HEIGHT_PX = 120;

/** Hidden Stack PC: Canvas の calc(100vh - …) に足す枠・ギャップの縦微調整（px） */
export const HIDDEN_STACK_PC_CANVAS_VERTICAL_FUDGE_PX = 16;

/** 初期スクロールで広告#1上端を合わせるときの上方向オフセット（ヘッダー・枠線との干渉回避） */
export const HIDDEN_STACK_INITIAL_SCROLL_TOP_FUDGE_PX = 4;

/** Hidden Stack PC: 解答帯の計測前フォールバック高さ（ResizeObserver 前・SSR 用） */
export const HIDDEN_STACK_PC_ANSWER_BAND_FALLBACK_PX = 152;

/** 「スポンサーリンク」行（font-size 10px + margin-bottom 4px の概算） */
export const GAME_AD_SPONSOR_LABEL_BLOCK_PX = 14;

/** 広告枠ラッパーの上下パディング（各辺・空枠でもレイアウト安定） */
export const GAME_AD_SLOT_FRAME_PADDING_Y_PX = 8;

/**
 * ヘッダー直下に広告#1 を置いたとき、ヘッダー下縁からメイン操作域までに見積もる縦幅
 */
export const GAME_TOP_AD_RESERVED_PX =
  GAME_AD_SLOT_FRAME_PADDING_Y_PX * 2 +
  GAME_AD_SPONSOR_LABEL_BLOCK_PX +
  GAME_AD_SLOT_MIN_HEIGHT_PX +
  GAME_AD_GAP_AFTER_SLOT_1_PX +
  32;

/**
 * 上部に広告#1 を出さないゲーム向けの、盤面 max-height 計算用オフセット（px）
 * （`calc(100dvh - [この値])` でヘッダー周りの余白を確保）
 */
export const GAME_NO_TOP_AD_LAYOUT_OFFSET_PX = 80;

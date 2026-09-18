"use client";

import {
  pslFromScan,
  PSL_TITLE_FULL,
  type PslTitle,
} from "@freeharmony/engine";

const PSL_COLOR: Record<PslTitle, string> = {
  Sub3: "#ef4444",
  LTN: "#eab308",
  MTN: "#84cc16",
  HTN: "#15803d",
  Chadlite: "#2563eb",
  Chad: "#a855f7",
};

export function FaceRating({
  overall,
  percentile,
  size = "lg",
}: {
  overall: number | null;
  percentile: number | null;
  size?: "lg" | "md" | "sm";
}) {
  const psl = pslFromScan(overall, percentile);
  if (!psl) {
    return <span className="text-ink-3">—</span>;
  }
  const full = PSL_TITLE_FULL[psl.title];
  const numeral =
    size === "lg" ? "text-4xl" : size === "md" ? "text-2xl" : "text-xl";
  const titleCls =
    size === "lg" ? "text-lg font-medium" : "text-sm font-medium";
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="label-caps">Face Rating</p>
          <p className={titleCls} style={{ color: PSL_COLOR[psl.title] }}>
            {psl.title}
          </p>
          {full !== psl.title && (
            <p className="text-xs text-ink-2">{full}</p>
          )}
        </div>
        <p className={`numeral ${numeral} tabular-nums`}>
          {psl.rating.toFixed(1)}
          <span className="text-[0.55em] text-ink-2">/10</span>
        </p>
      </div>
      {overall !== null && overall < 75 && (
        <p className="text-xs text-work mt-2">
          This photo is dragging the number down — retake straight-on, camera at
          eye level, hair off your jaw.
        </p>
      )}
    </div>
  );
}

export { PSL_COLOR };

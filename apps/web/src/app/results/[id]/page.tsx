"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  METRICS,
  PSL_TITLE_FULL,
  pslFromScan,
  round1,
  type MetricKey,
  type MetricResult,
  type ScanResult,
  type Tier,
} from "@freeharmony/engine";
import { AREA_LABELS, AREA_WEIGHTS } from "@freeharmony/engine";
import type { AreaKey } from "@freeharmony/engine";
import { reanalyze } from "@/lib/scan";
import {
  cropBoxAspect,
  cropImageStyle,
  faceSquareCrop,
  fromCrop,
  photoBoxStyle,
  toCrop,
  FULL_FRAME,
  type Crop,
} from "@/lib/faceCrop";
import { getScan, loadProfile, updateScan, type StoredScan } from "@/lib/store";
import { generatePlan } from "@freeharmony/advice";
import { personalContext } from "@/lib/store";
import { AiCheckCard } from "@/components/AiCheckCard";
import { FaceRating } from "@/components/FaceRating";
import { rankFlaws, rankStrengths, populationStanding } from "@/lib/flawCopy";
import { idealPointsForMetric } from "@/lib/idealOverlay";

const TIER_LABEL: Record<Tier, string> = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  "needs-work": "Needs Work",
};

const VERDICT_STYLE: Record<MetricResult["verdict"], { label: string; cls: string }> = {
  ideal: { label: "Ideal", cls: "text-ideal" },
  "near-ideal": { label: "Near Ideal", cls: "text-near" },
  "needs-work": { label: "Needs Work", cls: "text-work" },
};

export default function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [scan, setScan] = useState<StoredScan | null | undefined>(undefined);
  const [view, setView] = useState<"front" | "side">("front");
  const [selected, setSelected] = useState<MetricKey>("canthalTilt");
  const [adjusting, setAdjusting] = useState(false);
  const [draftOverrides, setDraftOverrides] = useState<Record<number, { x: number; y: number }>>({});
  const [busy, setBusy] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  useEffect(() => {
    setScan(getScan(id) ?? null);
    if (typeof window !== "undefined" && window.location.hash === "#side") {
      setView("side");
    }
  }, [id]);

  // Restore a score that Adjust Points previously wiped by overwriting with a refused reanalyze.
  useEffect(() => {
    if (!scan?.input || !scan.photo || scan.result.overall !== null) return;
    let cancelled = false;
    void (async () => {
      try {
        const next = await reanalyze(
          scan.input!,
          scan.photo,
          loadProfile().sex,
          scan.overrides,
        );
        if (cancelled || !next.ok || next.overall === null) return;
        const updated =
          updateScan(scan.id, { result: next }) ?? { ...scan, result: next };
        setScan(updated);
      } catch {
        // leave the blank result; user can rescan
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scan]);

  const result = scan?.result;
  const selectedDef = useMemo(
    () => METRICS.find((m) => m.key === selected) ?? METRICS[0]!,
    [selected],
  );
  const selectedMetric = result?.metrics.find((m) => m.key === selected);
  const mergedLandmarks = useMemo(() => {
    const base = scan?.input?.landmarks ?? [];
    const ov = { ...scan?.overrides, ...draftOverrides };
    return base.map((p, i) => (ov[i] ? { x: ov[i]!.x, y: ov[i]!.y, z: p.z } : p));
  }, [scan?.input?.landmarks, scan?.overrides, draftOverrides]);

  const applyOverrides = useCallback(async () => {
    if (!scan?.input) return;
    setBusy(true);
    setAdjustError(null);
    try {
      const merged = { ...scan.overrides, ...draftOverrides };
      const profile = loadProfile();
      const next: ScanResult = await reanalyze(scan.input, scan.photo, profile.sex, merged);
      if (!next.ok || next.overall === null) {
        setAdjustError(
          next.gates.blocking[0]?.message ??
            "Those points couldn't be scored. The previous numbers are unchanged.",
        );
        return;
      }
      const updated =
        updateScan(scan.id, { result: next, overrides: merged }) ?? {
          ...scan,
          result: next,
          overrides: merged,
        };
      setScan(updated);
      setDraftOverrides({});
      setAdjusting(false);
    } catch {
      setAdjustError("Couldn't recompute from those points. The previous numbers are unchanged.");
    } finally {
      setBusy(false);
    }
  }, [scan, draftOverrides]);

  // Square, face-centred framing for the photo card. The engine's frame gives
  // us the aspect synchronously (the stored JPEG is a straight downscale of the
  // capture), so there's no uncropped flash on load.
  const landmarks = scan?.input?.landmarks;
  const photoAspect = useImageAspect(
    scan?.photo,
    scan?.result.frame
      ? scan.result.frame.imageWidth / scan.result.frame.imageHeight
      : null,
  );
  const photoCrop = useMemo(
    () =>
      photoAspect && landmarks?.length
        ? faceSquareCrop(landmarks, photoAspect)
        : FULL_FRAME,
    [photoAspect, landmarks],
  );
  const photoBox = photoAspect ? cropBoxAspect(photoCrop, photoAspect) : null;
  const idealGhosts = useMemo(() => {
    if (!selectedMetric || !photoAspect || selectedMetric.score >= 100) return {};
    return idealPointsForMetric(selected, mergedLandmarks, selectedMetric, photoAspect);
  }, [selected, selectedMetric, mergedLandmarks, photoAspect]);
  const hasIdealGhosts = Object.keys(idealGhosts).length > 0;

  if (scan === undefined) {
    return <Shell title="Metrics Explorer"><p className="label-caps animate-pulse p-8 text-center">Loading…</p></Shell>;
  }
  if (scan === null || !result) {
    return (
      <Shell title="Metrics Explorer">
        <div className="card p-8 text-center flex flex-col gap-4">
          <p className="font-medium">This scan isn&apos;t on this device.</p>
          <p className="text-sm text-ink-2">
            Scans are stored only on the device that took them — nothing is
            uploaded, so a shared link or screenshot can&apos;t be reopened
            on a different phone or browser. Run your own scan to get your
            score here.
          </p>
          <Link href="/scan" className="gold-gradient rounded-full px-6 py-3 text-sm font-semibold tracking-[0.15em] uppercase self-center">
            New Scan
          </Link>
        </div>
      </Shell>
    );
  }

  const standing =
    result.overallPercentile !== null
      ? populationStanding(result.overallPercentile)
      : null;

  return (
    <Shell title="Metrics Explorer" shareScan={scan}>
      {/* Front / Side */}
      <div className="grid grid-cols-2 gap-2">
        {(["front", "side"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`card py-2.5 text-sm uppercase tracking-[0.2em] ${
              view === v ? "border-gold/70" : "text-ink-2"
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {view === "side" ? (
        <SideView scan={scan} />
      ) : (
        <>
          {/* Photo viewport with per-metric overlay */}
      <div
        id="scan-photo"
        className="mx-auto flex w-full flex-col gap-2"
        style={photoBox ? photoBoxStyle(photoBox) : undefined}
      >
        <div className="card relative overflow-hidden">
          <PhotoOverlay
            photo={scan.photo}
            landmarks={scan.input?.landmarks ?? []}
            crop={photoCrop}
            boxAspect={photoBox}
            overlay={selectedDef.overlay}
            adjusting={adjusting}
            overrides={{ ...scan.overrides, ...draftOverrides }}
            ideal={idealGhosts}
            onDrag={(idx, x, y) =>
              setDraftOverrides((prev) => ({ ...prev, [idx]: { x, y } }))
            }
          />
          {selectedMetric && !adjusting && !hasIdealGhosts && (
            <MetricChip
              metric={selectedMetric}
              className="pointer-events-none absolute bottom-3 left-3 right-3"
            />
          )}
        </div>
        {selectedMetric && (adjusting || hasIdealGhosts) && (
          <MetricChip metric={selectedMetric} className="card" />
        )}
        {hasIdealGhosts && (
          <p className="text-[0.65rem] text-ink-3 px-1">
            <span className="text-gold">Gold</span> = yours.{" "}
            <span className="text-ideal">Green</span> = where this would sit in the
            ideal range.
          </p>
        )}
      </div>

      {/* Adjust points */}
      {scan.input && (
        <div className="flex gap-3">
          {!adjusting ? (
            <button
              onClick={() => {
                setAdjustError(null);
                setAdjusting(true);
              }}
              className="card flex-1 py-3 text-sm tracking-[0.15em] uppercase text-ink-2 hover:text-ink"
            >
              ⊹ Adjust Points
            </button>
          ) : (
            <>
              <button
                onClick={() => void applyOverrides()}
                disabled={busy || Object.keys(draftOverrides).length === 0}
                className="gold-gradient flex-1 rounded-card py-3 text-sm font-semibold tracking-[0.15em] uppercase disabled:opacity-50"
              >
                {busy ? "Recomputing…" : "Save Points"}
              </button>
              <button
                onClick={() => {
                  setDraftOverrides({});
                  setAdjusting(false);
                  setAdjustError(null);
                }}
                className="card flex-1 py-3 text-sm tracking-[0.15em] uppercase text-ink-2"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}
      {adjustError && (
        <p className="text-xs text-work -mt-1 px-1">{adjustError}</p>
      )}
      {adjusting && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {result.metrics.map((m) => {
              const def = METRICS.find((d) => d.key === m.key);
              if (!def?.overlay.points.length) return null;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setSelected(m.key)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${
                    m.key === selected
                      ? "gold-gradient font-semibold"
                      : "card text-ink-2"
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-ink-3 -mt-1">
            Tap a metric, then drag its gold points. Currently editing{" "}
            <span className="text-ink">{selectedDef.label}</span>. Save when
            you&apos;re done — the score recomputes from the same math.
          </p>
        </>
      )}

      {/* Overall — PSL 1–10 leads, harmony / population below */}
      <div
        className={`card px-5 py-4 flex flex-col gap-2 ${
          scan.ai?.sanity?.confidence === "low" ? "opacity-50" : ""
        }`}
      >
        <FaceRating
          overall={result.overall}
          percentile={result.overallPercentile}
        />
        <div className="flex items-start justify-between gap-3 border-t border-line pt-2">
          <span className="text-xs text-ink-2">
            {standing ? (
              <>
                {standing.rank}
                <span className="text-ink-3"> · {standing.attractiveness}</span>
              </>
            ) : result.tier ? (
              TIER_LABEL[result.tier]
            ) : (
              "—"
            )}
          </span>
          <span className="text-xs text-ink-2">
            harmony{" "}
            <span className="numeral text-sm text-gold">
              {result.overall?.toFixed(1)}%
            </span>
            {result.tier ? ` · ${TIER_LABEL[result.tier]}` : ""}
          </span>
        </div>
      </div>

      {result.gates.warnings.some((g) =>
        g.code === "yaw-mild" || g.code === "pitch-mild" || g.code === "roll-mild",
      ) && (
        <p className="text-xs text-ink-2 -mt-1 px-1">
          {result.gates.warnings
            .filter((g) =>
              g.code === "yaw-mild" || g.code === "pitch-mild" || g.code === "roll-mild",
            )
            .map((g) => g.message)
            .join(" ")}{" "}
          Score still computed — width or vertical metrics may be a bit softer.
        </p>
      )}

      <BiggestGaps
        metrics={result.metrics}
        selected={selected}
        onSelect={(key) => {
          setSelected(key);
          document.getElementById("scan-photo")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />

      <StrongestPoints
        metrics={result.metrics}
        selected={selected}
        onSelect={(key) => {
          setSelected(key);
          document.getElementById("scan-photo")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />

      <FeedbackRanked scan={scan} />

      <AiCheckCard scan={scan} onScanUpdated={setScan} />

      {/* Area sub-scores */}
      <div className="card grid grid-cols-4 gap-2 px-4 py-4">
        {(Object.keys(AREA_WEIGHTS) as AreaKey[]).map((area) => (
          <div key={area} className="flex flex-col items-center gap-1">
            <span className="numeral text-2xl">
              {result.areas[area].score ?? "—"}
            </span>
            <span className="text-[0.65rem] tracking-wider uppercase text-ink-2 text-center">
              {AREA_LABELS[area]}
            </span>
          </div>
        ))}
      </div>

      {/* Metric list */}
      <div className="flex flex-col gap-3 pb-10">
        {result.metrics.map((m) => (
          <button
            key={m.key}
            onClick={() => setSelected(m.key)}
            className={`card px-5 py-4 text-left transition-colors ${
              m.key === selected ? "border-gold/60" : "hover:border-line"
            }`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[15px] font-medium">{m.label}</span>
              <span className="truncate text-xs text-ink-2">
                {bandText(m)}
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="numeral text-2xl text-gold">{formatValue(m)}</span>
              <span className={`text-sm ${VERDICT_STYLE[m.verdict].cls}`}>
                {VERDICT_STYLE[m.verdict].label}
              </span>
              {m.percentile !== null && m.percentile !== undefined && (
                <span className="text-xs text-ink-2" title="vs. the FFHQ calibration corpus">
                  {ordinal(m.percentile)} pctile
                </span>
              )}
              {m.confidence < 0.6 && (
                <span className="text-xs text-ink-3">low confidence</span>
              )}
            </div>
          </button>
        ))}
      </div>
        </>
      )}

      {/* Pulsing improve pill — bottom-center, above the fold line */}
      <Link
        href={`/plan/${scan.id}`}
        className="fh-improve-pill gold-gradient btn-press fixed bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-full px-6 py-3 text-sm font-semibold uppercase tracking-[0.12em] shadow-lg"
      >
        ✦ How can I improve?
      </Link>
      <div className="h-14" aria-hidden />
    </Shell>
  );
}

function MetricChip({
  metric,
  className,
}: {
  metric: MetricResult;
  className?: string;
}) {
  return (
    <div
      className={`rounded-chip bg-bg/80 backdrop-blur px-4 py-2 flex items-center gap-2 ${className ?? ""}`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
          metric.verdict === "ideal"
            ? "bg-ideal"
            : metric.verdict === "near-ideal"
              ? "bg-near"
              : "bg-work"
        }`}
      />
      <span className="label-caps truncate">{metric.label}</span>
      <span className="numeral ml-auto text-gold">{formatValue(metric)}</span>
    </div>
  );
}

function BiggestGaps({
  metrics,
  selected,
  onSelect,
}: {
  metrics: MetricResult[];
  selected: MetricKey;
  onSelect: (key: MetricKey) => void;
}) {
  const flaws = useMemo(() => rankFlaws(metrics), [metrics]);
  if (flaws.length === 0) return null;
  return (
    <HighlightList
      title="Biggest gaps from ideal"
      items={flaws}
      selected={selected}
      onSelect={onSelect}
      scoreClass="text-work"
    />
  );
}

function StrongestPoints({
  metrics,
  selected,
  onSelect,
}: {
  metrics: MetricResult[];
  selected: MetricKey;
  onSelect: (key: MetricKey) => void;
}) {
  const strengths = useMemo(() => {
    const gapKeys = rankFlaws(metrics).map((f) => f.key);
    return rankStrengths(metrics, gapKeys);
  }, [metrics]);
  if (strengths.length === 0) return null;
  return (
    <HighlightList
      title="Strongest points"
      items={strengths}
      selected={selected}
      onSelect={onSelect}
      scoreClass="text-ideal"
    />
  );
}

function HighlightList({
  title,
  items,
  selected,
  onSelect,
  scoreClass,
}: {
  title: string;
  items: { key: MetricKey; headline: string; detail: string; label: string; score: number }[];
  selected: MetricKey;
  onSelect: (key: MetricKey) => void;
  scoreClass: string;
}) {
  return (
    <section className="card p-5 flex flex-col gap-4">
      <p className="label-caps">{title}</p>
      <ol className="flex flex-col gap-4">
        {items.map((f, i) => (
          <li key={f.key}>
            <button
              type="button"
              onClick={() => onSelect(f.key)}
              className={`flex w-full gap-3 rounded-xl text-left transition-colors ${
                f.key === selected ? "-mx-2 px-2 py-1 border border-gold/50" : ""
              }`}
            >
              <span className="numeral grid h-8 w-8 shrink-0 place-items-center rounded-full border border-gold/40 text-gold">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="font-medium leading-snug">
                  {f.headline}
                  <span className={`ml-2 text-xs ${scoreClass}`}>
                    {f.label} {Math.round(f.score)}/100
                  </span>
                </p>
                <p className="mt-0.5 text-sm text-ink-2">{f.detail}</p>
              </div>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Ranked feedback: the top issues from this scan, worst-first, each with the
 * specific personalized lever for it — computed from the same deterministic
 * plan engine, using the onboarding answers.
 */
function FeedbackRanked({ scan }: { scan: StoredScan }) {
  const items = useMemo(() => {
    if (!scan.result.ok) return [];
    const plan = generatePlan(scan.result, personalContext(loadProfile()));
    // Only deficit-driven items here (baselines live on the full plan page),
    // already sorted by priority = what matters most first.
    return plan.items.filter((i) => i.rule.targets.length > 0).slice(0, 5);
  }, [scan]);

  if (items.length === 0) return null;

  return (
    <section className="card p-5 flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <p className="label-caps">Feedback — most important first</p>
        <Link href={`/plan/${scan.id}`} className="text-xs text-gold">
          Full plan →
        </Link>
      </div>
      <ol className="flex flex-col gap-4">
        {items.map((item, i) => {
          const worst = scan.result.metrics
            .filter((m) => item.rule.targets.includes(m.key))
            .sort((a, b) => a.score - b.score)[0];
          return (
            <li key={item.rule.id} className="flex gap-3">
              <span className="numeral grid h-8 w-8 shrink-0 place-items-center rounded-full border border-gold/40 text-gold">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="font-medium leading-snug">
                  {item.rule.title}
                  {worst && (
                    <span className="ml-2 text-xs text-work">
                      {worst.label} {Math.round(worst.score)}/100
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-sm text-ink-2">{item.rule.body}</p>
                <p className="mt-0.5 text-xs text-gold/80">{item.reason}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** SIDE tab: contour-anchor profile analysis (separate from the mesh). */
function SideView({ scan }: { scan: StoredScan }) {
  const side = scan.side;
  // The eight profile anchors are placed by hand on the silhouette, so there's
  // no reliable face box to crop to — bound the height instead.
  const aspect = useImageAspect(side?.photo, null);

  if (!side) {
    return (
      <div className="card p-8 text-center flex flex-col gap-4">
        <p className="font-display text-xl">No side profile yet</p>
        <p className="text-sm text-ink-2 max-w-[40ch] mx-auto">
          The face mesh can&apos;t see a true 90° profile, so the side scan uses
          eight silhouette points you place — then pure geometry: nose angles,
          profile convexity, and the E-line.
        </p>
        <Link
          href={`/scan/side?attach=${scan.id}`}
          className="gold-gradient self-center rounded-full px-7 py-3 text-sm font-semibold tracking-[0.15em] uppercase"
        >
          Capture Side Profile
        </Link>
      </div>
    );
  }
  return (
    <>
      <div
        className="card relative mx-auto w-full overflow-hidden"
        style={aspect ? photoBoxStyle(aspect) : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={side.photo} alt="Side profile" className="w-full" draggable={false} />
        <svg
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <line
            x1={side.anchors.pronasale.x}
            y1={side.anchors.pronasale.y}
            x2={side.anchors.pogonion.x}
            y2={side.anchors.pogonion.y}
            stroke="#ead0a4"
            strokeOpacity="0.6"
            strokeWidth="0.004"
            strokeDasharray="0.02 0.012"
          />
          {Object.values(side.anchors).map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="0.014" fill="none" stroke="#ead0a4" strokeWidth="0.005" />
              <circle cx={p.x} cy={p.y} r="0.004" fill="#ead0a4" />
            </g>
          ))}
        </svg>
      </div>

      <Link
        href={`/scan/side?attach=${scan.id}`}
        className="card py-3 text-center text-sm tracking-[0.15em] uppercase text-ink-2 hover:text-ink"
      >
        ↻ Retake / re-place points
      </Link>

      <div className="flex flex-col gap-3 pb-10">
        {side.results.map((m) => (
          <div key={m.key} className="card px-5 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[15px] font-medium">{m.label}</span>
              <span className="truncate text-xs text-ink-2">
                {m.unit === "deg" ? `${m.band.lo}° – ${m.band.hi}°` : `${m.band.lo} – ${m.band.hi}`}
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="numeral text-2xl text-gold">
                {m.unit === "deg" ? `${m.value.toFixed(1)}°` : m.value.toFixed(3)}
              </span>
              <span className={`text-sm ${VERDICT_STYLE[m.verdict].cls}`}>
                {VERDICT_STYLE[m.verdict].label}
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-3">{m.meaning}</p>
          </div>
        ))}
        <p className="text-xs text-ink-3 text-center">
          Side metrics are informational and don&apos;t move your overall harmony
          score — point placement is manual, so we don&apos;t mix it into the
          deterministic number.
        </p>
      </div>
    </>
  );
}

function Shell({
  title,
  children,
  shareScan,
}: {
  title: string;
  children: React.ReactNode;
  shareScan?: StoredScan;
}) {
  return (
    <main className="fh-enter mx-auto w-full max-w-xl px-5 py-6 flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm text-ink-2 hover:text-ink">
          ← Home
        </Link>
        <span className="label-caps">{title}</span>
        {shareScan ? <ShareButton scan={shareScan} /> : <span className="w-12" />}
      </header>
      {children}
    </main>
  );
}

/**
 * Natural width/height of an image URL. `fallback` is used until (or instead
 * of) the decode — the engine frame already knows the capture's aspect, so
 * passing it avoids a layout jump on first paint.
 */
function useImageAspect(src: string | undefined, fallback: number | null): number | null {
  const [aspect, setAspect] = useState<number | null>(fallback);

  useEffect(() => {
    setAspect(fallback);
    if (!src) return;
    let live = true;
    const img = new Image();
    img.onload = () => {
      if (live && img.naturalWidth > 0 && img.naturalHeight > 0) {
        setAspect(img.naturalWidth / img.naturalHeight);
      }
    };
    img.src = src;
    return () => {
      live = false;
    };
  }, [src, fallback]);

  return aspect;
}

function ordinal(n: number): string {
  const rem10 = n % 10;
  const rem100 = n % 100;
  if (rem10 === 1 && rem100 !== 11) return `${n}st`;
  if (rem10 === 2 && rem100 !== 12) return `${n}nd`;
  if (rem10 === 3 && rem100 !== 13) return `${n}rd`;
  return `${n}th`;
}

function formatValue(m: MetricResult): string {
  if (m.unit === "deg") {
    const v = round1(m.value);
    return `${v > 0 && m.key === "canthalTilt" ? "+" : ""}${v.toFixed(1)}°`;
  }
  if (m.unit === "index") return round1(m.value).toFixed(1);
  return m.value.toFixed(2);
}

function bandText(m: MetricResult): string {
  const fmt = (v: number) =>
    m.unit === "deg" ? `${v}°` : m.unit === "index" ? `${v}` : v.toFixed(m.value >= 10 ? 0 : 3).replace(/0+$/, "").replace(/\.$/, "");
  return `${fmt(m.band.lo)} – ${fmt(m.band.hi)}`;
}

/**
 * SVG landmark overlay on top of the scan photo.
 *
 * Everything the caller passes in — landmarks, overrides, drag callbacks — is
 * in image-normalized coordinates; `crop` is the square window we actually
 * show, so points are mapped into it for drawing and back out for input.
 */
function PhotoOverlay({
  photo,
  landmarks,
  crop,
  boxAspect,
  overlay,
  adjusting,
  overrides,
  ideal,
  onDrag,
}: {
  photo: string;
  landmarks: Array<{ x: number; y: number; z: number }>;
  crop: Crop;
  /** null until the photo's aspect is known — render it uncropped until then. */
  boxAspect: number | null;
  overlay: { points: number[]; polylines: number[][] };
  adjusting: boolean;
  overrides: Record<number, { x: number; y: number }>;
  ideal?: Record<number, { x: number; y: number }>;
  onDrag: (idx: number, x: number, y: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragIdx = useRef<number | null>(null);

  const posOf = useCallback(
    (i: number): { x: number; y: number } | null => {
      const p = overrides[i] ?? landmarks[i];
      return p ? toCrop(p, crop) : null;
    },
    [landmarks, overrides, crop],
  );

  const posIdeal = useCallback(
    (i: number): { x: number; y: number } | null => {
      const g = ideal?.[i];
      if (g) return toCrop(g, crop);
      return posOf(i);
    },
    [ideal, crop, posOf],
  );

  const toNormalized = useCallback(
    (e: React.PointerEvent): { x: number; y: number } | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      return fromCrop(
        {
          x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
          y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
        },
        crop,
      );
    },
    [crop],
  );

  const ghostKeys = ideal ? Object.keys(ideal).map(Number) : [];

  return (
    <div
      className="relative overflow-hidden"
      style={boxAspect ? { aspectRatio: `${boxAspect}` } : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo}
        alt="Your scan"
        className={boxAspect ? undefined : "w-full"}
        style={boxAspect ? cropImageStyle(crop) : undefined}
        draggable={false}
      />
      {landmarks.length > 0 && (
        <svg
          ref={svgRef}
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          className="absolute inset-0 z-10 h-full w-full touch-none"
          onPointerMove={(e) => {
            if (dragIdx.current === null) return;
            const p = toNormalized(e);
            if (p) onDrag(dragIdx.current, p.x, p.y);
          }}
          onPointerUp={() => (dragIdx.current = null)}
          onPointerLeave={() => (dragIdx.current = null)}
        >
          {overlay.polylines.map((chain, ci) => {
            const pts = chain
              .map((i) => posOf(i))
              .filter((p): p is { x: number; y: number } => p !== null);
            if (pts.length < 2) return null;
            return (
              <polyline
                key={`a-${ci}`}
                points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="#ead0a4"
                strokeWidth="0.004"
                strokeOpacity="0.9"
              />
            );
          })}
          {ghostKeys.length > 0 &&
            overlay.polylines.map((chain, ci) => {
              const pts = chain
                .map((i) => posIdeal(i))
                .filter((p): p is { x: number; y: number } => p !== null);
              if (pts.length < 2) return null;
              return (
                <polyline
                  key={`g-${ci}`}
                  points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke="#66bb6a"
                  strokeWidth="0.0035"
                  strokeOpacity="0.85"
                  strokeDasharray="0.018 0.012"
                />
              );
            })}
          {ghostKeys.map((i) => {
            const a = posOf(i);
            const b = posIdeal(i);
            if (!a || !b) return null;
            return (
              <line
                key={`d-${i}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#66bb6a"
                strokeWidth="0.003"
                strokeOpacity="0.55"
                strokeDasharray="0.01 0.01"
              />
            );
          })}
          {overlay.points.map((i) => {
            const p = posOf(i);
            if (!p) return null;
            return (
              <g key={`p-${i}`}>
                <circle cx={p.x} cy={p.y} r={adjusting ? 0.022 : 0.013} fill="none" stroke="#ead0a4" strokeWidth="0.006" />
                <circle cx={p.x} cy={p.y} r="0.004" fill="#ead0a4" />
                {adjusting && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="0.05"
                    fill="transparent"
                    className="cursor-grab"
                    onPointerDown={(e) => {
                      (e.target as Element).setPointerCapture(e.pointerId);
                      dragIdx.current = i;
                    }}
                  />
                )}
              </g>
            );
          })}
          {ghostKeys.map((i) => {
            const p = posIdeal(i);
            if (!p) return null;
            return (
              <g key={`i-${i}`} pointerEvents="none">
                <circle cx={p.x} cy={p.y} r="0.016" fill="none" stroke="#66bb6a" strokeWidth="0.005" strokeDasharray="0.008 0.006" />
                <circle cx={p.x} cy={p.y} r="0.0035" fill="#66bb6a" />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/** Compose a shareable score card and download it. */
function ShareButton({ scan }: { scan: StoredScan }) {
  const share = useCallback(async () => {
    const r = scan.result;
    if (r.overall === null) return;
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("decode"));
      img.src = scan.photo;
    });
    // Share the same square framing the user just looked at.
    const landmarks = scan.input?.landmarks ?? [];
    const crop =
      landmarks.length > 0
        ? faceSquareCrop(landmarks, img.naturalWidth / img.naturalHeight)
        : FULL_FRAME;
    const sx = crop.x * img.naturalWidth;
    const sy = crop.y * img.naturalHeight;
    const sw = crop.w * img.naturalWidth;
    const sh = crop.h * img.naturalHeight;

    const W = 720;
    const photoH = Math.round((sh / sw) * W);
    const H = photoH + 180;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#0c0a08";
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, photoH);
    const psl = pslFromScan(r.overall, r.overallPercentile);
    ctx.fillStyle = "#f2ede6";
    ctx.font = "600 22px Georgia, serif";
    ctx.fillText(
      psl
        ? `${psl.rating.toFixed(1)}/10  ${psl.title}`
        : `Harmony ${r.overall.toFixed(1)}%`,
      28,
      H - 120,
    );
    ctx.fillStyle = "#d8b888";
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText(
      psl
        ? `${PSL_TITLE_FULL[psl.title]} · harmony ${r.overall.toFixed(1)}%`
        : `${r.tier ? TIER_LABEL[r.tier] : ""} · measured with open-source math`,
      28,
      H - 88,
    );
    ctx.fillStyle = "#8f8a82";
    ctx.font = "14px system-ui, sans-serif";
    ctx.fillText("FaceUp — every metric free, photos never leave your device", 28, H - 40);
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = "faceup-score.png";
    a.click();
  }, [scan]);

  return (
    <button
      onClick={() => void share()}
      className="btn-press rounded-full border border-gold/40 px-4 py-1.5 text-sm text-gold hover:border-gold/70"
    >
      Share ↗
    </button>
  );
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PUZZLES } from "./puzzles.js";
import {
  GAP,
  BLOCK_H,
  SCALE,
  SVG_PAD,
  OVERLAP_MIN,
  WIN_ROW_DELAY,
  WOBBLE_FRAMES,
  FALL_FRAMES,
  TOTAL_FALL_ANIM,
  PROGRESS_KEY,
} from "./constants.js";
import { findCascade, checkWin, overlapPx } from "./physics.js";

function buildBlocks(puzzle) {
  const blocks = [];

  const rowPixelWidths = puzzle.rows.map((row) => {
    const contentW = row.reduce((s, b) => s + b.w * SCALE, 0);
    return contentW + (row.length - 1) * GAP;
  });
  const maxRowW = Math.max(...rowPixelWidths);

  puzzle.rows.forEach((row, ri) => {
    const totalW = rowPixelWidths[ri];
    const offsetX = (maxRowW - totalW) / 2;
    let cx = offsetX;

    row.forEach((def, ci) => {
      const pw = def.w * SCALE;
      blocks.push({
        id: `r${ri}_${ci}`,
        row: ri,
        col: ci,
        x: cx,
        w: pw,
        value: def.v,
        isSolution: !!def.sol,
      });
      cx += pw + GAP;
    });
  });

  return blocks;
}

function getFallTransform(frame, blockX, blockY, blockW) {
  const cx = blockX + blockW / 2;
  const cy = blockY + BLOCK_H / 2;

  if (frame <= WOBBLE_FRAMES) {
    const t = frame / WOBBLE_FRAMES;
    const angle = Math.sin(t * Math.PI * 4) * 15 * (1 - t * 0.3);
    return {
      transform: `rotate(${angle}, ${cx}, ${cy})`,
      translateY: 0,
      opacity: 1,
    };
  }

  const fallFrame = frame - WOBBLE_FRAMES;
  const t = fallFrame / FALL_FRAMES;
  const translateY = fallFrame * fallFrame * 1.5;
  const angle = Math.sin(fallFrame * 0.5) * 8 * (1 - t);

  return {
    transform: `rotate(${angle}, ${cx}, ${cy + translateY})`,
    translateY,
    opacity: Math.max(0, 1 - t * 1.3),
  };
}

function loadProgress() {
  try {
    if (typeof window === "undefined") return { solved: {} };
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return { solved: {} };
    const parsed = JSON.parse(raw);
    return {
      solved: parsed.solved || {},
    };
  } catch {
    return { solved: {} };
  }
}

function saveProgress(progress) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // ignore
  }
}

function countMaxRow(blocks) {
  return Math.max(...blocks.map((b) => b.row));
}

const FONT = `'Inter', 'Helvetica Neue', Arial, sans-serif`;
const REMOVE_LABEL_FONT_SIZE = 10;
const WIN_LAYER_DELAY_MS = 520;
const WIN_TRACE_DRAW_MS = 440;
const WIN_HALO_IN_MS = 260;
const WIN_ACCENT_COLOR = "#22c55e";
const TODAY_DICE = [
  { key: "die-1", pips: 1, puzzleIdx: 2 }, // game 3
  { key: "die-2", pips: 2, puzzleIdx: 5 }, // game 6
  { key: "die-3", pips: 3, puzzleIdx: 3 }, // game 4
];
const WIN_STYLE_VARIANT = "trace_clean";
const WIN_STYLE_VARIANTS = {
  trace_clean: {
    traceColor: WIN_ACCENT_COLOR,
    traceWidth: 4.2,
    traceOpacity: 1,
    haloStroke: WIN_ACCENT_COLOR,
    haloFill: "transparent",
    haloStrokeWidth: 3.2,
    flow: false,
  },
  trace_soft_fill: {
    traceColor: WIN_ACCENT_COLOR,
    traceWidth: 2.6,
    traceOpacity: 0.8,
    haloStroke: WIN_ACCENT_COLOR,
    haloFill: "rgba(34, 197, 94, 0.20)",
    haloStrokeWidth: 2.2,
    flow: false,
  },
  trace_directional: {
    traceColor: WIN_ACCENT_COLOR,
    traceWidth: 2.6,
    traceOpacity: 0.85,
    haloStroke: WIN_ACCENT_COLOR,
    haloFill: "transparent",
    haloStrokeWidth: 2.3,
    flow: true,
  },
};

function combinations(items, size) {
  const out = [];
  const choose = (start, acc) => {
    if (acc.length === size) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      acc.push(items[i]);
      choose(i + 1, acc);
      acc.pop();
    }
  };
  choose(0, []);
  return out;
}

function pickFactorCombo(parent, candidates) {
  const candidates2 = combinations(candidates, 2);
  const candidates3 = combinations(candidates, 3);
  const allCombos = [...candidates2, ...candidates3];

  let best = null;
  let bestScore = -Infinity;
  for (const combo of allCombos) {
    const product = combo.reduce((acc, b) => acc * b.value, 1);
    if (product !== parent.value) continue;

    const overlapScore = combo.reduce((acc, c) => acc + overlapPx(parent, c), 0);
    const countBonus = combo.length === 2 ? 0.05 : 0;
    const score = overlapScore + countBonus;
    if (score > bestScore) {
      bestScore = score;
      best = combo;
    }
  }
  return best;
}

function buildVisualWinConnections(allBlocks, presentSet) {
  const presentBlocks = allBlocks.filter((b) => presentSet.has(b.id));
  const byId = {};
  presentBlocks.forEach((b) => {
    byId[b.id] = b;
  });

  const nonBaseParents = presentBlocks.filter((b) => b.row > 0);
  const parentCombos = new Map();
  const parentChildScore = new Map();

  for (const parent of nonBaseParents) {
    const candidates = presentBlocks.filter(
      (c) => c.row === parent.row - 1 && overlapPx(parent, c) > OVERLAP_MIN,
    );
    const combo = pickFactorCombo(parent, candidates);
    if (!combo) continue;
    parentCombos.set(parent.id, combo.map((c) => c.id));
    combo.forEach((child) => {
      const key = `${parent.id}:${child.id}`;
      parentChildScore.set(key, overlapPx(parent, child));
    });
  }

  // Assign each child to exactly one parent.
  const childToParent = new Map();
  const childCandidates = new Map();
  for (const [parentId, childIds] of parentCombos.entries()) {
    for (const childId of childIds) {
      if (!childCandidates.has(childId)) childCandidates.set(childId, []);
      childCandidates.get(childId).push(parentId);
    }
  }

  for (const [childId, parents] of childCandidates.entries()) {
    let bestParent = null;
    let bestScore = -Infinity;
    const child = byId[childId];
    for (const parentId of parents) {
      const parent = byId[parentId];
      if (!parent || !child) continue;
      const overlapScore = parentChildScore.get(`${parentId}:${childId}`) || 0;
      const centerScore = -Math.abs((parent.x + parent.w / 2) - (child.x + child.w / 2));
      const totalScore = overlapScore * 10 + centerScore;
      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestParent = parentId;
      }
    }
    if (bestParent) childToParent.set(childId, bestParent);
  }

  // Ensure each parent has 2-3 supporters when possible.
  const parentChildrenFinal = new Map();
  for (const parentId of parentCombos.keys()) parentChildrenFinal.set(parentId, []);
  for (const [childId, parentId] of childToParent.entries()) {
    if (parentChildrenFinal.has(parentId)) parentChildrenFinal.get(parentId).push(childId);
  }
  for (const [parentId, comboChildren] of parentCombos.entries()) {
    const assigned = parentChildrenFinal.get(parentId);
    if (assigned.length >= 2) continue;
    for (const childId of comboChildren) {
      if (assigned.includes(childId)) continue;
      const owner = childToParent.get(childId);
      if (!owner) {
        childToParent.set(childId, parentId);
        assigned.push(childId);
      } else {
        const ownerList = parentChildrenFinal.get(owner) || [];
        if (ownerList.length > 2) {
          const idx = ownerList.indexOf(childId);
          if (idx >= 0) ownerList.splice(idx, 1);
          childToParent.set(childId, parentId);
          assigned.push(childId);
        }
      }
      if (assigned.length >= 3) break;
    }
  }

  const connections = [];
  for (const [childId, parentId] of childToParent.entries()) {
    const parentChildren = parentChildrenFinal.get(parentId) || [];
    if (parentChildren.length < 2 || parentChildren.length > 3) continue;
    connections.push({ childId, parentId });
  }
  return connections;
}

function DiceFace({ pips }) {
  const spots = {
    1: [[2, 2]],
    2: [
      [1, 1],
      [3, 3],
    ],
    3: [
      [1, 1],
      [2, 2],
      [3, 3],
    ],
  }[pips];

  return (
    <span className="dice-grid" aria-hidden="true">
      {spots.map(([r, c], idx) => (
        <span key={`${r}-${c}-${idx}`} className="dice-pip" style={{ gridRow: r, gridColumn: c }} />
      ))}
    </span>
  );
}

export default function FactorVolcanoGame({ initialPuzzleIdx = 0, mode = "today", onBackHome }) {
  const allowedPuzzleIndices = useMemo(() => {
    if (mode === "tutorial") return [0];
    return [2, 5, 3];
  }, [mode]);

  const resolvedInitialPuzzleIdx = allowedPuzzleIndices.includes(initialPuzzleIdx)
    ? initialPuzzleIdx
    : allowedPuzzleIndices[0];

  const [puzzleIdx, setPuzzleIdx] = useState(resolvedInitialPuzzleIdx);
  const [blocks, setBlocks] = useState(() => buildBlocks(PUZZLES[resolvedInitialPuzzleIdx]));
  const [present, setPresent] = useState(() =>
    new Set(buildBlocks(PUZZLES[resolvedInitialPuzzleIdx]).map((b) => b.id)),
  );
  const [pendingRemoveId, setPendingRemoveId] = useState(null);

  const [fallingSet, setFallingSet] = useState(new Set());
  const [fallFrames, setFallFrames] = useState({});
  const [won, setWon] = useState(false);
  const [lost, setLost] = useState(false);
  const [busy, setBusy] = useState(false);

  const [history, setHistory] = useState([]);
  const [showSolved, setShowSolved] = useState(false);

  const [winAnimRow, setWinAnimRow] = useState(-1);
  const [progress, setProgress] = useState(() => loadProgress());

  const animRef = useRef(null);
  const winTimerRef = useRef(null);
  const progressUpdatedRef = useRef(false);

  const puzzleKey = PUZZLES[puzzleIdx].name;
  const puzzleOrderIdx = useMemo(
    () => Math.max(0, allowedPuzzleIndices.findIndex((idx) => idx === puzzleIdx)),
    [allowedPuzzleIndices, puzzleIdx],
  );
  const hasNextPuzzle = puzzleOrderIdx < allowedPuzzleIndices.length - 1;
  const todayLabel = useMemo(
    () => new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase(),
    [],
  );
  const topRowAll = useMemo(() => countMaxRow(blocks), [blocks]);
  const winStyle = WIN_STYLE_VARIANTS[WIN_STYLE_VARIANT] || WIN_STYLE_VARIANTS.trace_clean;

  const blockMap = useMemo(() => {
    const m = {};
    blocks.forEach((b) => {
      m[b.id] = b;
    });
    return m;
  }, [blocks]);

  const maxRight = useMemo(() => Math.max(...blocks.map((b) => b.x + b.w)), [blocks]);
  const svgW = maxRight + SVG_PAD * 2;
  const rowStep = BLOCK_H + GAP;
  const svgH = svgW;

  const bx = (block) => SVG_PAD + block.x;
  const by = (block) => svgH - SVG_PAD - (block.row + 1) * rowStep;
  const bcx = (block) => bx(block) + block.w / 2;
  const bcy = (block) => by(block) + BLOCK_H / 2;

  const loadPuzzle = (idx) => {
    if (!allowedPuzzleIndices.includes(idx)) return;
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (winTimerRef.current) clearTimeout(winTimerRef.current);

    const newBlocks = buildBlocks(PUZZLES[idx]);
    setPuzzleIdx(idx);
    setBlocks(newBlocks);
    setPresent(new Set(newBlocks.map((b) => b.id)));
    setPendingRemoveId(null);
    setFallingSet(new Set());
    setFallFrames({});
    setWon(false);
    setLost(false);
    setBusy(false);
    setHistory([]);
    progressUpdatedRef.current = false;

    setWinAnimRow(-1);
    setShowSolved(false);
  };

  useEffect(() => {
    loadPuzzle(resolvedInitialPuzzleIdx);
    // The intent is to rehydrate board when App chooses a start puzzle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedInitialPuzzleIdx, mode]);

  // Win animation
  useEffect(() => {
    if (!won) return;
    const presentBlocks = blocks.filter((b) => present.has(b.id));
    const presentMaxRow = Math.max(...presentBlocks.map((b) => b.row));

    let currentRow = 0;
    const advanceRow = () => {
      setWinAnimRow(currentRow);
      currentRow++;
      if (currentRow <= presentMaxRow) {
        winTimerRef.current = setTimeout(advanceRow, WIN_ROW_DELAY);
      } else {
        winTimerRef.current = setTimeout(() => setShowSolved(true), 400);
      }
    };

    winTimerRef.current = setTimeout(advanceRow, 300);
    return () => {
      if (winTimerRef.current) clearTimeout(winTimerRef.current);
    };
  }, [won]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist progress on win
  useEffect(() => {
    if (!won) return;
    if (progressUpdatedRef.current) return;
    progressUpdatedRef.current = true;

    setProgress((prev) => {
      const solved = { ...(prev.solved || {}) };
      solved[puzzleKey] = true;

      const next = { solved };
      saveProgress(next);
      return next;
    });
  }, [won, puzzleKey]);

  const runFallAnimation = useCallback(
    (ids, afterPresent, currentBlocks) => {
      if (ids.length === 0) {
        setBusy(false);
        if (checkWin(currentBlocks, afterPresent)) setWon(true);
        return;
      }

      const topRow = Math.max(...currentBlocks.map((b) => b.row));
      const minRow = Math.min(...ids.map((id) => currentBlocks.find((b) => b.id === id).row));
      const batch = ids.filter((id) => currentBlocks.find((b) => b.id === id).row === minRow);

      setFallingSet(new Set(batch));

      let frame = 0;
      const tick = () => {
        frame++;
        const frames = {};
        batch.forEach((id) => {
          frames[id] = frame;
        });
        setFallFrames(frames);

        if (frame < TOTAL_FALL_ANIM) {
          animRef.current = requestAnimationFrame(tick);
        } else {
          const next = new Set(afterPresent);
          batch.forEach((id) => next.delete(id));

          setPresent(next);
          setFallingSet(new Set());
          setFallFrames({});

          const topStillPresent = currentBlocks.some((b) => b.row === topRow && next.has(b.id));
          if (!topStillPresent) {
            setBusy(false);
            setLost(true);
            return;
          }

          const more = findCascade(currentBlocks, next);
          setTimeout(() => runFallAnimation(more, next, currentBlocks), 120);
        }
      };

      animRef.current = requestAnimationFrame(tick);
    },
    [setBusy],
  );

  const handleClick = useCallback(
    (block) => {
      if (busy || won || lost || !present.has(block.id)) return;
      if (block.row === topRowAll) return;
      if (pendingRemoveId !== block.id) {
        setPendingRemoveId(block.id);
        return;
      }

      setBusy(true);
      setHistory((h) => [...h, present]);
      setPendingRemoveId(null);

      const next = new Set(present);
      next.delete(block.id);
      setPresent(next);

      const cascade = findCascade(blocks, next);
      setTimeout(() => runFallAnimation(cascade, next, blocks), 60);
    },
    [busy, won, lost, present, topRowAll, blocks, runFallAnimation, pendingRemoveId],
  );

  const reset = () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (winTimerRef.current) clearTimeout(winTimerRef.current);

    setPresent(new Set(blocks.map((b) => b.id)));
    setPendingRemoveId(null);
    setFallingSet(new Set());
    setFallFrames({});
    setWon(false);
    setLost(false);
    setBusy(false);
    setHistory([]);
    setShowSolved(false);
    setWinAnimRow(-1);
    progressUpdatedRef.current = false;
  };

  const undo = () => {
    if (busy || won || lost || history.length === 0) return;
    const prev = history[history.length - 1];
    setPresent(prev);
    setHistory((h) => h.slice(0, -1));
    setPendingRemoveId(null);
  };

  const handlePostWinAction = () => {
    if (hasNextPuzzle) {
      loadPuzzle(allowedPuzzleIndices[puzzleOrderIdx + 1]);
      return;
    }
    if (onBackHome) onBackHome();
  };

  const visualConnections = useMemo(() => {
    if (!won) return [];
    return buildVisualWinConnections(blocks, present);
  }, [won, blocks, present]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#ffffff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontFamily: FONT,
        color: "#1a1a1a",
        padding: "20px 12px 32px",
        userSelect: "none",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800;900&display=swap');
        .blk { cursor: pointer; }
        @keyframes fadeIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes lineGrow { to { stroke-dashoffset: 0; opacity: 1; } }
        @keyframes haloIn {
          from { transform: scale(0.45); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes traceFlow {
          from { stroke-dashoffset: 22; }
          to { stroke-dashoffset: 0; }
        }
        .game-btn {
          padding: 12px 0; width: 140px; background: #ffffff;
          border: 2px solid #d0d0d0; border-radius: 6px;
          font-family: 'Inter', sans-serif; font-size: 16px;
          font-weight: 600; letter-spacing: 0.08em;
          text-transform: uppercase; color: #999; cursor: pointer;
          transition: border-color 0.2s, color 0.2s;
        }
        .game-btn:hover { border-color: #888; color: #555; }
        .game-btn:disabled { opacity: 0.35; cursor: default; }
        .pz-btn {
          min-width: 48px; height: 44px; padding: 0 12px;
          border-radius: 8px; border: 2px solid #d0d0d0;
          background: #fff; font-family: 'Inter', sans-serif;
          font-size: 18px; font-weight: 800; color: #999;
          cursor: pointer; transition: all 0.15s;
          display: flex; align-items: center; justify-content: center;
        }
        .pz-btn:hover { border-color: #888; color: #555; }
        .pz-btn.active { background: #2b4570; border-color: #2b4570; color: #fff; }
        .pz-btn.solved { border-color: #4caf50; }
        .dice-btn {
          width: 30px;
          height: 30px;
          border: 2px solid #cfd4dc;
          border-radius: 6px;
          background: #e3e7ed;
          padding: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .dice-btn.active {
          background: #111;
          border-color: #111;
        }
        .dice-grid {
          width: 16px;
          height: 16px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          grid-template-rows: repeat(3, 1fr);
        }
        .dice-pip {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #ffffff;
          justify-self: center;
          align-self: center;
        }
        .home-btn-icon {
          position: absolute;
          top: 18px;
          left: 18px;
          border: none;
          background: transparent;
          cursor: pointer;
          color: #7c8797;
          padding: 6px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .home-btn-icon:hover {
          background: #eef2f7;
          color: #586477;
        }
      `}</style>

      {onBackHome && (
        <button className="home-btn-icon" onClick={onBackHome} aria-label="Back to home">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 3.2 3 10.6h2.5V21h6.1v-6.2h1V21h6.1V10.6H21L12 3.2z" />
          </svg>
        </button>
      )}

      <h1 style={{ fontSize: 30, fontWeight: 900, letterSpacing: "0.08em", margin: "0 0 8px" }}>FACTOR HENGE</h1>

      <div style={{ display: "flex", alignItems: "flex-start", width: "100%", maxWidth: 560, marginBottom: 10 }}>
        <div style={{ width: "33%", fontSize: 22, fontWeight: 800, color: "#7b7f86", textTransform: "uppercase", letterSpacing: "0.02em" }}>
          {""}
        </div>
        <div style={{ width: "34%", textAlign: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#111", marginBottom: 4 }}>
            {mode === "tutorial" ? "TUTORIAL" : todayLabel}
          </div>
          {mode === "today" && (
            <div style={{ display: "inline-flex", gap: 6 }}>
              {TODAY_DICE.map((d) => (
                <button
                  key={d.key}
                  className={`dice-btn ${puzzleIdx === d.puzzleIdx ? "active" : ""}`}
                  onClick={() => loadPuzzle(d.puzzleIdx)}
                  aria-label={`Open game ${d.puzzleIdx + 1}`}
                >
                  <DiceFace pips={d.pips} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ width: "33%" }} />
      </div>

      {lost && (
        <button
          onClick={reset}
          style={{
            animation: "fadeIn 0.4s ease-out",
            padding: "12px 32px",
            marginBottom: 14,
            background: "#ffffff",
            border: "2px solid #d32f2f",
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 800,
            color: "#d32f2f",
            cursor: "pointer",
            fontFamily: FONT,
            letterSpacing: "0.04em",
            transition: "background 0.2s, color 0.2s",
          }}
          onMouseEnter={(e) => {
            e.target.style.background = "#d32f2f";
            e.target.style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            e.target.style.background = "#ffffff";
            e.target.style.color = "#d32f2f";
          }}
        >
          TRY AGAIN
        </button>
      )}

      <div
        style={{ border: "2px solid #1a1a1a", borderRadius: 2, padding: "8px", background: "#ffffff", overflow: "hidden" }}
        onClick={() => setPendingRemoveId(null)}
      >
        <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ display: "block", maxWidth: "100%", height: "auto" }}>
          {/* Blocks */}
          {blocks.map((block) => {
            const visible = present.has(block.id) || fallingSet.has(block.id);
            if (!visible) return null;

            const x = bx(block),
              y = by(block),
              w = block.w,
              h = BLOCK_H;

            const falling = fallingSet.has(block.id);
            const frame = fallFrames[block.id] || 0;
            const isTopBlock = block.row === topRowAll;
            const isPending = pendingRemoveId === block.id && !busy && !won && !lost;
            const isWinActivated = won && block.row <= winAnimRow;

            let fill = isTopBlock ? "#F97316" : "#2b4570";
            let textFill = "#ffffff";
            if (isPending) fill = "#d32f2f";

            // Highlight outlines
            let stroke = "none";
            let strokeWidth = 0;
            if (isPending) {
              stroke = "#a91f1f";
              strokeWidth = 3;
            }

            let gTransform = "";
            let gOpacity = 1;
            if (falling && frame > 0) {
              const ft = getFallTransform(frame, x, y, w);
              gTransform = `translate(0,${ft.translateY}) ${ft.transform}`;
              gOpacity = ft.opacity;
            }

            return (
              <g
                key={block.id}
                className={isTopBlock ? "" : "blk"}
                transform={gTransform}
                opacity={gOpacity}
                style={isTopBlock ? { cursor: "default" } : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  handleClick(block);
                }}
              >
                <rect
                  className="body"
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  rx={4}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  style={undefined}
                />
                {isWinActivated && (
                  <circle
                    cx={x + w / 2}
                    cy={y + h / 2}
                    r={Math.min(w / 2 - 7, BLOCK_H / 2 - 9, 16)}
                    fill={winStyle.haloFill}
                    stroke={winStyle.haloStroke}
                    strokeWidth={winStyle.haloStrokeWidth}
                    style={{
                      transformOrigin: `${x + w / 2}px ${y + h / 2}px`,
                      animation: `haloIn ${WIN_HALO_IN_MS}ms ease-out forwards`,
                      animationDelay: `${block.row * WIN_LAYER_DELAY_MS + (block.col % 2) * 70}ms`,
                      opacity: 0,
                    }}
                  />
                )}
                <text
                  x={x + w / 2}
                  y={y + h / 2 + 1}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={
                    isPending ? REMOVE_LABEL_FONT_SIZE : block.value >= 100 ? 16 : block.value >= 10 ? 18 : 20
                  }
                  fontWeight={isPending ? "700" : "800"}
                  fontFamily={FONT}
                  fill={textFill}
                  style={{ pointerEvents: "none" }}
                >
                  {isPending ? "Remove" : block.value}
                </text>
              </g>
            );
          })}

          {/* Animated win traces (rendered above blocks) */}
          {won &&
            visualConnections.map((conn, i) => {
              const child = blockMap[conn.childId];
              const parent = blockMap[conn.parentId];
              if (!child || !parent || parent.row > winAnimRow) return null;

              const childCx = bcx(child);
              const childCy = bcy(child);
              const parentCx = bcx(parent);
              const parentCy = bcy(parent);
              const childR = Math.min(child.w / 2 - 7, BLOCK_H / 2 - 9, 16);
              const parentR = Math.min(parent.w / 2 - 7, BLOCK_H / 2 - 9, 16);

              const dx = parentCx - childCx;
              const dy = parentCy - childCy;
              const dist = Math.hypot(dx, dy) || 1;
              const ux = dx / dist;
              const uy = dy / dist;

              // Endpoints lie on circle boundaries so connectors touch circles with no gaps.
              const x1 = childCx + ux * childR;
              const y1 = childCy + uy * childR;
              const x2 = parentCx - ux * parentR;
              const y2 = parentCy - uy * parentR;
              const d = `M ${x1} ${y1} L ${x2} ${y2}`;
              const approxLen = Math.hypot(x2 - x1, y2 - y1) * 1.35;
              const rowDelay = parent.row * WIN_LAYER_DELAY_MS + 110;
              const animationValue = winStyle.flow
                ? `lineGrow ${WIN_TRACE_DRAW_MS}ms ease-out forwards, traceFlow 0.9s linear infinite`
                : `lineGrow ${WIN_TRACE_DRAW_MS}ms ease-out forwards`;
              return (
                <path
                  key={`l${i}`}
                  d={d}
                  fill="none"
                  stroke={winStyle.traceColor}
                  strokeWidth={winStyle.traceWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={`${approxLen} ${approxLen}`}
                  strokeDashoffset={approxLen}
                  style={{
                    animation: animationValue,
                    animationDelay: `${rowDelay}ms`,
                    opacity: 0,
                    filter: "drop-shadow(0 0 1.5px rgba(34,197,94,0.9))",
                  }}
                />
              );
            })}

        </svg>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap", justifyContent: "center" }}>
        <button className="game-btn" onClick={undo} disabled={history.length === 0 || busy || won || lost}>
          Undo
        </button>
        <button className="game-btn" onClick={reset}>
          Reset
        </button>
      </div>

      <div style={{ marginTop: 14, width: "100%", maxWidth: 560 }}>
        {won ? (
          <button
            onClick={handlePostWinAction}
            style={{
              width: 292,
              height: 58,
              borderRadius: 4,
              border: "2px solid #111",
              background: "#111",
              color: "#fff",
              fontFamily: FONT,
              fontSize: 16,
              fontWeight: 900,
              letterSpacing: "0.03em",
              textTransform: "uppercase",
              cursor: "pointer",
              display: "block",
              margin: "0 auto",
            }}
          >
            {hasNextPuzzle ? "Play next puzzle" : "Play all puzzles"}
          </button>
        ) : (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#999",
              textAlign: "center",
              lineHeight: 1.35,
            }}
          >
            Remove blocks
            <br />
            to build a factor henge
          </p>
        )}
      </div>
    </div>
  );
}


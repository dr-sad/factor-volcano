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
import { findCascade, checkWin, computeConnections, overlapPx } from "./physics.js";

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

export default function FactorVolcanoGame({ initialPuzzleIdx = 0, mode = "today", onBackHome }) {
  const allowedPuzzleIndices = useMemo(() => {
    if (mode === "tutorial") return [0];
    return PUZZLES.map((_, i) => i).filter((i) => i !== 0);
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
  const topRowAll = useMemo(() => countMaxRow(blocks), [blocks]);

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

  const connections = won ? computeConnections(blocks, present) : [];

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
        @keyframes circleAppear { from { r:0; opacity:0; } to { r:1; opacity:1; } }
        @keyframes lineGrow { from { stroke-dashoffset:500; } to { stroke-dashoffset:0; } }
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

      <h1 style={{ fontSize: 46, fontWeight: 900, letterSpacing: "0.08em", margin: "0 0 14px" }}>FACTOR HENGE</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", justifyContent: "center" }}>
        {allowedPuzzleIndices.map((i) => {
          const p = PUZZLES[i];
          const isSolved = !!progress.solved?.[p.name];
          return (
            <button
              key={i}
              className={`pz-btn ${i === puzzleIdx ? "active" : ""} ${isSolved ? "solved" : ""}`}
              onClick={() => loadPuzzle(i)}
              title={isSolved ? "Solved" : "Not solved yet"}
            >
              {p.name}
            </button>
          );
        })}
      </div>

      {showSolved && <div style={{ animation: "fadeIn 0.5s ease-out", padding: "10px 28px", marginBottom: 14, background: "#e8f5e9", border: "2px solid #4caf50", borderRadius: 8, fontSize: 16, fontWeight: 800, color: "#2e7d32" }}>SOLVED!</div>}

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
          {/* Connection lines */}
          {won &&
            connections.map((conn, i) => {
              const child = blockMap[conn.childId];
              const parent = blockMap[conn.parentId];
              if (!child || !parent || child.row > winAnimRow) return null;
              const x1 = bcx(child),
                y1 = bcy(child),
                x2 = bcx(parent),
                y2 = bcy(parent);
              const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
              return (
                <line
                  key={`l${i}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#d32f2f"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeDasharray={len}
                  strokeDashoffset={0}
                  style={{ animation: "lineGrow 0.4s ease-out forwards", opacity: 0.85 }}
                />
              );
            })}

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

            let fill = "#2b4570";
            let textFill = "#ffffff";
            if (isWinActivated) fill = "#e65100";
            else if (isPending) fill = "#d32f2f";

            // Highlight outlines
            let stroke = "none";
            let strokeWidth = 0;
            if (isWinActivated) {
              stroke = "none";
            } else if (isPending) {
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
                  style={isWinActivated ? { transition: "fill 0.4s ease-out" } : undefined}
                />
                <text
                  x={x + w / 2}
                  y={y + h / 2 + 1}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={block.value >= 100 ? 16 : block.value >= 10 ? 18 : 20}
                  fontWeight="800"
                  fontFamily={FONT}
                  fill={textFill}
                  style={{ pointerEvents: "none" }}
                >
                  {isPending ? "Remove" : block.value}
                </text>
              </g>
            );
          })}

          {/* Red circles (win activation) */}
          {won &&
            blocks
              .filter((b) => present.has(b.id) && b.row <= winAnimRow)
              .map((block) => {
                const r = Math.min(block.w / 2 - 4, BLOCK_H / 2 - 6, 18);
                return (
                  <circle
                    key={`c${block.id}`}
                    cx={bcx(block)}
                    cy={bcy(block)}
                    r={r}
                    fill="none"
                    stroke="#d32f2f"
                    strokeWidth={2.5}
                    style={{ animation: "circleAppear 0.3s ease-out forwards" }}
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

      <p style={{ marginTop: 14, fontSize: 13, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#999", textAlign: "center" }}>
        Remove blocks to satisfy the factor tower.
      </p>
    </div>
  );
}


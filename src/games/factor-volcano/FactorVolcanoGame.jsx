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
import { supporters, isStable, findCascade, checkWin, computeConnections, overlapPx } from "./physics.js";

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
    if (typeof window === "undefined") return { bestMoves: {}, solved: {} };
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return { bestMoves: {}, solved: {} };
    const parsed = JSON.parse(raw);
    return {
      bestMoves: parsed.bestMoves || {},
      solved: parsed.solved || {},
    };
  } catch {
    return { bestMoves: {}, solved: {} };
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

function applyCascadeToSet(allBlocks, presentSet) {
  const falling = findCascade(allBlocks, presentSet);
  if (falling.length === 0) return presentSet;
  const next = new Set(presentSet);
  falling.forEach((id) => next.delete(id));
  return next;
}

function scoreCandidate({ allBlocks, candidateId, basePresentSet, topRow }) {
  const base = new Set(basePresentSet);
  base.delete(candidateId);

  const afterCascade = applyCascadeToSet(allBlocks, base);
  const topStillPresent = allBlocks.some((b) => b.row === topRow && afterCascade.has(b.id));
  if (!topStillPresent) return { score: -Infinity, resultingPresent: afterCascade };

  // Score by "how many blocks are currently satisfying the win constraints".
  let score = 0;
  for (const b of allBlocks) {
    if (!afterCascade.has(b.id)) continue;
    if (b.row === 0) continue;

    const sups = supporters(b, allBlocks, afterCascade);
    const okStable = isStable(b, allBlocks, afterCascade);
    if (!okStable) continue;

    if (sups.length >= 2) {
      const product = sups.reduce((acc, s) => acc * s.value, 1);
      if (product === b.value) score += 2;
      else score += 0.25;
    } else {
      score += 0.25;
    }
  }

  return { score, resultingPresent: afterCascade };
}

const FONT = `'Inter', 'Helvetica Neue', Arial, sans-serif`;

export default function FactorVolcanoGame() {
  const [puzzleIdx, setPuzzleIdx] = useState(0);
  const [blocks, setBlocks] = useState(() => buildBlocks(PUZZLES[0]));
  const [present, setPresent] = useState(() => new Set(buildBlocks(PUZZLES[0]).map((b) => b.id)));
  const [hovered, setHovered] = useState(null);
  const [hinted, setHinted] = useState(null);
  const [revealSolution, setRevealSolution] = useState(false);

  const [fallingSet, setFallingSet] = useState(new Set());
  const [fallFrames, setFallFrames] = useState({});
  const [won, setWon] = useState(false);
  const [lost, setLost] = useState(false);
  const [busy, setBusy] = useState(false);

  const [history, setHistory] = useState([]);
  const [moves, setMoves] = useState(0);
  const [showSolved, setShowSolved] = useState(false);

  const [winAnimRow, setWinAnimRow] = useState(-1);
  const [progress, setProgress] = useState(() => loadProgress());
  const [hintMessage, setHintMessage] = useState("");
  const [hintsUsed, setHintsUsed] = useState(0);
  const MAX_HINTS = 3;

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

  const hoveredBlock = hovered ? blockMap[hovered] : null;
  const hoveredSupporters = useMemo(() => {
    if (!hoveredBlock) return [];
    return supporters(hoveredBlock, blocks, present);
  }, [hoveredBlock, blocks, present]);
  const hoveredSupportIds = useMemo(() => new Set(hoveredSupporters.map((b) => b.id)), [hoveredSupporters]);

  const maxRight = useMemo(() => Math.max(...blocks.map((b) => b.x + b.w)), [blocks]);
  const svgW = maxRight + SVG_PAD * 2;
  const rowStep = BLOCK_H + GAP;
  const svgH = svgW;

  const bx = (block) => SVG_PAD + block.x;
  const by = (block) => svgH - SVG_PAD - (block.row + 1) * rowStep;
  const bcx = (block) => bx(block) + block.w / 2;
  const bcy = (block) => by(block) + BLOCK_H / 2;

  const loadPuzzle = (idx) => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (winTimerRef.current) clearTimeout(winTimerRef.current);

    const newBlocks = buildBlocks(PUZZLES[idx]);
    setPuzzleIdx(idx);
    setBlocks(newBlocks);
    setPresent(new Set(newBlocks.map((b) => b.id)));
    setHovered(null);
    setHinted(null);
    setRevealSolution(false);
    setFallingSet(new Set());
    setFallFrames({});
    setWon(false);
    setLost(false);
    setBusy(false);
    setHistory([]);
    setMoves(0);
    progressUpdatedRef.current = false;

    setWinAnimRow(-1);
    setShowSolved(false);
    setHintMessage("");
    setHintsUsed(0);
  };

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
      const bestMoves = { ...(prev.bestMoves || {}) };
      const solved = { ...(prev.solved || {}) };

      const currentBest = bestMoves[puzzleKey];
      if (currentBest === undefined || moves < currentBest) bestMoves[puzzleKey] = moves;
      solved[puzzleKey] = true;

      const next = { bestMoves, solved };
      saveProgress(next);
      return next;
    });
  }, [won, moves, puzzleKey]);

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

      setHinted(null);
      setRevealSolution(false);
      setHintMessage("");

      setBusy(true);
      setHistory((h) => [...h, present]);
      setMoves((m) => m + 1);
      setHovered(null);

      const next = new Set(present);
      next.delete(block.id);
      setPresent(next);

      const cascade = findCascade(blocks, next);
      setTimeout(() => runFallAnimation(cascade, next, blocks), 60);
    },
    [busy, won, lost, present, topRowAll, blocks, runFallAnimation],
  );

  const reset = () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (winTimerRef.current) clearTimeout(winTimerRef.current);

    setPresent(new Set(blocks.map((b) => b.id)));
    setHovered(null);
    setHinted(null);
    setRevealSolution(false);
    setFallingSet(new Set());
    setFallFrames({});
    setWon(false);
    setLost(false);
    setBusy(false);
    setHistory([]);
    setMoves(0);
    setShowSolved(false);
    setWinAnimRow(-1);
    setHintMessage("");
    setHintsUsed(0);
    progressUpdatedRef.current = false;
  };

  const undo = () => {
    if (busy || won || lost || history.length === 0) return;
    const prev = history[history.length - 1];
    setPresent(prev);
    setHistory((h) => h.slice(0, -1));
    setMoves((m) => Math.max(0, m - 1));
    setHinted(null);
    setRevealSolution(false);
    setHintMessage("");
  };

  const connections = won ? computeConnections(blocks, present) : [];

  const hintAvailable = !busy && !won && !lost && hintsUsed < MAX_HINTS;

  const computeBestHint = useCallback(() => {
    if (!hintAvailable) return;
    setHintMessage("");
    setHinted(null);

    const legal = blocks.filter((b) => present.has(b.id) && b.row !== topRowAll);
    if (legal.length === 0) {
      setHintMessage("No legal removals.");
      return;
    }

    let bestId = null;
    let bestScore = -Infinity;

    for (const cand of legal) {
      const { score } = scoreCandidate({
        allBlocks: blocks,
        candidateId: cand.id,
        basePresentSet: present,
        topRow: topRowAll,
      });

      if (score > bestScore) {
        bestScore = score;
        bestId = cand.id;
      }
    }

    if (!bestId || bestScore === -Infinity) {
      setHintMessage("All moves would collapse the top row. Try a different approach.");
      return;
    }

    setHinted(bestId);
    setHintsUsed((h) => h + 1);

    const b = blockMap[bestId];
    const sups = supporters(b, blocks, present);
    const product = sups.reduce((acc, s) => acc * s.value, 1);
    setHintMessage(
      `Hint: remove ${b.value} (row ${b.row}). It maximizes currently-satisfied factor constraints.`,
    );
    return { bestScore, bestId, product };
  }, [hintAvailable, blocks, present, topRowAll, blockMap]);

  const showSolution = won && revealSolution;
  const intendedSolutionIds = useMemo(() => {
    const s = new Set();
    blocks.forEach((b) => {
      if (b.isSolution) s.add(b.id);
    });
    return s;
  }, [blocks]);

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
        .blk:hover .body { filter: brightness(1.15); }
        @keyframes fadeIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes circleAppear { from { r:0; opacity:0; } to { r:1; opacity:1; } }
        @keyframes lineGrow { from { stroke-dashoffset:500; } to { stroke-dashoffset:0; } }
        .game-btn {
          padding: 12px 0; width: 140px; background: #ffffff;
          border: 2px solid #d0d0d0; border-radius: 6px;
          font-family: 'Inter', sans-serif; font-size: 13px;
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
          font-size: 14px; font-weight: 800; color: #999;
          cursor: pointer; transition: all 0.15s;
          display: flex; align-items: center; justify-content: center;
        }
        .pz-btn:hover { border-color: #888; color: #555; }
        .pz-btn.active { background: #2b4570; border-color: #2b4570; color: #fff; }
        .pz-btn.solved { border-color: #4caf50; }
      `}</style>

      <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: "0.04em", margin: "0 0 12px" }}>FACTOR HENGE</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", justifyContent: "center" }}>
        {PUZZLES.map((p, i) => {
          const bestMoves = progress.bestMoves?.[p.name];
          const isSolved = !!progress.solved?.[p.name];
          return (
            <button
              key={i}
              className={`pz-btn ${i === puzzleIdx ? "active" : ""} ${isSolved ? "solved" : ""}`}
              onClick={() => loadPuzzle(i)}
              title={isSolved ? `Solved in ${bestMoves} moves` : "Not solved yet"}
            >
              {p.name}
              {typeof bestMoves === "number" ? ` (${bestMoves})` : ""}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, margin: "0 0 14px" }}>
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", color: "#999", textTransform: "uppercase" }}>
          Moves
        </span>
        <span style={{ fontSize: 28, fontWeight: 900, color: "#1a1a1a" }}>{moves}</span>
      </div>

      <div style={{ maxWidth: 720, width: "100%", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#444", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
          Goal
        </div>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "#666" }}>
          Remove blocks from the tower (never the top row directly). Any blocks that become unstable collapse away.
          For every remaining block above the base row, its value must equal the product of at least two overlapping supporter blocks below it
          (and it must be stable). If the entire top row collapses, you lose.
        </p>
      </div>

      {hintMessage && (
        <div
          style={{
            width: "100%",
            maxWidth: 720,
            marginBottom: 10,
            padding: "10px 14px",
            borderRadius: 8,
            background: "#f5f7ff",
            border: "2px solid #c7d2fe",
            color: "#3730a3",
            fontWeight: 800,
            letterSpacing: "0.02em",
          }}
        >
          {hintMessage}
        </div>
      )}

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

      <div style={{ border: "2px solid #1a1a1a", borderRadius: 2, padding: "8px", background: "#ffffff", overflow: "hidden" }}>
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
            const isHov = hovered === block.id && !busy;
            const isWinActivated = won && block.row <= winAnimRow;
            const isHoveredSupport = hoveredSupportIds.has(block.id) && hovered !== block.id;

            let fill = "#2b4570";
            let textFill = "#ffffff";
            if (isWinActivated) fill = "#e65100";
            else if (isHov) fill = "#3a5a8c";

            const showSol = showSolution && intendedSolutionIds.has(block.id) && present.has(block.id);

            // Highlight outlines
            let stroke = "none";
            let strokeWidth = 0;
            if (isWinActivated) {
              stroke = "none";
            } else if (hinted === block.id) {
              stroke = "#111";
              strokeWidth = 3;
            } else if (isHov) {
              stroke = "#00aaff";
              strokeWidth = 3;
            } else if (isHoveredSupport) {
              stroke = "#ffd166";
              strokeWidth = 3;
            } else if (showSol) {
              stroke = "#00bcd4";
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
                onClick={() => handleClick(block)}
                onMouseEnter={() => {
                  if (!isTopBlock && !busy && !won && !lost) setHovered(block.id);
                }}
                onMouseLeave={() => setHovered(null)}
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
                  {block.value}
                </text>
              </g>
            );
          })}

          {/* Solution highlight circles */}
          {showSolution &&
            blocks
              .filter((b) => present.has(b.id) && b.isSolution)
              .map((block) => {
                const r = Math.min(block.w / 2 - 4, BLOCK_H / 2 - 8, 18);
                return (
                  <circle
                    key={`solc${block.id}`}
                    cx={bcx(block)}
                    cy={bcy(block)}
                    r={r}
                    fill="none"
                    stroke="#00bcd4"
                    strokeWidth={2.5}
                    style={{ animation: "circleAppear 0.3s ease-out forwards" }}
                  />
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

        <button className="game-btn" onClick={computeBestHint} disabled={!hintAvailable} style={{ width: 170 }}>
          Hint{hintsUsed > 0 ? ` (${hintsUsed}/${MAX_HINTS})` : ""}
        </button>

        <button
          className="game-btn"
          onClick={() => setRevealSolution((v) => !v)}
          disabled={!won}
          style={{ width: 220 }}
        >
          {revealSolution ? "Hide Solution" : "Reveal Solution"}
        </button>
      </div>

      <p style={{ marginTop: 14, fontSize: 13, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#999", textAlign: "center" }}>
        Remove blocks to satisfy the factor tower.
      </p>
    </div>
  );
}


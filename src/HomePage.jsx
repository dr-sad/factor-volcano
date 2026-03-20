import React from "react";

const FONT = `'Inter', 'Helvetica Neue', Arial, sans-serif`;

function IconShape() {
  return (
    <svg width="76" height="78" viewBox="0 0 76 78" aria-hidden="true">
      <rect x="8" y="8" width="30" height="62" fill="#F97316" stroke="#111" strokeWidth="3" />
      <rect x="44" y="8" width="24" height="28" fill="#24507A" stroke="#111" strokeWidth="3" />
      <rect x="44" y="42" width="24" height="28" fill="#24507A" stroke="#111" strokeWidth="3" />
    </svg>
  );
}

export default function HomePage({ onPlayToday, onPlayTutorial }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#efefef",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: FONT,
        color: "#111",
        padding: 16,
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
        .home-btn {
          width: 100%;
          height: 58px;
          border-radius: 4px;
          font-size: 30px;
          font-weight: 900;
          letter-spacing: 0.01em;
          cursor: pointer;
          border: 2px solid #111;
          text-transform: uppercase;
          transition: transform 0.1s ease;
          font-family: 'Inter', sans-serif;
        }
        .home-btn:active {
          transform: translateY(1px);
        }
      `}</style>

      <div style={{ width: "100%", maxWidth: 560 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 2 }}>
          <button
            aria-label="Close"
            style={{
              border: "none",
              background: "transparent",
              fontSize: 42,
              lineHeight: 1,
              cursor: "default",
              color: "#111",
            }}
          >
            ×
          </button>
        </div>

        <h1
          style={{
            textAlign: "center",
            fontSize: 44,
            margin: "4px 0 20px",
            fontWeight: 900,
            letterSpacing: "0.1em",
          }}
        >
          SUM TILES
        </h1>

        <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
          <IconShape />
        </div>

        <p style={{ textAlign: "center", fontSize: 36, lineHeight: 1.35, margin: "0 6px 26px", fontWeight: 500 }}>
          Slide the tiles so the <strong>sum</strong> of the numbers in every row and column matches its target.
        </p>

        <p style={{ textAlign: "center", fontSize: 40, lineHeight: 1.35, margin: "0 6px 34px", fontWeight: 500 }}>
          Square tiles can slide in all four directions. Long rectangles only slide the long way.
        </p>

        <div style={{ display: "grid", gap: 14 }}>
          <button className="home-btn" style={{ background: "#111", color: "#fff" }} onClick={onPlayToday}>
            Play Today's Puzzles
          </button>
          <button className="home-btn" style={{ background: "transparent", color: "#111" }} onClick={onPlayTutorial}>
            Tutorial Puzzles
          </button>
        </div>
      </div>
    </div>
  );
}


import React, { useState } from "react";
import FactorVolcanoGame from "./games/factor-volcano/FactorVolcanoGame.jsx";
import HomePage from "./HomePage.jsx";

export default function App() {
  const [screen, setScreen] = useState("home");
  const [startPuzzleIdx, setStartPuzzleIdx] = useState(0);
  const [gameMode, setGameMode] = useState("today");

  if (screen === "home") {
    return (
      <HomePage
        onPlayToday={() => {
          setStartPuzzleIdx(1);
          setGameMode("today");
          setScreen("game");
        }}
        onPlayTutorial={() => {
          setStartPuzzleIdx(0);
          setGameMode("tutorial");
          setScreen("game");
        }}
      />
    );
  }

  return (
    <FactorVolcanoGame
      initialPuzzleIdx={startPuzzleIdx}
      mode={gameMode}
      onBackHome={() => setScreen("home")}
    />
  );
}


// Puzzle definitions for Factor Volcano.
// Each puzzle has rows; each block has:
// - v: target value for factor checks
// - w: visual width weight
// - sol: whether this block is part of an intended solution (used for optional reveal)
export const PUZZLES = [
  {
    name: "1",
    rows: [
      [
        { v: 2, w: 1.6, sol: true },
        { v: 3, w: 1.8, sol: true },
        { v: 5, w: 1.8, sol: true },
        { v: 7, w: 1.7, sol: false },
        { v: 4, w: 1.8, sol: false },
      ],
      [{ v: 30, w: 8.0, sol: true }],
    ],
  },
  {
    name: "2",
    rows: [
      [
        { v: 2, w: 1.5, sol: true },
        { v: 2, w: 1.5, sol: true },
        { v: 2, w: 1.5, sol: true },
        { v: 4, w: 1.8, sol: false },
        { v: 4, w: 1.8, sol: false },
        { v: 2, w: 1.5, sol: false },
        { v: 2, w: 1.5, sol: true },
        { v: 4, w: 1.8, sol: true },
        { v: 3, w: 1.7, sol: false },
      ],
      [
        { v: 8, w: 4.6, sol: true },
        { v: 16, w: 2.0, sol: false },
        { v: 4, w: 2.0, sol: false },
        { v: 8, w: 4.6, sol: true },
      ],
      [{ v: 64, w: 9.5, sol: true }],
    ],
  },
  {
    name: "3",
    rows: [
      [
        { v: 3, w: 1.6, sol: false },
        { v: 2, w: 1.5, sol: true },
        { v: 2, w: 1.5, sol: true },
        { v: 2, w: 1.5, sol: true },
        { v: 6, w: 1.8, sol: false },
        { v: 3, w: 1.8, sol: true },
        { v: 5, w: 1.8, sol: true },
        { v: 5, w: 2.0, sol: false },
        { v: 3, w: 1.6, sol: false },
      ],
      [
        { v: 8, w: 5.0, sol: true },
        { v: 12, w: 2.4, sol: false },
        { v: 15, w: 3.2, sol: true },
        { v: 10, w: 3.2, sol: false },
      ],
      [{ v: 120, w: 9.5, sol: true }],
    ],
  },
  {
    name: "4",
    rows: [
      [
        { v: 4, w: 2.2, sol: true },
        { v: 2, w: 1.4, sol: true },
        { v: 2, w: 1.4, sol: false },
        { v: 9, w: 1.7, sol: false },
        { v: 2, w: 1.6, sol: true },
        { v: 2, w: 1.6, sol: false },
        { v: 1, w: 1.2, sol: true },
        { v: 2, w: 1.4, sol: true },
        { v: 3, w: 1.7, sol: false },
        { v: 2, w: 1.4, sol: true },
        { v: 2, w: 1.4, sol: true },
        { v: 2, w: 1.4, sol: true },
      ],
      [
        { v: 8, w: 2.2, sol: true },
        { v: 8, w: 2.0, sol: false },
        { v: 18, w: 2.4, sol: false },
        { v: 4, w: 1.8, sol: true },
        { v: 2, w: 1.3, sol: false },
        { v: 2, w: 1.3, sol: true },
        { v: 4, w: 1.8, sol: false },
        { v: 4, w: 1.8, sol: true },
        { v: 8, w: 2.8, sol: true },
      ],
      [
        { v: 64, w: 4.8, sol: true },
        { v: 2, w: 1.4, sol: false },
        { v: 8, w: 2.4, sol: true },
        { v: 16, w: 6.9, sol: true },
      ],
      [{ v: 128, w: 10, sol: true }],
    ],
  },
  {
    name: "5",
    rows: [
      [
        { v: 5, w: 1.8, sol: true },
        { v: 5, w: 1.8, sol: true },
        { v: 9, w: 1.8, sol: false },
        { v: 7, w: 1.7, sol: false },
        { v: 10, w: 2.0, sol: false },
        { v: 3, w: 1.6, sol: false },
        { v: 2, w: 1.6, sol: true },
        { v: 3, w: 1.8, sol: true },
      ],
      [
        { v: 25, w: 4.5, sol: true },
        { v: 50, w: 3.0, sol: false },
        { v: 10, w: 2.8, sol: false },
        { v: 6, w: 2.8, sol: true },
      ],
      [{ v: 150, w: 9.5, sol: true }],
    ],
  },
  {
    name: "6",
    rows: [
      [
        { v: 3, w: 1.7, sol: false },
        { v: 2, w: 1.6, sol: false },
        { v: 5, w: 1.6, sol: true },
        { v: 4, w: 1.9, sol: true },
        { v: 2, w: 1.7, sol: false },
        { v: 4, w: 1.8, sol: true },
        { v: 5, w: 1.8, sol: true },
        { v: 4, w: 1.9, sol: false },
        { v: 2, w: 1.6, sol: false },
      ],
      [
        { v: 25, w: 3.8, sol: true },
        { v: 10, w: 3.8, sol: false },
        { v: 8, w: 3.8, sol: true },
        { v: 20, w: 3.8, sol: false },
      ],
      [{ v: 200, w: 9.0, sol: true }],
    ],
  },
];


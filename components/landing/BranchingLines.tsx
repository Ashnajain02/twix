"use client";

import { useEffect, useState } from "react";

const PATH_1 = "M -50,200 C 150,200 250,120 450,180 S 750,80 1000,150 S 1300,200 1500,120";
const PATH_2 = "M -50,500 C 200,500 350,400 550,450 S 800,350 1050,420";
const PATH_3 = "M 450,180 C 550,130 650,60 800,100 S 1000,50 1200,80";

const PATH_LENGTH = 2200; // approximate, generous

export function BranchingLines() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setProgress(1);
      return;
    }
    const onScroll = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (maxScroll <= 0) return;
      setProgress(window.scrollY / maxScroll);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const offset1 = PATH_LENGTH * (1 - Math.min(1, progress * 1.2));
  const offset2 = PATH_LENGTH * (1 - Math.min(1, Math.max(0, progress - 0.2) * 1.5));
  const offset3 = PATH_LENGTH * (1 - Math.min(1, Math.max(0, progress - 0.35) * 2));

  return (
    <svg
      className="branching-lines-svg"
      viewBox="0 0 1440 900"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d={PATH_1}
        stroke="rgba(217,119,87,0.18)"
        strokeWidth="1.5"
        fill="none"
        strokeDasharray={PATH_LENGTH}
        strokeDashoffset={offset1}
        strokeLinecap="round"
      />
      <path
        d={PATH_2}
        stroke="rgba(217,119,87,0.12)"
        strokeWidth="1"
        fill="none"
        strokeDasharray={PATH_LENGTH}
        strokeDashoffset={offset2}
        strokeLinecap="round"
      />
      {/* Branch fork off path 1 */}
      <path
        d={PATH_3}
        stroke="rgba(217,119,87,0.15)"
        strokeWidth="1"
        fill="none"
        strokeDasharray={PATH_LENGTH}
        strokeDashoffset={offset3}
        strokeLinecap="round"
      />
    </svg>
  );
}

"use client";

import { useEffect, useRef } from "react";

const ACCENT = { r: 217, g: 119, b: 87 };

interface TreeNode {
  x: number;
  y: number;
  parent: number | null;
  appearAt: number;
}

// Vertical tree centered behind text. Root at top-center, branches spread outward.
// 3 levels, 12 nodes total.
//
//                    (0)              ← root, top center
//                     |
//                    (1)              ← below title
//                  /  |  \
//               (2)  (3)  (4)        ← level 2, spread wide
//              / \    |    / \
//            (5)(6)  (7) (8)(9)      ← level 3, leaves
//             |               |
//           (10)            (11)     ← a couple extra tips
//
const TREE: TreeNode[] = [
  // Root (above headline)
  { x: 0.50, y: 0.06, parent: null, appearAt: 0.2 },
  // Level 1 (behind headline area)
  { x: 0.50, y: 0.28, parent: 0, appearAt: 0.7 },
  // Level 2 (below subtitle, spread wide)
  { x: 0.24, y: 0.56, parent: 1, appearAt: 1.3 },
  { x: 0.50, y: 0.54, parent: 1, appearAt: 1.5 },
  { x: 0.76, y: 0.56, parent: 1, appearAt: 1.7 },
  // Level 3 — children of (2)
  { x: 0.13, y: 0.80, parent: 2, appearAt: 2.3 },
  { x: 0.32, y: 0.78, parent: 2, appearAt: 2.5 },
  // Level 3 — child of (3)
  { x: 0.50, y: 0.80, parent: 3, appearAt: 2.4 },
  // Level 3 — children of (4)
  { x: 0.68, y: 0.78, parent: 4, appearAt: 2.6 },
  { x: 0.87, y: 0.80, parent: 4, appearAt: 2.8 },
  // Level 4 tips
  { x: 0.08, y: 0.95, parent: 5, appearAt: 3.3 },
  { x: 0.92, y: 0.95, parent: 9, appearAt: 3.5 },
];

const NODE_R = 8;
const LINE_W = 2;
const GROW_DURATION = 0.5;

export function HeroBranchGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const animRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);
    resize();

    const onMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onLeave = () => { mouseRef.current = { x: -9999, y: -9999 }; };
    canvas.addEventListener("mousemove", onMouse, { passive: true });
    canvas.addEventListener("mouseleave", onLeave);

    const t0 = performance.now();

    const animate = () => {
      animRef.current = requestAnimationFrame(animate);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const t = (performance.now() - t0) / 1000;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      const pts = TREE.map((n) => ({ x: n.x * w, y: n.y * h }));

      // Draw edges
      for (let i = 0; i < TREE.length; i++) {
        const node = TREE[i];
        if (node.parent === null) continue;

        const growStart = node.appearAt - GROW_DURATION;
        if (t < growStart) continue;

        const gp = Math.min(1, (t - growStart) / GROW_DURATION);
        const eased = 1 - Math.pow(1 - gp, 3);

        const pp = pts[node.parent];
        const cp = pts[i];
        const endX = pp.x + (cp.x - pp.x) * eased;
        const endY = pp.y + (cp.y - pp.y) * eased;

        const midX = (pp.x + endX) / 2;
        const midY = (pp.y + endY) / 2;
        const dMouse = Math.hypot(mx - midX, my - midY);
        const mouseBoost = Math.max(0, 1 - dMouse / 220) * 0.1;

        ctx.beginPath();
        const cpy = (pp.y + endY) / 2;
        ctx.moveTo(pp.x, pp.y);
        ctx.bezierCurveTo(pp.x, cpy, endX, cpy, endX, endY);
        ctx.strokeStyle = `rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},${0.16 + mouseBoost})`;
        ctx.lineWidth = LINE_W;
        ctx.lineCap = "round";
        ctx.stroke();
      }

      // Draw nodes
      for (let i = 0; i < TREE.length; i++) {
        const node = TREE[i];
        if (t < node.appearAt) continue;

        const age = t - node.appearAt;
        const scaleIn = Math.min(1, age / 0.3);
        const ease = 1 - Math.pow(1 - scaleIn, 3);

        const p = pts[i];
        const dMouse = Math.hypot(mx - p.x, my - p.y);
        const mouseProx = Math.max(0, 1 - dMouse / 160);
        const pulse = Math.sin(t * 1.5 + i * 1.1) * 0.04;

        const alpha = (0.20 + pulse + mouseProx * 0.3) * ease;
        const r = (NODE_R + mouseProx * 5) * ease;

        if (mouseProx > 0.05 && ease > 0.5) {
          const grad = ctx.createRadialGradient(p.x, p.y, r, p.x, p.y, r * 5);
          grad.addColorStop(0, `rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},${mouseProx * 0.1})`);
          grad.addColorStop(1, `rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},0)`);
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 5, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},${alpha})`;
        ctx.fill();
      }
    };

    animate();

    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
      canvas.removeEventListener("mousemove", onMouse);
      canvas.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <canvas ref={canvasRef} className="w-full h-full" style={{ pointerEvents: "auto" }} />
    </div>
  );
}

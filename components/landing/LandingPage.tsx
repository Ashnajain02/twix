"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ScrollWalkthrough } from "./ScrollWalkthrough";

interface LandingPageProps {
  isLoggedIn: boolean;
}

/* ─── Logo ──────────────────────────────────────────────────────── */
function Logo({ variant = "dark" }: { variant?: "dark" | "white" }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <Image
        src={variant === "white" ? "/logo-white.svg" : "/logo.svg"}
        alt=""
        width={28}
        height={28}
        className="h-7 w-7"
      />
      <span
        className="text-xl font-semibold tracking-tight"
        style={{
          color:
            variant === "white" ? "#FFFFFF" : "var(--color-text-primary)",
        }}
      >
        twix
      </span>
    </Link>
  );
}

/* ─── Navigation ────────────────────────────────────────────────── */
function Nav({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: scrolled ? "rgba(250,250,248,0.92)" : "transparent",
        backdropFilter: scrolled ? "blur(16px)" : "none",
        borderBottom: scrolled
          ? "1px solid var(--color-border)"
          : "1px solid transparent",
      }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Logo />
        <div className="flex items-center gap-3">
          {isLoggedIn ? (
            <Link href="/c" className="landing-btn-primary">
              Open App
            </Link>
          ) : (
            <>
              <Link href="/login" className="landing-nav-link hidden sm:block">
                Sign in
              </Link>
              <Link href="/register" className="landing-btn-primary">
                Get Started
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION 1: Scroll-Driven Branching Headline
   ═══════════════════════════════════════════════════════════════════
   600vh tall container. Content is sticky-centered in the viewport.
   As the user scrolls, words appear one by one along a branching path:

      Your ── thoughts ── branch.
                  ●
                  │
         Your ── AI ── should ── too.

   Then subtitle + scroll hint appear.
   ═══════════════════════════════════════════════════════════════════ */

const LINE1 = ["Your", "thoughts", "branch."];
const LINE2 = ["Your", "AI", "should", "too."];
const TOTAL_STEPS = LINE1.length + 1 + LINE2.length + 2; // 10

function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setProgress(1);
      return;
    }
    const onScroll = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const scrollable = el.offsetHeight - window.innerHeight;
      if (scrollable <= 0) return;
      setProgress(Math.max(0, Math.min(1, -rect.top / scrollable)));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const step = progress * TOTAL_STEPS;
  // First word visible immediately (no scroll needed to see something)
  const line1Show = LINE1.map((_, i) => i === 0 || step >= i + 1);
  const forkShow = step >= LINE1.length + 1;
  const forkGrow = Math.min(1, Math.max(0, (step - LINE1.length) / 1));
  const line2Show = LINE2.map((_, i) => step >= LINE1.length + 1 + i + 1);
  const subtitleShow = step >= TOTAL_STEPS - 1;
  const hintShow = step >= TOTAL_STEPS;

  return (
    <div ref={containerRef} style={{ height: "600vh" }}>
      <div
        className="sticky top-0 flex items-center justify-center"
        style={{ height: "100vh" }}
      >
        <div className="flex flex-col items-center px-6">
          {/* Line 1 */}
          <div className="flex items-center justify-center flex-wrap">
            {LINE1.map((word, i) => (
              <span key={i} className="flex items-center">
                {i > 0 && (
                  <span
                    style={{
                      display: "inline-block",
                      width: 36,
                      height: 2.5,
                      borderRadius: 2,
                      margin: "0 8px",
                      background: line1Show[i]
                        ? "rgba(217,119,87,0.3)"
                        : "transparent",
                      transition: "background 0.4s ease",
                    }}
                  />
                )}
                <span
                  className="text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl"
                  style={{
                    color: "var(--color-text-primary)",
                    opacity: line1Show[i] ? 1 : 0,
                    transform: line1Show[i]
                      ? "translateY(0)"
                      : "translateY(16px)",
                    transition: "opacity 0.5s ease, transform 0.5s ease",
                    display: "inline-block",
                    whiteSpace: "nowrap",
                  }}
                >
                  {word}
                </span>
              </span>
            ))}
          </div>

          {/* Fork node + line */}
          <div
            className="flex flex-col items-center"
            style={{
              opacity: forkShow ? 1 : 0,
              transition: "opacity 0.4s ease",
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: "rgba(217,119,87,0.45)",
                marginTop: 20,
                boxShadow: "0 0 20px rgba(217,119,87,0.3)",
              }}
            />
            <div
              style={{
                width: 2.5,
                height: 48,
                borderRadius: 2,
                background: "rgba(217,119,87,0.3)",
                transformOrigin: "top",
                transform: `scaleY(${forkGrow})`,
              }}
            />
          </div>

          {/* Line 2 */}
          <div
            className="flex items-center justify-center flex-wrap"
            style={{ marginTop: 10 }}
          >
            {LINE2.map((word, i) => (
              <span key={i} className="flex items-center">
                {i > 0 && (
                  <span
                    style={{
                      display: "inline-block",
                      width: 28,
                      height: 2.5,
                      borderRadius: 2,
                      margin: "0 8px",
                      background: line2Show[i]
                        ? "rgba(217,119,87,0.3)"
                        : "transparent",
                      transition: "background 0.4s ease",
                    }}
                  />
                )}
                <span
                  className="text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl"
                  style={{
                    color: "var(--color-accent)",
                    opacity: line2Show[i] ? 1 : 0,
                    transform: line2Show[i]
                      ? "translateY(0)"
                      : "translateY(16px)",
                    transition: "opacity 0.5s ease, transform 0.5s ease",
                    display: "inline-block",
                    whiteSpace: "nowrap",
                  }}
                >
                  {word}
                </span>
              </span>
            ))}
          </div>

          {/* Subtitle */}
          <p
            className="mt-10 max-w-2xl text-lg leading-relaxed md:text-xl text-center"
            style={{
              color: "var(--color-text-secondary)",
              opacity: subtitleShow ? 1 : 0,
              transform: subtitleShow ? "translateY(0)" : "translateY(10px)",
              transition: "opacity 0.5s ease, transform 0.5s ease",
            }}
          >
            Explore any tangent without losing context. Branch, merge, and
            build — all in one conversation.
          </p>

          {/* Scroll hint */}
          <div
            className="mt-8 flex flex-col items-center gap-2"
            style={{
              opacity: hintShow ? 1 : 0,
              transition: "opacity 0.5s ease",
            }}
          >
            <p
              className="text-xs font-medium"
              style={{ color: "var(--color-text-muted)" }}
            >
              Keep scrolling
            </p>
            <svg
              className="h-5 w-5 scroll-hint"
              style={{ color: "var(--color-text-muted)" }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION 3: Brief Features
   ═══════════════════════════════════════════════════════════════════ */

function useFadeIn<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("landing-visible");
          observer.unobserve(el);
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

const features = [
  {
    name: "Tangent Threads",
    desc: "Highlight text → branch → explore → merge back",
  },
  {
    name: "Cloud Sandbox",
    desc: "Clone repos, run code, preview live — all in chat",
  },
  {
    name: "Web Intelligence",
    desc: "Real-time search with inline citations",
  },
  {
    name: "Infinite Depth",
    desc: "Tangents within tangents within tangents",
  },
];

function BriefFeatures() {
  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto max-w-2xl px-6">
        <p
          className="text-sm font-semibold uppercase tracking-widest text-center mb-10"
          style={{ color: "var(--color-accent)" }}
        >
          Features
        </p>
        <div className="space-y-6">
          {features.map((f, i) => {
            const ref = useFadeIn<HTMLDivElement>();
            return (
              <div
                key={i}
                ref={ref}
                className="landing-fade-in flex items-baseline gap-4"
              >
                <div
                  className="mt-2 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: "var(--color-accent)" }}
                />
                <div>
                  <span
                    className="text-base font-semibold"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {f.name}
                  </span>
                  <span
                    className="ml-3 text-sm"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {f.desc}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION 4: CTA
   ═══════════════════════════════════════════════════════════════════ */

function CTA({ isLoggedIn }: { isLoggedIn: boolean }) {
  const ref = useFadeIn<HTMLElement>();
  return (
    <section ref={ref} className="landing-fade-in py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="landing-cta-card">
          <h2
            className="text-3xl font-bold tracking-tight sm:text-4xl"
            style={{ color: "var(--color-text-primary)" }}
          >
            Ready to think differently?
          </h2>
          <p
            className="mx-auto mt-4 max-w-lg text-lg leading-relaxed"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Join Twix and experience conversations that branch, code that runs,
            and answers that stay current.
          </p>
          <div className="mt-8">
            <Link
              href={isLoggedIn ? "/c" : "/register"}
              className="landing-btn-primary landing-btn-lg"
            >
              {isLoggedIn ? "Open App" : "Get Started — Free"}
              <svg
                className="ml-2 h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION 5: Footer
   ═══════════════════════════════════════════════════════════════════ */

function Footer() {
  return (
    <footer style={{ background: "#1A1614" }}>
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <Logo variant="white" />
          <div className="flex items-center gap-6">
            <Link href="/login" className="landing-footer-link">
              Sign In
            </Link>
            <Link href="/register" className="landing-footer-link">
              Create Account
            </Link>
          </div>
        </div>
        <div
          className="mt-8 flex items-center justify-center border-t pt-6"
          style={{ borderColor: "rgba(255,255,255,0.1)" }}
        >
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
            &copy; {new Date().getFullYear()} Twix. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════════════════════ */

export function LandingPage({ isLoggedIn }: LandingPageProps) {
  return (
    <div className="landing-page">
      <Nav isLoggedIn={isLoggedIn} />
      <HeroSection />
      <ScrollWalkthrough />
      <BriefFeatures />
      <CTA isLoggedIn={isLoggedIn} />
      <Footer />
    </div>
  );
}

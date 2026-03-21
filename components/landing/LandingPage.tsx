"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ScrollWalkthrough } from "./ScrollWalkthrough";
import { BranchingLines } from "./BranchingLines";
import { HeroBranchGraph } from "./HeroBranchGraph";

interface LandingPageProps {
  isLoggedIn: boolean;
}

/* ─── Intersection-observer fade-in ─────────────────────────────── */
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
        style={{ color: variant === "white" ? "#FFFFFF" : "var(--color-text-primary)" }}
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
        borderBottom: scrolled ? "1px solid var(--color-border)" : "1px solid transparent",
      }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Logo />
        <div className="hidden items-center gap-3 md:flex">
          {isLoggedIn ? (
            <Link href="/c" className="landing-btn-primary">Open App</Link>
          ) : (
            <>
              <Link href="/login" className="landing-nav-link">Sign in</Link>
              <Link href="/register" className="landing-btn-primary">Get Started</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

/* ─── Hero ──────────────────────────────────────────────────────── */
function Hero() {
  return (
    <section className="relative overflow-hidden flex items-center justify-center" style={{ minHeight: "100vh" }}>
      <HeroBranchGraph />
      <div className="landing-hero-glow" />
      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h1
            className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl"
            style={{ color: "var(--color-text-primary)" }}
          >
            Your thoughts branch.
            <br />
            <span style={{ color: "var(--color-accent)" }}>Your AI should too.</span>
          </h1>
          <p
            className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed md:text-xl"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Explore any tangent without losing context. Branch, merge, and
            build — all in one conversation.
          </p>

          {/* Scroll hint */}
          <div className="mt-10 flex flex-col items-center gap-2">
            <p className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
              Scroll to see it in action
            </p>
            <svg
              className="h-5 w-5 scroll-hint"
              style={{ color: "var(--color-text-muted)" }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Brief Features ────────────────────────────────────────────── */
const features = [
  { name: "Tangent Threads", desc: "Highlight text → branch → explore → merge back" },
  { name: "Cloud Sandbox", desc: "Clone repos, run code, preview live — all in chat" },
  { name: "Web Intelligence", desc: "Real-time search with inline citations" },
  { name: "Infinite Depth", desc: "Tangents within tangents within tangents" },
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

/* ─── CTA ───────────────────────────────────────────────────────── */
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
              <svg className="ml-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Footer ────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer style={{ background: "#1A1614" }}>
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <Logo variant="white" />
          <div className="flex items-center gap-6">
            <Link href="/login" className="landing-footer-link">Sign In</Link>
            <Link href="/register" className="landing-footer-link">Create Account</Link>
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

/* ─── Main page ─────────────────────────────────────────────────── */
export function LandingPage({ isLoggedIn }: LandingPageProps) {
  return (
    <div className="landing-page relative">
      <BranchingLines />
      <Nav isLoggedIn={isLoggedIn} />
      <Hero />
      <ScrollWalkthrough />
      <BriefFeatures />
      <CTA isLoggedIn={isLoggedIn} />
      <Footer />
    </div>
  );
}

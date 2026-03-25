"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ScrollWalkthrough } from "./ScrollWalkthrough";
import { BranchingHeadline } from "./BranchingHeadline";
import { ArchitectureFlow } from "./ArchitectureFlow";

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
   SECTION 1: Hero — handled by BranchingHeadline component
   ═══════════════════════════════════════════════════════════════════ */

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


/* ═══════════════════════════════════════════════════════════════════
   SECTION 4: CTA
   ═══════════════════════════════════════════════════════════════════ */

function CTA({ isLoggedIn }: { isLoggedIn: boolean }) {
  const ref = useFadeIn<HTMLElement>();
  return (
    <section
      ref={ref}
      className="landing-fade-in relative overflow-hidden"
      style={{ background: "#1A1614" }}
    >
      {/* Subtle gradient glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full blur-[120px] pointer-events-none"
        style={{ background: "rgba(217,119,87,0.12)" }}
      />

      <div className="relative mx-auto max-w-3xl px-6 py-24 md:py-32 text-center">
        <p
          className="text-sm font-semibold uppercase tracking-widest mb-4"
          style={{ color: "rgba(217,119,87,0.8)" }}
        >
          Open Source
        </p>
        <h2
          className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl"
          style={{ color: "#FAFAF8" }}
        >
          Your thoughts branch.
          <br />
          <span style={{ color: "var(--color-accent)" }}>Your AI should too.</span>
        </h2>
        <p
          className="mx-auto mt-5 max-w-md text-base leading-relaxed"
          style={{ color: "rgba(255,255,255,0.5)" }}
        >
          Branching conversations, semantic retrieval, structured knowledge
          — built for how you actually think.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href={isLoggedIn ? "/c" : "/register"}
            className="landing-btn-primary landing-btn-lg"
          >
            {isLoggedIn ? "Open App" : "Try Twix"}
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
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-medium transition-colors"
            style={{
              color: "rgba(255,255,255,0.6)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)";
              e.currentTarget.style.color = "rgba(255,255,255,0.9)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
              e.currentTarget.style.color = "rgba(255,255,255,0.6)";
            }}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            View Source
          </a>
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
      <BranchingHeadline />
      <ScrollWalkthrough />
      <ArchitectureFlow />
      <CTA isLoggedIn={isLoggedIn} />
      <Footer />
    </div>
  );
}

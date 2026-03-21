"use client";

import { useState, useEffect, useCallback } from "react";
import { useUIStore } from "@/store/ui-store";

interface SandboxStatusProps {
  conversationId: string;
}

export function SandboxStatus({ conversationId }: SandboxStatusProps) {
  const [sandboxId, setSandboxId] = useState<string | null>(null);

  // Read store values only via getState() to avoid subscribing to every change
  const openDrawerTo = useUIStore((s) => s.openDrawerTo);
  const setDrawerOpen = useUIStore((s) => s.setDrawerOpen);

  const checkSandbox = useCallback(async () => {
    try {
      const res = await fetch(`/api/sandbox/${conversationId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.active && data.sandboxId) {
        setSandboxId((prev) => {
          if (prev && prev !== data.sandboxId) {
            const store = useUIStore.getState();
            if (store.previewUrl) {
              store.setPreviewUrl(null);
            }
          }
          return data.sandboxId;
        });
      } else {
        setSandboxId(null);
        const store = useUIStore.getState();
        if (store.previewUrl) {
          store.setPreviewUrl(null);
        }
      }
    } catch {
      // ignore
    }
  }, [conversationId]);

  useEffect(() => {
    // Only poll once on mount — if no sandbox is active, don't keep polling
    checkSandbox();
  }, [checkSandbox]);

  // Start polling only after we discover an active sandbox
  useEffect(() => {
    if (!sandboxId) return;
    const interval = setInterval(checkSandbox, 30_000);
    return () => clearInterval(interval);
  }, [sandboxId, checkSandbox]);

  if (!sandboxId) return null;

  return (
    <div
      className="flex items-center justify-between px-4 py-1.5 text-xs"
      style={{
        background: "var(--color-bg-sidebar)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="h-2 w-2 rounded-full"
          style={{ background: "var(--color-success)" }}
        />
        <span style={{ color: "var(--color-text-secondary)" }}>
          Sandbox active
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <SandboxButton
          type="files"
          openDrawerTo={openDrawerTo}
          setDrawerOpen={setDrawerOpen}
        />
        <SandboxButton
          type="preview"
          openDrawerTo={openDrawerTo}
          setDrawerOpen={setDrawerOpen}
        />
      </div>
    </div>
  );
}

/** Reads store state on click only — no subscriptions to drawerOpen/drawerTab */
function SandboxButton({
  type,
  openDrawerTo,
  setDrawerOpen,
}: {
  type: "files" | "preview";
  openDrawerTo: (tab: "files" | "preview") => void;
  setDrawerOpen: (open: boolean) => void;
}) {
  const handleClick = useCallback(() => {
    const store = useUIStore.getState();
    const hasContent = type === "files" ? !!store.fileBrowserPath : !!store.previewUrl;
    if (!hasContent) return;

    if (store.drawerOpen && store.drawerTab === type) {
      setDrawerOpen(false);
    } else {
      openDrawerTo(type);
    }
  }, [type, openDrawerTo, setDrawerOpen]);

  // Read availability from store on each render but avoid subscribing to drawerOpen/drawerTab
  const store = useUIStore.getState();
  const hasContent = type === "files" ? !!store.fileBrowserPath : !!store.previewUrl;

  if (!hasContent) return null;

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-1.5 rounded px-2 py-0.5 transition-colors"
      style={{ color: "var(--color-text-secondary)" }}
    >
      {type === "files" ? (
        <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
        </svg>
      ) : (
        <div
          className="h-2 w-2 rounded-full"
          style={{ background: "var(--color-success)" }}
        />
      )}
      {type === "files" ? "Files" : "Preview"}
    </button>
  );
}

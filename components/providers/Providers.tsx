"use client";

import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Chat data isn't volatile enough to refetch every focus.
        refetchOnWindowFocus: false,
        // 1 minute stale window — covers most "switch tabs / come back" cases
        // without keeping data forever.
        staleTime: 60_000,
        // 5 minutes before unused cached data is garbage-collected.
        gcTime: 5 * 60_000,
        // Avoid retry storms on auth failures / 4xx — those won't fix themselves.
        retry: (failureCount, err) => {
          if (err instanceof Response && err.status >= 400 && err.status < 500) {
            return false;
          }
          return failureCount < 2;
        },
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  // Server: new client per request (avoid leaking state between requests).
  if (typeof window === "undefined") return makeQueryClient();
  // Browser: one client for the lifetime of the tab.
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>{children}</SessionProvider>
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      )}
    </QueryClientProvider>
  );
}

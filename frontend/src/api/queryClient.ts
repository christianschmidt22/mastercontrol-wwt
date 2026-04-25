import { QueryClient } from '@tanstack/react-query';

/**
 * Shared QueryClient instance.
 *
 * staleTime: 30 s keeps data fresh enough for a personal CRM without
 * hammering the local SQLite backend on every focus/mount event.
 *
 * retry: 1 — local backend errors are usually deterministic; a single
 * retry catches transient SQLite lock contention without infinite loops.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

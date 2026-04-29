import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface TileLayout {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hidden?: boolean;
}

export interface LayoutPayload {
  tiles: TileLayout[];
}

export type TileLayoutKey =
  | 'layout.customer'
  | 'layout.oem'
  | `layout.project.${number}`;

/**
 * Fetches and persists tile layout via the settings API.
 * Key: 'layout.customer', 'layout.oem', or 'layout.project.<id>'.
 *
 * - Returns current layout (or default if the setting row is absent).
 * - `save` is debounced 500 ms to avoid hammering the API on rapid drags.
 * - `reset` deletes the row (sends empty string value) so the default takes over.
 * - `isDirty` is true when local state differs from last-saved server state.
 */
export function useTileLayout(
  settingKey: TileLayoutKey,
  defaultLayout: TileLayout[],
) {
  const queryClient = useQueryClient();
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queryKey = ['settings', settingKey];

  const { data: savedLayout } = useQuery<TileLayout[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/settings/${encodeURIComponent(settingKey)}`);
      if (res.status === 404) return defaultLayout;
      if (!res.ok) throw new Error('Failed to fetch layout setting');
      const body: { key: string; value: string } = await res.json() as { key: string; value: string };
      try {
        const parsed = JSON.parse(body.value) as LayoutPayload;
        return parsed.tiles ?? defaultLayout;
      } catch {
        return defaultLayout;
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  const [layout, setLayout] = useState<TileLayout[]>(() => savedLayout ?? defaultLayout);

  // Keep local state in sync when the server response arrives
  useEffect(() => {
    if (savedLayout) {
      setLayout(savedLayout);
    }
  }, [savedLayout]);

  const serverLayout = savedLayout ?? defaultLayout;
  const isDirty = JSON.stringify(layout) !== JSON.stringify(serverLayout);

  const { mutateAsync: saveToServer } = useMutation({
    mutationFn: async (tiles: TileLayout[]) => {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: settingKey, value: JSON.stringify({ tiles }) }),
      });
      if (!res.ok) throw new Error('Failed to save layout');
    },
    onSuccess: (_data, tiles) => {
      queryClient.setQueryData(queryKey, tiles);
    },
  });

  const { mutateAsync: deleteFromServer } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/settings/${encodeURIComponent(settingKey)}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 404) throw new Error('Failed to reset layout');
    },
    onSuccess: () => {
      queryClient.setQueryData(queryKey, defaultLayout);
    },
  });

  const save = useCallback(
    (tiles: TileLayout[], debounce = true) => {
      setLayout(tiles);
      if (!debounce) {
        void saveToServer(tiles);
        return;
      }
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        void saveToServer(tiles);
      }, 500);
    },
    [saveToServer],
  );

  const reset = useCallback(async () => {
    await deleteFromServer();
    setLayout(defaultLayout);
  }, [deleteFromServer, defaultLayout]);

  const revert = useCallback(() => {
    setLayout(serverLayout);
  }, [serverLayout]);

  return { layout, save, reset, revert, isDirty };
}

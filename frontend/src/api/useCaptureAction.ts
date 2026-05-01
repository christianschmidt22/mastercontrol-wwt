import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { request } from './http';
import type { CaptureActionRequest, CaptureActionResult } from '../types/captureAction';

export function useCaptureAction(): UseMutationResult<
  CaptureActionResult,
  Error,
  CaptureActionRequest
> {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (body) =>
      request<CaptureActionResult>('POST', '/api/capture-action/run', body),
    onSuccess: (result, variables) => {
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      const orgIds = new Set<number>();
      if (variables.organization_id) orgIds.add(variables.organization_id);
      for (const note of result.created_notes) orgIds.add(note.organization_id);
      for (const orgId of orgIds) {
        void qc.invalidateQueries({ queryKey: ['notes', orgId] });
      }
    },
  });
}

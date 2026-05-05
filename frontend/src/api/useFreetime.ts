import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { request } from './http';
import type { FreetimeFindRequest, FreetimeFindResponse } from '../types';

export function useFindFreetime(): UseMutationResult<FreetimeFindResponse, Error, FreetimeFindRequest> {
  return useMutation({
    mutationFn: (body) => request<FreetimeFindResponse>('POST', '/api/tools/freetime/find', body),
  });
}

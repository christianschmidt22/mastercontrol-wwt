import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { request } from './http';
import type { DealReg, DealRegInput } from '../types/dealReg';

export const dealRegKeys = {
  all: ['deal-regs'] as const,
};

function upsertDealReg(list: DealReg[] | undefined, dealReg: DealReg): DealReg[] {
  const rows = list ?? [];
  return [dealReg, ...rows.filter((row) => row.id !== dealReg.id)]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id);
}

export function useDealRegs(): UseQueryResult<DealReg[]> {
  return useQuery({
    queryKey: dealRegKeys.all,
    queryFn: () => request<DealReg[]>('GET', '/api/deal-regs'),
  });
}

export function useCreateDealReg(): UseMutationResult<DealReg, Error, DealRegInput | undefined> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => request<DealReg>('POST', '/api/deal-regs', body ?? {}),
    onSuccess: (dealReg) => {
      qc.setQueryData<DealReg[]>(dealRegKeys.all, (current) => upsertDealReg(current, dealReg));
    },
  });
}

export function useUpdateDealReg(): UseMutationResult<DealReg, Error, { id: number } & DealRegInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) => request<DealReg>('PUT', `/api/deal-regs/${id}`, body),
    onSuccess: (dealReg) => {
      qc.setQueryData<DealReg[]>(dealRegKeys.all, (current) => upsertDealReg(current, dealReg));
    },
  });
}

export function useDeleteDealReg(): UseMutationResult<void, Error, number> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => request<void>('DELETE', `/api/deal-regs/${id}`),
    onSuccess: (_result, id) => {
      qc.setQueryData<DealReg[]>(dealRegKeys.all, (current) => (current ?? []).filter((row) => row.id !== id));
    },
  });
}

import { db } from '../db/database.js';

export interface MileageDistanceCache {
  id: number;
  from_address: string;
  to_address: string;
  one_way_miles: number | null;
  provider: string;
  status: 'ok' | 'error';
  error: string | null;
  calculated_at: string;
}

export interface MileageDistanceCacheInput {
  from_address: string;
  to_address: string;
  one_way_miles: number | null;
  provider: string;
  status: 'ok' | 'error';
  error?: string | null;
}

const getStmt = db.prepare<[string, string], MileageDistanceCache>(`
  SELECT * FROM mileage_distance_cache
  WHERE from_address = ? AND to_address = ?
`);

const upsertStmt = db.prepare<MileageDistanceCacheInput>(`
  INSERT INTO mileage_distance_cache (
    from_address, to_address, one_way_miles, provider, status, error, calculated_at
  )
  VALUES (@from_address, @to_address, @one_way_miles, @provider, @status, @error, datetime('now'))
  ON CONFLICT(from_address, to_address) DO UPDATE SET
    one_way_miles = excluded.one_way_miles,
    provider = excluded.provider,
    status = excluded.status,
    error = excluded.error,
    calculated_at = excluded.calculated_at
`);

export const mileageDistanceModel = {
  get(fromAddress: string, toAddress: string): MileageDistanceCache | null {
    return getStmt.get(fromAddress, toAddress) ?? null;
  },

  upsert(input: MileageDistanceCacheInput): MileageDistanceCache {
    upsertStmt.run({
      ...input,
      error: input.error ?? null,
    });
    const row = getStmt.get(input.from_address, input.to_address);
    if (!row) throw new Error('Mileage distance cache write failed');
    return row;
  },
};

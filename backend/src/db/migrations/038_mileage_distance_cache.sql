CREATE TABLE IF NOT EXISTS mileage_distance_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  one_way_miles REAL,
  provider TEXT NOT NULL DEFAULT 'osrm',
  status TEXT NOT NULL DEFAULT 'ok' CHECK(status IN ('ok', 'error')),
  error TEXT,
  calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(from_address, to_address)
);

CREATE INDEX IF NOT EXISTS idx_mileage_distance_cache_route
  ON mileage_distance_cache(from_address, to_address);

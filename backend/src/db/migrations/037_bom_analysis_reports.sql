CREATE TABLE IF NOT EXISTS bom_analysis_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  prompt TEXT,
  file_names TEXT NOT NULL DEFAULT '[]',
  output TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bom_analysis_reports_org_created
  ON bom_analysis_reports(organization_id, created_at DESC);

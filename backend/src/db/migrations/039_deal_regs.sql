CREATE TABLE IF NOT EXISTS deal_regs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor TEXT NOT NULL DEFAULT '',
  customer TEXT NOT NULL DEFAULT '',
  deal_reg_number TEXT NOT NULL DEFAULT '',
  project TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_deal_regs_vendor_customer
  ON deal_regs(vendor, customer);

CREATE INDEX IF NOT EXISTS idx_deal_regs_deal_reg_number
  ON deal_regs(deal_reg_number);

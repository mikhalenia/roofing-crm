CREATE TABLE leads (
  apn TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'new',
  notes TEXT NOT NULL DEFAULT '',
  snapshot TEXT NOT NULL,
  lat REAL,
  lon REAL,
  roof_age_years INTEGER,
  permit_state TEXT,
  days_open INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE rate_limits (
  ip TEXT,
  minute TEXT,
  count INTEGER,
  PRIMARY KEY (ip, minute)
);

CREATE TABLE IF NOT EXISTS daily_active (
  date TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  version TEXT NOT NULL,
  PRIMARY KEY (date, installation_id)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS download_clicks (
  date TEXT NOT NULL,
  version TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, version)
) WITHOUT ROWID;

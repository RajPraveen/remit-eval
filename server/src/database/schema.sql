CREATE TABLE IF NOT EXISTS account_instructions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account TEXT NOT NULL,
  version INTEGER NOT NULL,
  reader_text TEXT NOT NULL,
  orchestrator_text TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','current','old')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL,
  note TEXT,
  started_by TEXT NOT NULL CHECK (started_by IN ('page','command')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running','finished','failed')),
  error TEXT,
  version TEXT NOT NULL,
  compared_to INTEGER,
  gate TEXT CHECK (gate IN ('pass','fail')),
  overridden_at TEXT
);
CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES runs(id),
  record_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','finished','did_not_finish')),
  error TEXT,
  answer TEXT,
  usage TEXT
);
CREATE TABLE IF NOT EXISTS steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  result_id INTEGER NOT NULL REFERENCES results(id),
  parent_step_id INTEGER REFERENCES steps(id),
  sequence INTEGER NOT NULL,
  turn INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('message','tool_call','answer')),
  outcome TEXT CHECK (outcome IN ('ok','refused','failed')),
  detail TEXT NOT NULL,
  usage TEXT
);
CREATE TABLE IF NOT EXISTS boundary_evals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  result_id INTEGER NOT NULL REFERENCES results(id),
  verdict TEXT NOT NULL CHECK (verdict IN ('right','wrong')),
  flagged TEXT NOT NULL CHECK (flagged IN ('yes','no')),
  details TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trace_evals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  result_id INTEGER NOT NULL REFERENCES results(id),
  level TEXT NOT NULL CHECK (level IN ('orchestrator','reader')),
  step_id INTEGER REFERENCES steps(id),
  name TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('pass','fail','not_applicable')),
  details TEXT NOT NULL
);

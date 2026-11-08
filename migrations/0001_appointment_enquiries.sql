CREATE TABLE appointment_enquiries (
  id TEXT PRIMARY KEY NOT NULL,
  patient_name TEXT NOT NULL CHECK (length(trim(patient_name)) BETWEEN 1 AND 100),
  mobile_number TEXT NOT NULL CHECK (length(mobile_number) = 10 AND mobile_number NOT GLOB '*[^0-9]*' AND substr(mobile_number, 1, 1) IN ('6', '7', '8', '9')),
  treatment TEXT NOT NULL CHECK (length(treatment) BETWEEN 1 AND 100),
  preferred_date TEXT,
  preferred_time TEXT CHECK (preferred_time IS NULL OR preferred_time IN ('Morning', 'Evening', 'Any time')),
  additional_message TEXT CHECK (additional_message IS NULL OR length(additional_message) <= 500),
  consent INTEGER NOT NULL CHECK (consent = 1),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
  notification_status TEXT NOT NULL DEFAULT 'pending' CHECK (notification_status IN ('pending', 'disabled', 'simulated', 'failed', 'sent'))
);

CREATE INDEX idx_enquiries_status_created ON appointment_enquiries (status, created_at);
CREATE INDEX idx_enquiries_notification_status ON appointment_enquiries (notification_status);

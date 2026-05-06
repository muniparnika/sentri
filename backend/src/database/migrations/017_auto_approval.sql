-- Migration 017: confidence scoring + auto-approval thresholds/provenance

ALTER TABLE tests ADD COLUMN confidenceScore REAL;
ALTER TABLE tests ADD COLUMN approvalSource TEXT;
ALTER TABLE tests ADD COLUMN approvalThreshold REAL;
ALTER TABLE tests ADD COLUMN approvedAt INTEGER;
ALTER TABLE tests ADD COLUMN approvedBy TEXT;

ALTER TABLE projects ADD COLUMN autoApproveThreshold REAL;

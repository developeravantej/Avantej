-- Composite index for evaluateAndLockIfOverdue bulk sweep and getAdminInstallmentOverview EXISTS subquery
-- Covers: WHERE package_instance_id = ? AND status IN (...) AND due_date <= ?
CREATE INDEX IF NOT EXISTS idx_installments_pkg_status_due
  ON installments (package_instance_id, status, due_date);

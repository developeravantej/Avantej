-- Backfill bank_transfer → manual_transfer across all payment-method columns
-- bank_transfer was the original POS value; manual_transfer is the canonical value used
-- by confirmInstallmentPayment and all downstream reporting.
UPDATE package_instances SET payment_method = 'manual_transfer' WHERE payment_method = 'bank_transfer';
UPDATE installments       SET payment_method = 'manual_transfer' WHERE payment_method = 'bank_transfer';
UPDATE invoices           SET payment_mode   = 'manual_transfer' WHERE payment_mode   = 'bank_transfer';
UPDATE payments           SET payment_method = 'manual_transfer' WHERE payment_method = 'bank_transfer';

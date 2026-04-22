-- Update existing expenses currency from usd to myr
UPDATE expenses SET currency = 'myr' WHERE currency = 'usd';
--> statement-breakpoint
ALTER TABLE expenses ALTER COLUMN currency SET DEFAULT 'myr';

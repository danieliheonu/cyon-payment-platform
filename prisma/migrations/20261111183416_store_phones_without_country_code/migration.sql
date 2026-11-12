-- Phone numbers are now stored in the Nigerian local form without the country code
-- (+2348031234567 → 08031234567). See normalizePhone in src/lib/contact.ts.
-- Audit log and receipt snapshots are historical records and are left unchanged.
-- Numbers from other countries can't be expressed without their code; they are left as they are.

UPDATE "User"    SET "phone"      = '0' || substr("phone", 5)      WHERE "phone"      ~ '^\+234[1-9][0-9]{9}$';
UPDATE "Member"  SET "phone"      = '0' || substr("phone", 5)      WHERE "phone"      ~ '^\+234[1-9][0-9]{9}$';
UPDATE "Payment" SET "payerPhone" = '0' || substr("payerPhone", 5) WHERE "payerPhone" ~ '^\+234[1-9][0-9]{9}$';

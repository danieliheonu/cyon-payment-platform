-- A corrected payment is VOIDED and replaced by a new payment carrying the same
-- transfer reference / proof. Duplicate checks must therefore ignore VOIDED rows
-- as well as REJECTED ones.

DROP INDEX IF EXISTS "Payment_transfer_reference_unique";
CREATE UNIQUE INDEX "Payment_transfer_reference_unique"
  ON "Payment" ("bankAccountId", lower("transferReference"))
  WHERE "transferReference" IS NOT NULL AND "status" NOT IN ('REJECTED', 'VOIDED');

DROP INDEX IF EXISTS "Payment_proof_sha256_unique";
CREATE UNIQUE INDEX "Payment_proof_sha256_unique"
  ON "Payment" ("proofSha256")
  WHERE "proofSha256" IS NOT NULL AND "status" NOT IN ('REJECTED', 'VOIDED');

import "server-only";
import path from "node:path";
import { env, supabaseStorageConfigured, type Env } from "@/lib/env";
import { bcryptHasher } from "@/server/auth/crypto";
import { GrantPermissionSource, PermissionResolver, RolePermissionSource } from "@/server/auth/permission-resolver";
import { prismaClient } from "@/server/infra/prisma/client";
import { PrismaUnitOfWork } from "@/server/infra/prisma/unit-of-work";
import { reactPdfRenderer } from "@/server/infra/pdf/react-pdf-renderer";
import { LocalFileStorage } from "@/server/infra/storage/local-storage";
import { SupabaseFileStorage } from "@/server/infra/storage/supabase-storage";
import { defaultPaymentMethods } from "@/server/payment-methods/handlers";
import { systemClock, type Clock, type FileStorage } from "@/server/ports/file-storage";
import { AccessService } from "@/server/services/access.service";
import { AuthService } from "@/server/services/auth.service";
import { CorrectionService } from "@/server/services/correction.service";
import { MemberService } from "@/server/services/member.service";
import { ObligationService } from "@/server/services/obligation.service";
import { PaymentConfirmationService, PaymentFinalizer } from "@/server/services/payment-confirmation.service";
import { PaymentLinkService } from "@/server/services/payment-link.service";
import { PaymentSubmissionService } from "@/server/services/payment-submission.service";
import { RateLimiter } from "@/server/services/rate-limiter";
import { RecordsService } from "@/server/services/records.service";
import { BackupService, ReportService } from "@/server/services/report.service";
import {
  BankAccountService,
  CategoryService,
  FinancialYearService,
  RateService,
} from "@/server/services/setup.services";
import type { UnitOfWork } from "@/server/ports/repositories";

/**
 * Composition root — the only place concrete classes are chosen and wired.
 * Everything else depends on interfaces (Dependency Inversion).
 */
export function buildServices(deps: {
  uow: UnitOfWork;
  proofs: FileStorage;
  backups: FileStorage;
  clock: Clock;
  orgName: string;
  memberDefaultPassword: string | null;
}) {
  const { uow, proofs, backups, clock, orgName, memberDefaultPassword } = deps;
  const resolver = new PermissionResolver([new RolePermissionSource(), new GrantPermissionSource(uow.read.grants)]);
  const finalizer = new PaymentFinalizer(orgName);
  const obligations = new ObligationService(uow, clock);
  const limiter = new RateLimiter(uow, clock);

  return {
    auth: new AuthService(uow, bcryptHasher, resolver, limiter, clock),
    access: new AccessService(uow, bcryptHasher, clock),
    members: new MemberService(uow, bcryptHasher, obligations, memberDefaultPassword),
    categories: new CategoryService(uow),
    bankAccounts: new BankAccountService(uow),
    rates: new RateService(uow, obligations),
    financialYears: new FinancialYearService(uow),
    obligations,
    submissions: new PaymentSubmissionService(uow, proofs, defaultPaymentMethods, finalizer, limiter, clock),
    confirmations: new PaymentConfirmationService(uow, finalizer, clock),
    corrections: new CorrectionService(uow, finalizer, clock),
    paymentLinks: new PaymentLinkService(uow, clock, orgName),
    records: new RecordsService(uow, proofs, reactPdfRenderer, clock),
    reports: new ReportService(uow, obligations, reactPdfRenderer, orgName, clock),
    backups: new BackupService(uow, backups, clock),
  };
}

export type Services = ReturnType<typeof buildServices>;

function storageFor(e: Env, bucket: string, folder: string): FileStorage {
  if (supabaseStorageConfigured(e)) return new SupabaseFileStorage(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, bucket);
  if (e.NODE_ENV === "production") throw new Error("Supabase Storage must be configured in production.");
  return new LocalFileStorage(path.join(process.cwd(), ".local-storage", folder));
}

let instance: Services | null = null;

export function services(): Services {
  if (!instance) {
    const e = env();
    instance = buildServices({
      uow: new PrismaUnitOfWork(prismaClient(e.DATABASE_URL), e.ORG_NAME),
      proofs: storageFor(e, e.SUPABASE_PROOFS_BUCKET, "proofs"),
      backups: storageFor(e, e.SUPABASE_BACKUPS_BUCKET, "backups"),
      clock: systemClock,
      orgName: e.ORG_NAME,
      memberDefaultPassword: e.MEMBER_DEFAULT_PASSWORD ?? null,
    });
  }
  return instance;
}

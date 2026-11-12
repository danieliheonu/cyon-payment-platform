import type { ReceiptSnapshot } from "./repositories";
import type { YearSummary } from "@/domain/year-summary";
import type { RateRecord } from "./repositories";

/** Renders documents to PDF bytes. Implemented with @react-pdf/renderer in infra. */
export interface DocumentRenderer {
  receiptPdf(receipt: ReceiptSnapshot): Promise<Uint8Array>;
  yearSummaryPdf(input: { orgName: string; summary: YearSummary; rates: RateRecord[]; generatedAt: Date }): Promise<Uint8Array>;
}

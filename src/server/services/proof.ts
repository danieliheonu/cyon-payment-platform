import "server-only";
import { randomUUID } from "node:crypto";
import { ValidationError } from "@/domain/errors";
import { sha256Hex } from "@/server/auth/crypto";
import { PROOF_MAX_BYTES } from "@/lib/validation/proof";

export interface UploadedFile {
  name: string;
  bytes: Uint8Array;
}

export interface InspectedProof {
  bytes: Uint8Array;
  contentType: string;
  extension: string;
  sha256: string;
}

const SIGNATURES: Array<{ type: string; ext: string; test: (b: Uint8Array) => boolean }> = [
  { type: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/png", ext: "png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { type: "image/webp", ext: "webp", test: (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP" },
  { type: "image/heic", ext: "heic", test: (b) => ascii(b, 4, 8) === "ftyp" && ["heic", "heix", "mif1"].includes(ascii(b, 8, 12)) },
  { type: "application/pdf", ext: "pdf", test: (b) => ascii(b, 0, 5) === "%PDF-" },
];

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

/**
 * Validates a proof-of-payment file by its content (not its name or the browser's
 * claimed type) and fingerprints it for duplicate detection.
 */
export function inspectProof(file: UploadedFile | null | undefined): InspectedProof {
  if (!file || file.bytes.length === 0) {
    throw new ValidationError("Upload proof of payment.", { proof: "Proof of payment is required." });
  }
  if (file.bytes.length > PROOF_MAX_BYTES) {
    throw new ValidationError("File too large.", { proof: "The file must be 4 MB or smaller." });
  }
  const signature = SIGNATURES.find((s) => s.test(file.bytes));
  if (!signature) {
    throw new ValidationError("Unsupported file.", { proof: "Upload a JPG, PNG, WEBP, HEIC image or a PDF." });
  }
  return { bytes: file.bytes, contentType: signature.type, extension: signature.ext, sha256: sha256Hex(file.bytes) };
}

export function proofStorageKey(proof: InspectedProof, year: number): string {
  return `proofs/${year}/${randomUUID()}.${proof.extension}`;
}

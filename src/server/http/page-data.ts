import "server-only";
import { forbidden, notFound } from "next/navigation";
import { ForbiddenError, NotFoundError } from "@/domain/errors";

/** Loads a page's record, turning domain "not found"/"forbidden" into the 404/403 pages. */
export async function pageData<T>(load: Promise<T>): Promise<T> {
  try {
    return await load;
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    if (error instanceof ForbiddenError) forbidden();
    throw error;
  }
}

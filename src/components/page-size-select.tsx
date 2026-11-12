"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";
import { PAGE_SIZES, pageSizeKey } from "@/lib/pagination";

/** "Rows per page" picker; changing it keeps the filters and goes back to the first page. */
export function PageSizeSelect({ value, params, pageKey }: { value: number; params: string; pageKey: string }) {
  const router = useRouter();
  const id = useId();
  return (
    <span className="flex items-center gap-2">
      <label htmlFor={id} className="text-muted">
        Rows per page
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params);
          next.set(pageSizeKey(pageKey), e.target.value);
          next.delete(pageKey);
          router.push(`?${next.toString()}`, { scroll: false });
        }}
        className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
      >
        {PAGE_SIZES.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </span>
  );
}

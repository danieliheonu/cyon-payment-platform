import type { ReactNode } from "react";
import { LABELS, PaymentMethod, PaymentStatus } from "@/domain/enums";
import { FilterForm } from "./filter-form";

interface FilterOption {
  value: string;
  label: string;
}

export type FilterField =
  | { kind: "search"; name: string; label: string; placeholder?: string }
  | { kind: "select"; name: string; label: string; options: FilterOption[]; allLabel?: string }
  | { kind: "date"; name: string; label: string };

/** Filter bar shared by every filtered list. Filters apply as you type; see FilterForm. */
export function FilterBar({
  fields,
  values,
  extra,
  keep = {},
}: {
  fields: FilterField[];
  values: Record<string, string | undefined>;
  extra?: ReactNode;
  /** URL values to carry through a new search, e.g. the chosen rows per page. */
  keep?: Record<string, string | undefined>;
}) {
  return <FilterForm fields={fields} values={values} keep={keep} extra={extra} />;
}

/** Standard payment filters (status, method, dates, search) used by payment lists. */
export function paymentFilterFields(categories: FilterOption[], options: { search?: boolean } = {}): FilterField[] {
  return [
    ...(options.search === false ? [] : [{ kind: "search", name: "q", label: "Search", placeholder: "Name or member no" } as const]),
    { kind: "select", name: "categoryId", label: "Category", options: categories },
    {
      kind: "select",
      name: "status",
      label: "Status",
      options: Object.values(PaymentStatus).map((s) => ({ value: s, label: LABELS.paymentStatus[s] })),
    },
    {
      kind: "select",
      name: "method",
      label: "Method",
      options: Object.values(PaymentMethod).map((m) => ({ value: m, label: LABELS.paymentMethod[m] })),
    },
    { kind: "date", name: "from", label: "From" },
    { kind: "date", name: "to", label: "To" },
  ];
}

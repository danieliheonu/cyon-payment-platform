"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import type { FilterField } from "./filter-bar";
import { buttonClass, inputClass } from "./ui";

const TYPING_DELAY_MS = 300;

/**
 * Filters apply as you type (search, after a short pause) or as soon as a list or date
 * changes. The URL holds the filters, so links, pagination and CSV exports reuse them.
 * Without JavaScript it is still a plain GET form (Enter submits).
 */
export function FilterForm({
  fields,
  values,
  keep,
  extra,
}: {
  fields: FilterField[];
  values: Record<string, string | undefined>;
  keep: Record<string, string | undefined>;
  extra?: ReactNode;
}) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function apply(form: HTMLFormElement, delay: number) {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const params = new URLSearchParams();
      for (const [name, value] of new FormData(form)) {
        if (typeof value === "string" && value.trim()) params.set(name, value.trim());
      }
      // A new filter starts again at page 1 (the page number isn't a form field).
      router.replace(`?${params.toString()}`, { scroll: false });
    }, delay);
  }

  function onChange(event: FormEvent<HTMLFormElement>) {
    const typing = event.target instanceof HTMLInputElement && event.target.type === "search";
    apply(event.currentTarget, typing ? TYPING_DELAY_MS : 0);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    apply(event.currentTarget, 0);
  }

  function clear(form: HTMLFormElement) {
    for (const element of Array.from(form.elements)) {
      if ((element instanceof HTMLInputElement && element.type !== "hidden") || element instanceof HTMLSelectElement) element.value = "";
    }
    apply(form, 0);
  }

  return (
    <form method="get" role="search" onChange={onChange} onSubmit={onSubmit} className="mb-4 grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-6">
      {Object.entries(keep).map(([name, value]) => (value ? <input key={name} type="hidden" name={name} value={value} /> : null))}
      {fields.map((field) => (
        <label key={field.name} className={field.kind === "search" ? "space-y-1 lg:col-span-2" : "space-y-1"}>
          <span className="text-xs font-medium text-muted">{field.label}</span>
          {field.kind === "select" ? (
            <select name={field.name} defaultValue={values[field.name] ?? ""} className={inputClass}>
              <option value="">{field.allLabel ?? "All"}</option>
              {field.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={field.kind === "date" ? "date" : "search"}
              name={field.name}
              defaultValue={values[field.name] ?? ""}
              placeholder={field.kind === "search" ? field.placeholder : undefined}
              className={inputClass}
            />
          )}
        </label>
      ))}
      <div className="flex items-end gap-2">
        <button type="button" className={buttonClass("ghost")} onClick={(e) => e.currentTarget.form && clear(e.currentTarget.form)}>
          Clear
        </button>
        {extra}
      </div>
    </form>
  );
}

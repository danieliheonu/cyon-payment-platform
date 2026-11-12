import { buttonClass, inputClass } from "./ui";

/** GET form to switch the financial year shown on a page. */
export function YearPicker({ year, from = 2020, to }: { year: number; from?: number; to: number }) {
  const years = Array.from({ length: to - from + 1 }, (_, i) => to - i);
  return (
    <form method="get" className="flex items-end gap-2">
      <label className="space-y-1">
        <span className="block text-xs font-medium text-muted">Financial year</span>
        <select name="year" defaultValue={year} className={inputClass}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className={buttonClass("secondary")}>
        Show
      </button>
    </form>
  );
}

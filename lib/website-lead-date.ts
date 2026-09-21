// Read-only companion to staff_lead_source_date in the generated migration.
// Never uses Date.parse on unqualified numeric dates.
export function analyseLeadDate(source: string | null, submitted: string | null, created: string) {
  const text = source?.trim() ?? "";
  let basis = "unrecognised_source", at: string | null = null;
  if (!text) basis = "missing_source";
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(text)) {
    const stamp = Date.parse(text);
    const [year, month, day] = text.slice(0, 10).split("-").map(Number);
    const validDay = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isFinite(stamp) || validDay.getUTCMonth() !== month - 1 || validDay.getUTCDate() !== day) basis = "invalid_source";
    else { basis = "iso_offset"; at = new Date(stamp).toISOString(); }
  } else {
    const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (match) {
      const [day, month, year, hour, minute, second] = match.slice(1).map(v => Number(v ?? 0));
      if (day <= 12 && month <= 12 && day !== month) basis = "ambiguous_source";
      else {
        const naive = Date.UTC(year, month - 1, day, hour, minute, second);
        const valid = new Date(naive);
        if (month < 1 || month > 12 || day < 1 || valid.getUTCMonth() !== month - 1 || valid.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) basis = "invalid_source";
        else {
          const format = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
          const target = `${String(day).padStart(2,"0")}/${String(month).padStart(2,"0")}/${year}, ${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}:${String(second).padStart(2,"0")}`;
          const candidates = [naive, naive - 3600000].filter(ms => format.format(new Date(ms)) === target);
          if (candidates.length !== 1) basis = "ambiguous_clock";
          else { basis = "unambiguous_dmy_london"; at = new Date(candidates[0]).toISOString(); }
        }
      }
    }
  }
  return { received_at: at ?? submitted ?? created, received_date_basis: at ? basis : `${basis}:${submitted ? "submitted_at" : "created_at"}`, confident: Boolean(at), format: basis };
}

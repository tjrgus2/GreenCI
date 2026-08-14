/** Escape repository-controlled text before placing it in Markdown tables. */
export function escapeMarkdown(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replaceAll('`', '\\`')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll(/\r?\n/g, '<br>');
}

/** Truncate long repository-controlled text with a visible marker. */
export function truncate(value: string, maxLength = 120): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

/** Format seconds without producing NaN or infinite output. */
export function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds)) {
    return 'Unavailable';
  }
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return minutes === 0 ? `${remainder}s` : `${minutes}m ${remainder}s`;
}

/**
 * Format a signed percentage with an icon so the report never depends on
 * colour alone, and never renders `NaN` or `Infinity`.
 */
export function formatSignedPercent(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  const rounded = Math.round(value * 10) / 10;
  if (rounded > 0) {
    return `▲ ${rounded.toFixed(1)}%`;
  }
  if (rounded < 0) {
    return `▼ ${Math.abs(rounded).toFixed(1)}%`;
  }
  return `▬ 0.0%`;
}

/** Format a US dollar amount with enough precision for small CI runs. */
export function formatUsd(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  const safe = Math.max(0, value);
  return safe >= 1 ? `$${safe.toFixed(2)}` : `$${safe.toFixed(4)}`;
}

/** Format modeled emissions in grams of CO2 equivalent. */
export function formatGrams(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  const safe = Math.max(0, value);
  const digits = safe >= 1 ? 2 : 4;
  return `${safe.toFixed(digits)} gCO₂eq`;
}

/** Format modeled energy in kilowatt hours. */
export function formatKwh(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return `${Math.max(0, value).toFixed(6)} kWh`;
}

/** Format a bounded ratio such as a shape similarity as a percentage. */
export function formatRatio(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return `${(Math.min(1, Math.max(0, value)) * 100).toFixed(1)}%`;
}

/** Format a finite number with a fixed number of decimals. */
export function formatNumber(value: number | undefined, digits = 3): string {
  if (value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return value.toFixed(digits);
}

/** Render a Markdown table, or a placeholder row when there is no data. */
export function renderTable(
  headers: readonly string[],
  alignment: readonly ('left' | 'right')[],
  rows: readonly (readonly string[])[],
): string[] {
  const separator = headers.map((_, index) =>
    alignment[index] === 'right' ? '---:' : '---',
  );
  const body =
    rows.length === 0 ? [headers.map(() => '—')] : rows.map((row) => [...row]);
  return [
    `| ${headers.join(' | ')} |`,
    `|${separator.join('|')}|`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
  ];
}

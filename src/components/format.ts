export function formatMoney(cents: number, compact = true): string {
  const dollars = cents / 100;
  if (compact && Math.abs(dollars) >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(Math.abs(dollars) >= 100_000_000 ? 1 : 2)}M`;
  if (compact && Math.abs(dollars) >= 1_000) return `$${Math.round(dollars / 1_000)}k`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(dollars);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(value));
}

export function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function titleCase(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function relativeDay(day: number | null | undefined): string {
  return day === null || day === undefined ? 'Unfulfilled' : `T+${day}`;
}

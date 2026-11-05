export function formatSignedPercent(value: number | null): string {
  if (value === null) {
    return "—";
  }
  if (value === 0) {
    return "0%";
  }
  return `${value < 0 ? "−" : "+"}${Math.abs(value)}%`;
}

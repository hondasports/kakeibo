export function extractAmountDigits(value: string): string {
  return value.replace(/[^\d]/g, "");
}

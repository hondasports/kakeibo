import type { LineAccountLinkRecord } from "./records";

export function resolveActiveLink(
  links: LineAccountLinkRecord[],
): { kind: "none" } | { kind: "single"; link: LineAccountLinkRecord } | { kind: "multiple" } {
  if (links.length === 0) return { kind: "none" };
  if (links.length === 1) return { kind: "single", link: links[0] };
  return { kind: "multiple" };
}

/**
 * document に挿入された CSS（emotion 等）のテキストを集める。
 * `<style>` のテキストノードと CSSOM（insertRule 経由）の両方を読む。
 */
export function collectDocumentCssText(): string {
  const parts: string[] = [];
  document.querySelectorAll("style").forEach((styleEl) => {
    parts.push(styleEl.textContent ?? "");
    const sheet = styleEl.sheet;
    if (sheet) {
      for (const rule of Array.from(sheet.cssRules)) {
        parts.push(rule.cssText);
      }
    }
  });
  return parts.join("\n");
}

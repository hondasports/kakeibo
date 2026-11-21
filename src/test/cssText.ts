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

/**
 * 要素に付いた emotion のクラス（`css-` 接頭辞）のうち、
 * `declarationPattern`（正規表現の一部）を含む規則を持つものを返す。
 * メディアクエリ内の規則も対象にする。
 */
export function findEmotionClassName(
  element: Element,
  declarationPattern: string,
): string | undefined {
  const css = collectDocumentCssText();
  return Array.from(element.classList)
    .filter((name) => name.startsWith("css-"))
    .find((name) => new RegExp(`\\.${name}\\s*\\{[^}]*${declarationPattern}`).test(css));
}

/**
 * `@media (min-width:<minWidth>)` の中で `.className` に `declarations`
 * （正規表現の一部）がある規則にマッチする正規表現を返す。
 * ブロック内の検索は `.class{...}` 1段の入れ子までに限定し、
 * メディアブロックの閉じ括弧を越えた後続ルールにはマッチしない。
 */
export function mediaMinWidthRule(
  className: string,
  minWidth: string,
  declarations: string,
): RegExp {
  return new RegExp(
    `@media \\(min-width:\\s*${minWidth}\\)\\s*\\{(?:[^{}]|\\{[^}]*\\})*\\.${className}\\s*\\{[^}]*${declarations}`,
  );
}

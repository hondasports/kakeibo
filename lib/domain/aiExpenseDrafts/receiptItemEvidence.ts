import type { ExtractReceiptFieldsResult } from "../receiptImageExtraction/extractionResult";
import type { ReceiptRawObservationLine } from "../receipt/observations";
import { classifyReceiptLines } from "../receipt/lineClassification";

type Item = NonNullable<ExtractReceiptFieldsResult["items"]>[number];

export function receiptItemMatchName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/^[\s※*◎○]+/, "")
    .replace(/(?:軽[※*]?|込|特|期)\s*$/g, "")
    .replace(/\(?\s*\d+\s*(?:個|コ)\s*[×xX].*$/, "")
    .replace(/\d+\s*@\s*[＊*×xX]\s*\d+.*$/, "")
    .replace(/[\s,:：・￥¥円()（）]/g, "")
    .toLowerCase();
}

export function withoutReceiptAmount(line: ReceiptRawObservationLine): string {
  const text = line.rawText.normalize("NFKC");
  const amount = line.amountText?.normalize("NFKC");
  const at = amount ? text.lastIndexOf(amount) : -1;
  return (at >= 0 ? text.slice(0, at) + text.slice(at + amount!.length) : text).trim();
}

function auxiliary(value: string): boolean {
  const text = value.normalize("NFKC").replace(/\s/g, "");
  return (
    /^\d{6,14}$/.test(text) ||
    /^\(?\d+(?:個|コ)?[×xX]@?(?:単)?\d+\)?$/.test(text) ||
    /^\(?\d+@?[＊*×xX]\d+(?:個|コ)?\)?$/.test(text) ||
    /^\(?\d+(?:個|コ)[×xX]@\d+\)?$/.test(text)
  );
}

/** Join only adjacent printed support rows; retain original observations separately for review. */
export function prepareReceiptItemEvidence(items: Item[], raw: ReceiptRawObservationLine[]) {
  const lines = [...raw]
    .sort((a, b) => a.sourceLineIndex - b.sourceLineIndex)
    .map((line) => ({ ...line }));
  // Unknown is an AI guess, not a veto. Require corroborating extracted product text
  // and reject explicit structural labels before using such a row as item evidence.
  for (const line of lines) {
    if (!line.explicitlyPrinted || !line.lineRoleCandidates.every((role) => role === "unknown"))
      continue;
    if (
      /(?:ポイント|クーポン|会員|残高|登録番号|伝票|レシートNo|TEL|電話|預り|釣り)/i.test(
        line.rawText.normalize("NFKC"),
      )
    )
      continue;
    const classification = classifyReceiptLines([line])[0];
    if (classification?.status === "classified") continue;
    const name = receiptItemMatchName(withoutReceiptAmount(line));
    if (name.length < 2 || auxiliary(withoutReceiptAmount(line))) continue;
    if (items.some((item) => receiptItemMatchName(item.itemName).includes(name))) {
      line.lineRoleCandidates = ["item"];
      line.roleConfidence = Math.max(line.roleConfidence, 0.8);
    }
  }
  const supportIndexes = new Set<number>();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const previous = lines[i - 1];
    if (
      !auxiliary(withoutReceiptAmount(line)) ||
      !previous.lineRoleCandidates.includes("item") ||
      auxiliary(withoutReceiptAmount(previous)) ||
      !line.explicitlyPrinted ||
      !previous.explicitlyPrinted ||
      line.sourceLineIndex !== previous.sourceLineIndex + 1
    )
      continue;
    if (
      previous.amountYen !== null &&
      line.amountYen !== null &&
      previous.amountYen !== line.amountYen
    )
      continue;
    if (previous.amountYen === null && line.amountYen !== null) {
      previous.amountYen = line.amountYen;
      previous.amountText = line.amountText;
    }
    supportIndexes.add(line.sourceLineIndex);
  }
  const productLines = lines.filter((line) => !supportIndexes.has(line.sourceLineIndex));
  const preparedItems = items
    .filter(
      (item) =>
        !lines.some(
          (line) =>
            supportIndexes.has(line.sourceLineIndex) &&
            receiptItemMatchName(withoutReceiptAmount(line)) ===
              receiptItemMatchName(item.itemName) &&
            line.amountYen === (item.printedAmountYen ?? item.amountYen),
        ),
    )
    .flatMap((item) => {
      const name = receiptItemMatchName(item.itemName);
      const containedText = lines.filter((line) => {
        const rawName = receiptItemMatchName(withoutReceiptAmount(line));
        return rawName.length >= 2 && name.includes(rawName);
      });
      const contained = productLines.filter(
        (line) => containedText.includes(line) && line.lineRoleCandidates.includes("item"),
      );
      // A merged AI name spanning multiple printed products belongs only to its priced row.
      const priced = contained.filter(
        (line) => line.amountYen === (item.printedAmountYen ?? item.amountYen),
      );
      if (
        new Set(containedText.map((line) => receiptItemMatchName(withoutReceiptAmount(line))))
          .size > 1 &&
        priced.length === 1 &&
        containedText.some((line) => line.amountYen !== priced[0].amountYen)
      ) {
        if (
          items.some(
            (other) =>
              other !== item &&
              receiptItemMatchName(other.itemName) ===
                receiptItemMatchName(withoutReceiptAmount(priced[0])) &&
              (other.printedAmountYen ?? other.amountYen) === priced[0].amountYen,
          )
        )
          return [];
        return { ...item, itemName: withoutReceiptAmount(priced[0]) };
      }
      if (
        new Set(contained.map((line) => receiptItemMatchName(withoutReceiptAmount(line)))).size >
          1 &&
        priced.length > 1 &&
        !contained.some((line) => receiptItemMatchName(withoutReceiptAmount(line)) === name)
      ) {
        // Do not keep a merged AI candidate when its amount maps to multiple
        // printed products; the candidate cannot be assigned uniquely.
        return [];
      }
      return item;
    });
  return { items: preparedItems, lines: productLines };
}

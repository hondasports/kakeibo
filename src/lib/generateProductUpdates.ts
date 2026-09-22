import type { ProductUpdate } from "../../lib/domain/productUpdates";

export type MergedPullRequest = {
  number: number;
  title: string;
  body: string | null;
  labels: string[];
  mergedAt: string;
};

export function getProductUpdateSourcePullRequestNumbers(id: string): number[] {
  const singleMatch = /^pr-(\d+)$/.exec(id);
  const groupedMatch = /^prs-(\d+(?:-\d+)+)$/.exec(id);
  const numberPart = singleMatch?.[1] ?? groupedMatch?.[1];

  if (!numberPart) {
    return [];
  }

  const numbers = numberPart.split("-").map(Number);
  return numbers.every((number) => Number.isSafeInteger(number) && number > 0) ? numbers : [];
}

export function filterUnpublishedPullRequests(
  pulls: Pick<MergedPullRequest, "number">[],
  publishedUpdates: Pick<ProductUpdate, "id">[],
): typeof pulls {
  const publishedPullRequestNumbers = new Set(
    publishedUpdates.flatMap((update) => getProductUpdateSourcePullRequestNumbers(update.id)),
  );

  return pulls.filter((pull) => !publishedPullRequestNumbers.has(pull.number));
}

export function sanitizeExternalText(text: string): string {
  const normalized = text.normalize("NFC");
  const withoutControl = normalized.replace(
    /[\p{Cc}\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/gu,
    "",
  );
  const withoutComments = removeHtmlComments(withoutControl);
  return withoutComments.trim();
}

function removeHtmlComments(text: string): string {
  let previous;
  do {
    previous = text;
    text = text.replace(/<!--[\s\S]*?(?:-->|$)/gu, "");
  } while (text !== previous);
  return text;
}

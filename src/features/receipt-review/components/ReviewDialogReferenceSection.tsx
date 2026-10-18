import { Box, Button, Stack, Typography } from "@mui/material";
import type { AiExpenseDraft } from "../../../../lib/domain/aiExpenseDrafts/reviewTypes";

export type ReviewDialogReferenceSectionProps = {
  draft: AiExpenseDraft | null;
  open: boolean;
  busy: boolean;
  register: (target: string) => (node: HTMLElement | null) => void;
  onToggle: () => void;
  onResetToAiInterpretation: () => void;
};

export function ReviewDialogReferenceSection({
  draft,
  open,
  busy,
  register,
  onToggle,
  onResetToAiInterpretation,
}: ReviewDialogReferenceSectionProps) {
  return (
    <>
      <Box component="details" ref={register("reference")} open={open} inert={busy}>
        <Typography
          component="summary"
          onClick={(event) => {
            event.preventDefault();
            onToggle();
          }}
          sx={{ cursor: "pointer" }}
        >
          読み取り原文（参考）
        </Typography>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {draft?.rawObservation?.lines.length ? (
            <Box component="ol" aria-label="OCR原文" sx={{ pl: 3, m: 0 }}>
              {draft.rawObservation.lines.map((line) => (
                <Typography component="li" variant="body2" key={line.sourceLineIndex}>
                  {line.rawText}
                </Typography>
              ))}
            </Box>
          ) : (
            <Typography variant="body2">読み取り原文はありません。</Typography>
          )}
          {draft?.receiptInterpretation && draft.receiptUserOverride && (
            <Button
              disabled={busy}
              color="warning"
              type="button"
              onClick={onResetToAiInterpretation}
            >
              {draft.receiptInterpretation.source === "legacy_projection"
                ? "修正前の内容へ戻す"
                : "AI判定へ戻す"}
            </Button>
          )}
        </Stack>
      </Box>
    </>
  );
}

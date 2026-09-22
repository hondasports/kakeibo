import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Box, Button, Stack, Typography } from "@mui/material";
import { useId, useLayoutEffect, useRef, useState } from "react";
import {
  getMemoLineClampSx,
  MEMO_COLLAPSED_MAX_LINES,
  memoNeedsCollapseByLayout,
  memoNeedsCollapseByLineCount,
} from "../utils/memoExpandableTextUtils";

const memoTypographySx = {
  whiteSpace: "pre-wrap" as const,
  wordBreak: "break-word" as const,
};

const hiddenMeasureSx = {
  ...memoTypographySx,
  position: "absolute" as const,
  visibility: "hidden" as const,
  pointerEvents: "none" as const,
  top: 0,
  left: 0,
  width: "100%",
  height: "auto",
  maxHeight: "none",
};

function measureMemoNeedsCollapse(measureElement: HTMLSpanElement): boolean {
  const lineHeight = parseFloat(getComputedStyle(measureElement).lineHeight);
  return memoNeedsCollapseByLayout(measureElement.scrollHeight, lineHeight);
}

/**
 * 支出一覧のメモ表示。3行以上（改行または折り返し）のときだけ「もっと見る / 閉じる」を出す。
 * 文字数での slice は使わないため、絵文字・結合文字もそのまま全文を描画する。
 */
export function MemoExpandableText({ memo }: { memo: string }) {
  const needsCollapseByLines = memoNeedsCollapseByLineCount(memo);
  const [expanded, setExpanded] = useState(false);
  const [needsCollapse, setNeedsCollapse] = useState(needsCollapseByLines);
  const measureRef = useRef<HTMLSpanElement>(null);
  const contentId = useId();

  const [prevMemo, setPrevMemo] = useState(memo);
  if (prevMemo !== memo) {
    setPrevMemo(memo);
    setExpanded(false);
  }

  if (needsCollapseByLines && !needsCollapse) {
    setNeedsCollapse(true);
  }

  useLayoutEffect(() => {
    if (needsCollapseByLines) {
      return;
    }

    const measureElement = measureRef.current;
    if (!measureElement) {
      return;
    }

    const updateNeedsCollapse = () => {
      const nextNeedsCollapse = measureMemoNeedsCollapse(measureElement);
      setNeedsCollapse((current) => (current === nextNeedsCollapse ? current : nextNeedsCollapse));
    };

    queueMicrotask(updateNeedsCollapse);

    window.addEventListener("resize", updateNeedsCollapse);
    return () => {
      window.removeEventListener("resize", updateNeedsCollapse);
    };
  }, [memo, needsCollapseByLines]);

  return (
    <Stack
      data-testid="memo-expandable-text"
      spacing={0.25}
      sx={{ mt: 0.5, maxWidth: "100%", position: "relative" }}
    >
      {!needsCollapseByLines && (
        <Typography
          ref={measureRef}
          aria-hidden
          color="text.secondary"
          component="span"
          data-testid="memo-expand-measure"
          sx={hiddenMeasureSx}
          variant="caption"
        >
          {memo}
        </Typography>
      )}
      <Typography
        color="text.secondary"
        data-testid="memo-expandable-content"
        id={contentId}
        sx={{
          ...memoTypographySx,
          ...(needsCollapse && !expanded ? getMemoLineClampSx(MEMO_COLLAPSED_MAX_LINES) : {}),
        }}
        variant="caption"
      >
        {memo}
      </Typography>
      {needsCollapse && (
        <Box>
          <Button
            aria-controls={contentId}
            aria-expanded={expanded}
            color="primary"
            data-testid="memo-expand-toggle"
            endIcon={
              expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />
            }
            onClick={() => setExpanded((current) => !current)}
            size="small"
            sx={{ minHeight: 28, minWidth: 0, px: 0, textTransform: "none" }}
            type="button"
            variant="text"
          >
            {expanded ? "閉じる" : "もっと見る"}
          </Button>
        </Box>
      )}
    </Stack>
  );
}

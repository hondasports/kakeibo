import { Box, Stack } from "@mui/material";
import { AiExpenseQueuePanelProvider } from "../context/AiExpenseQueuePanelContext";
import {
  QueuePanelActive,
  QueuePanelDialogs,
  QueuePanelHeader,
  QueuePanelRegistered,
} from "./QueuePanelSlots";
import type { AiExpenseQueuePanelProps } from "../../../types/aiExpenseQueue";

export type { AiExpenseQueueItem } from "../../../types/aiExpenseQueue";

export function AiExpenseQueuePanel(props: AiExpenseQueuePanelProps) {
  return (
    <AiExpenseQueuePanelProvider {...props}>
      <Box
        aria-labelledby="ai-expense-queue-heading"
        className="ai-expense-queue"
        component="section"
      >
        <Stack className="queue-panel-content" spacing={2} sx={{ maxWidth: "100%", minWidth: 0 }}>
          <QueuePanelHeader />
          <QueuePanelActive />
          <QueuePanelRegistered />
        </Stack>
      </Box>
      <QueuePanelDialogs categories={props.categories} />
    </AiExpenseQueuePanelProvider>
  );
}

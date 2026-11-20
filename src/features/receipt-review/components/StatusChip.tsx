import { Chip } from "@mui/material";
import type { AiExpenseQueueStatus } from "../../../types/aiExpenseQueue";
import {
  getSectionKey,
  getStatusColor,
  getStatusIcon,
  queueSectionLabels,
  statusLabels,
} from "./labels";

function getStatusChipLabel(status: AiExpenseQueueStatus) {
  if (status === "registering") {
    return statusLabels.registering;
  }
  return queueSectionLabels[getSectionKey(status)];
}

export function StatusChip({ status }: { status: AiExpenseQueueStatus }) {
  return (
    <Chip
      color={getStatusColor(status)}
      icon={getStatusIcon(status)}
      label={getStatusChipLabel(status)}
      size="small"
    />
  );
}

import { Chip } from "@mui/material";
import type { AiExpenseQueueStatus } from "../../../types/aiExpenseQueue";
import {
  displayStatusLabels,
  getDisplayStatus,
  getStatusColor,
  getStatusIcon,
  statusLabels,
} from "./labels";

function getStatusChipLabel(status: AiExpenseQueueStatus) {
  if (status === "registering") {
    return statusLabels.registering;
  }
  return displayStatusLabels[getDisplayStatus(status)];
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

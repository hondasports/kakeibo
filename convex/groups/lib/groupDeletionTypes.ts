import type { TableNames } from "../../_generated/dataModel";
import type { PurgeStage as DomainPurgeStage } from "../../../lib/domain/groupDeletion/stages";
import type { StageProgress as DeletionStageProgress } from "../../../lib/usecase/groupDeletion/runPurgeStage";

export type PurgeStage = DomainPurgeStage & TableNames;
export type StageProgress = DeletionStageProgress;

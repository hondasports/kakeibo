import { v } from "convex/values";
import { ENTRY_KINDS } from "../../domain/common/entryKind";
import { RECORD_TYPES } from "../../domain/common/recordKind";

export const entryKindValidator = v.union(...ENTRY_KINDS.map((kind) => v.literal(kind)));

export const recordTypeValidator = v.union(...RECORD_TYPES.map((kind) => v.literal(kind)));

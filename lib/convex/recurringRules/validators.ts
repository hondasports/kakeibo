import { v } from "convex/values";
import { RECURRING_FREQUENCIES } from "../../domain/recurringRules/recurringRule";

export const recurringFrequencyValidator = v.union(
  ...RECURRING_FREQUENCIES.map((frequency) => v.literal(frequency)),
);

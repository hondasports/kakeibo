import { v } from "convex/values";
import { CATEGORY_MOVE_DIRECTIONS } from "../../domain/categories/category";

export const categoryMoveDirectionValidator = v.union(
  ...CATEGORY_MOVE_DIRECTIONS.map((direction) => v.literal(direction)),
);

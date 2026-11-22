import { query } from "../_generated/server";
import { listEntryFavoritesHandler } from "../../lib/convex/entryFavorites/entryFavoriteHandlers";

export { listEntryFavoritesHandler };

export const listEntryFavorites = query({
  args: {},
  handler: listEntryFavoritesHandler,
});

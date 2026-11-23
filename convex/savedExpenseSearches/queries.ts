import { query } from "../_generated/server";
import { listSavedExpenseSearchesHandler } from "../../lib/convex/savedExpenseSearches/savedExpenseSearchHandlers";

export { listSavedExpenseSearchesHandler };

export const listSavedExpenseSearches = query({
  args: {},
  handler: listSavedExpenseSearchesHandler,
});

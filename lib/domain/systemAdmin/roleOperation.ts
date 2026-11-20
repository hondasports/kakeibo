/**
 * systemAdmin によるグループロール操作に関するドメインルール。
 */

/** systemAdmin が実行できるロール操作の全値。 */
export const SYSTEM_ADMIN_ROLE_OPERATIONS = ["change_role", "transfer_owner"] as const;

/** systemAdmin が実行できるロール操作。 */
export type SystemAdminRoleOperation = (typeof SYSTEM_ADMIN_ROLE_OPERATIONS)[number];

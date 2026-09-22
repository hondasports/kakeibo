import { api } from "../../../../convex/_generated/api";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { toUserFacingRegistrationError } from "../../receipt-review/utils/userFacingErrors";

export function useBulkRegister({ readyItemIds }: { readyItemIds: string[] }) {
  const previousReadyItemIdsRef = useRef<string[]>([]);
  const [selectedReadyIds, setSelectedReadyIds] = useState<string[]>([]);
  const [registeringIds, setRegisteringIds] = useState<string[]>([]);
  const [registrationError, setRegistrationError] = useState("");

  const registerReadyDraftsAsExpenseEntries = useMutation(
    api.aiExpenseDrafts.mutations.registerReadyDraftsAsExpenseEntries,
  );

  useEffect(() => {
    const previousReadyItemIds = previousReadyItemIdsRef.current;
    setSelectedReadyIds((current) => {
      const retained = current.filter((id) => readyItemIds.includes(id));
      const additions = readyItemIds.filter(
        (id) => !previousReadyItemIds.includes(id) && !retained.includes(id),
      );
      const next = [...retained, ...additions];
      if (next.length === current.length && next.every((id, index) => id === current[index])) {
        return current;
      }
      return next;
    });
    previousReadyItemIdsRef.current = readyItemIds;
  }, [readyItemIds]);

  const handleToggleReadySelection = (itemId: string, checked: boolean) => {
    setSelectedReadyIds((current) => {
      if (checked) {
        return current.includes(itemId) ? current : [...current, itemId];
      }
      return current.filter((id) => id !== itemId);
    });
  };

  const handleRegisterReady = async (draftIds = selectedReadyIds) => {
    if (draftIds.length === 0) {
      return;
    }
    setRegistrationError("");
    setRegisteringIds(draftIds);
    try {
      await registerReadyDraftsAsExpenseEntries({
        draftIds: draftIds as Id<"aiExpenseDrafts">[],
      });
      setSelectedReadyIds((current) => current.filter((id) => !draftIds.includes(id)));
    } catch (error) {
      setRegistrationError(toUserFacingRegistrationError(error));
    } finally {
      setRegisteringIds([]);
    }
  };

  const removeFromSelection = (itemId: string) => {
    setSelectedReadyIds((current) => current.filter((id) => id !== itemId));
  };

  return {
    selectedReadyIds,
    registeringIds,
    registrationError,
    setSelectedReadyIds,
    setRegisteringIds,
    setRegistrationError,
    handleToggleReadySelection,
    handleRegisterReady,
    removeFromSelection,
  };
}

import { useSyncExternalStore } from "react";

type SignOutState = { pending: boolean; error: string };
let state: SignOutState = { pending: false, error: "" };
const listeners = new Set<() => void>();

export function setSignOutState(next: SignOutState) {
  state = next;
  for (const listener of listeners) listener();
}

export function useSignOutState() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => state,
    () => state,
  );
}

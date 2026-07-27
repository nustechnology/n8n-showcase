import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** SSR-safe "has this component hydrated on the client yet" check, without a setState-in-effect. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}

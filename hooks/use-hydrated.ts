"use client"

import { useSyncExternalStore } from "react"

const subscribe = () => () => {}

/** true une fois côté navigateur : le stockage local est alors lisible */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}

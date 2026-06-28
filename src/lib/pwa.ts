/// <reference types="vite-plugin-pwa/client" />
import { registerSW } from "virtual:pwa-register";

/**
 * Service-worker update control. Registered in "prompt" mode so `onNeedRefresh`
 * fires when a new build is waiting; we immediately apply it. `updateSW(true)`
 * posts SKIP_WAITING (our SW handles it) and reloads once the new SW takes
 * control. `checkForUpdate()` lets the manual "sync" button force a check, so
 * users always get the latest UI without clearing caches by hand.
 */

let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;

export function initPWA(): void {
  if (!("serviceWorker" in navigator)) return;
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      void updateSW?.(true); // a new build is ready — activate + reload
    },
  });
}

/** Force a check for a new build; if found it auto-applies and reloads. */
export async function checkForUpdate(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch {
    // offline or unsupported — ignore
  }
}

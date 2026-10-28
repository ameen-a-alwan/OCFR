/** Set before client navigation to `/` from a subpage to skip the forge intro once. */
export const HUB_INTRO_SKIP_ONCE = "dar3_hub_intro_skip_once";

export function markSkipHubIntro() {
  try {
    sessionStorage.setItem(HUB_INTRO_SKIP_ONCE, "1");
  } catch {
    /* ignore */
  }
}

export function consumeSkipHubIntro(): boolean {
  try {
    if (sessionStorage.getItem(HUB_INTRO_SKIP_ONCE) === "1") {
      sessionStorage.removeItem(HUB_INTRO_SKIP_ONCE);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

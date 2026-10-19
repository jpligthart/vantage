/** Build-time version from package.json / Docker APP_VERSION. */
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || "0.0.0";

/** Short git SHA from build, or empty in bare local runs without git. */
export const GIT_SHA = import.meta.env.VITE_GIT_SHA || "";

export function versionLabel(): string {
  return `v${APP_VERSION}`;
}

export function versionTitle(): string | undefined {
  return GIT_SHA ? `build ${GIT_SHA}` : undefined;
}

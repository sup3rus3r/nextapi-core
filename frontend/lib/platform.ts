// Capacitor is only present after `npm run add:mobile`. We read the global it
// injects at runtime instead of importing `@capacitor/core` directly, so the
// web build has no dependency on it being installed.
declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform: () => boolean;
      getPlatform: () => string;
    };
  }
}

function getCapacitor() {
  if (typeof window === "undefined") return undefined;
  return window.Capacitor;
}

export const platform = {
  get isNative() {
    return getCapacitor()?.isNativePlatform() ?? false;
  },
  get isWeb() {
    return !this.isNative;
  },
  get isAndroid() {
    return getCapacitor()?.getPlatform() === "android";
  },
  get isIOS() {
    return getCapacitor()?.getPlatform() === "ios";
  },
};

import { bookPath, href } from "../../app/routes";

export interface ShareData {
  title: string;
  url: string;
}

export interface ShareCapabilities {
  secure: boolean;
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
}

export interface CopyMethods {
  clipboardWrite?: (text: string) => Promise<void>;
  legacyCopy: (text: string) => boolean;
}

export type ShareResult = "shared" | "copied" | "failed";

export function getBookPermalink(slug: string, origin = window.location.origin) {
  return new URL(href(bookPath(encodeURIComponent(slug))), origin).href;
}

export function getShareActionLabel(canShare: boolean) {
  return canShare ? "Поделиться" : "Скопировать ссылку";
}

export function getBrowserShareCapabilities(): ShareCapabilities {
  return {
    secure: window.isSecureContext,
    share: typeof navigator.share === "function" ? (data) => navigator.share(data) : undefined,
    canShare: typeof navigator.canShare === "function" ? (data) => navigator.canShare(data) : undefined,
  };
}

export function canUseNativeShare(data: ShareData, capabilities: ShareCapabilities) {
  if (!capabilities.secure || !capabilities.share) return false;
  try {
    return capabilities.canShare ? capabilities.canShare(data) : true;
  } catch {
    return false;
  }
}

export async function tryNativeShare(data: ShareData, capabilities: ShareCapabilities) {
  if (!canUseNativeShare(data, capabilities)) return false;
  try {
    await capabilities.share?.(data);
    return true;
  } catch {
    return false;
  }
}

export async function copyTextWithFallback(text: string, methods: CopyMethods) {
  if (methods.clipboardWrite) {
    try {
      await methods.clipboardWrite(text);
      return true;
    } catch {
      // Некоторые webview объявляют Clipboard API, но запрещают запись.
    }
  }
  return methods.legacyCopy(text);
}

export async function shareWithCopyFallback(data: ShareData, capabilities: ShareCapabilities, methods: CopyMethods): Promise<ShareResult> {
  if (await tryNativeShare(data, capabilities)) return "shared";
  return await copyTextWithFallback(data.url, methods) ? "copied" : "failed";
}

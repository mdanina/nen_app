import { useEffect, useRef, useState } from "react";
import {
  canUseNativeShare,
  copyTextWithFallback,
  getBookPermalink,
  getBrowserShareCapabilities,
  getShareActionLabel,
  tryNativeShare,
} from "../domain/books/share";

function legacyCopy(text: string) {
  const input = document.createElement("textarea");
  const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.top = "0";
  input.style.left = "-9999px";
  input.style.fontSize = "16px";
  document.body.append(input);
  input.focus({ preventScroll: true });
  input.select();
  input.setSelectionRange(0, input.value.length);
  const copied = document.execCommand("copy");
  input.remove();
  previouslyFocused?.focus({ preventScroll: true });
  return copied;
}

export function BookShareButton({ slug, title }: { slug: string; title: string }) {
  const url = getBookPermalink(slug);
  const shareData = { title, url };
  const [copyMode, setCopyMode] = useState(() => !canUseNativeShare(shareData, getBrowserShareCapabilities()));
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const showCopied = () => {
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2200);
  };

  const handleShare = async () => {
    if (!copyMode) {
      const shared = await tryNativeShare(shareData, getBrowserShareCapabilities());
      if (shared) return;
      setCopyMode(true);
      setCopied(false);
      return;
    }

    const copiedSuccessfully = await copyTextWithFallback(url, {
      clipboardWrite: navigator.clipboard?.writeText ? (text) => navigator.clipboard.writeText(text) : undefined,
      legacyCopy,
    });
    if (copiedSuccessfully) showCopied();
  };

  return <div>
    <button className="save-large" type="button" onClick={handleShare}>{getShareActionLabel(!copyMode)}</button>
    <p className="similar-reason" role="status" aria-live="polite">{copied ? "Ссылка скопирована" : ""}</p>
  </div>;
}

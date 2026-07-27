import { useEffect, useId, useRef, useState } from "react";
import {
  canUseNativeShare,
  copyTextWithFallback,
  getBookPermalink,
  getBrowserShareCapabilities,
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
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const menuId = useId();
  const url = getBookPermalink(slug);
  const shareData = { title, url };
  const capabilities = getBrowserShareCapabilities();
  const canShare = canUseNativeShare(shareData, capabilities);

  useEffect(() => {
    if (open) firstActionRef.current?.focus();
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const showToast = (message: string) => {
    setToast(message);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(""), 2200);
  };

  const copyLink = async () => {
    setOpen(false);
    const copied = await copyTextWithFallback(url, {
      clipboardWrite: navigator.clipboard?.writeText ? (text) => navigator.clipboard.writeText(text) : undefined,
      legacyCopy,
    });
    showToast(copied ? "Ссылка скопирована" : "Не удалось скопировать ссылку");
  };

  const shareLink = async () => {
    if (!canShare || !capabilities.share) return;
    try {
      await capabilities.share(shareData);
      setOpen(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      await copyLink();
    }
  };

  return (
    <div className="book-share" ref={rootRef}>
      <button
        className="book-share__trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        Поделиться
      </button>
      {open && (
        <div className="book-share__menu" id={menuId} role="menu">
          <button ref={firstActionRef} type="button" role="menuitem" onClick={() => void copyLink()}>
            <span aria-hidden="true">📋</span>
            Скопировать ссылку
          </button>
          {canShare && (
            <button type="button" role="menuitem" onClick={() => void shareLink()}>
              <span aria-hidden="true">↗️</span>
              Поделиться…
            </button>
          )}
        </div>
      )}
      {toast && <div className="book-share__toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  );
}

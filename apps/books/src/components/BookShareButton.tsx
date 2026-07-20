import { useEffect, useRef, useState } from "react";
import { getBookPermalink, getShareActionLabel } from "../domain/books/share";

async function copyLink(url: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return;
  }

  const input = document.createElement("textarea");
  input.value = url;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("Не удалось скопировать ссылку");
}

export function BookShareButton({ slug, title }: { slug: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const canShare = typeof navigator.share === "function";

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const showCopied = () => {
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2200);
  };

  const handleShare = async () => {
    const url = getBookPermalink(slug);
    if (canShare) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    try {
      await copyLink(url);
      showCopied();
    } catch {
      setCopied(false);
    }
  };

  return <div>
    <button className="save-large" type="button" onClick={handleShare}>{getShareActionLabel(canShare)}</button>
    <p className="similar-reason" role="status" aria-live="polite">{copied ? "Ссылка скопирована" : ""}</p>
  </div>;
}

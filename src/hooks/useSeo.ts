import { useEffect } from "react";

export function useSeo(title: string, description: string, canonicalPath: string, filterKey = "") {
  useEffect(() => {
    document.title = title;
    const setMeta = (selector: string, attribute: "name" | "property", key: string, content: string) => {
      let element = document.head.querySelector<HTMLMetaElement>(selector);
      if (!element) { element = document.createElement("meta"); element.setAttribute(attribute, key); document.head.appendChild(element); }
      element.content = content;
    };
    setMeta('meta[name="description"]', "name", "description", description);
    setMeta('meta[property="og:title"]', "property", "og:title", title);
    setMeta('meta[property="og:description"]', "property", "og:description", description);
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement("link"); canonical.rel = "canonical"; document.head.appendChild(canonical); }
    canonical.href = `${window.location.origin}${canonicalPath}`;
    const robots = filterKey ? "noindex,follow" : "index,follow";
    setMeta('meta[name="robots"]', "name", "robots", robots);
  }, [title, description, canonicalPath, filterKey]);
}

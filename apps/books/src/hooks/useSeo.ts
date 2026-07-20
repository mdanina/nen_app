import { useEffect } from "react";
export function useSeo(title: string, description: string, canonicalPath: string, noIndex = false) {
  useEffect(() => {
    document.title = title;
    const setMeta = (attribute: "name" | "property", key: string, content: string) => {
      let element = document.head.querySelector(`meta[${attribute}="${key}"]`) as HTMLMetaElement | null;
      if (!element) { element = document.createElement("meta"); element.setAttribute(attribute, key); document.head.append(element); }
      element.content = content;
    };
    const canonical = `${window.location.origin}${canonicalPath}`;
    let canonicalElement = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonicalElement) { canonicalElement = document.createElement("link"); canonicalElement.rel = "canonical"; document.head.append(canonicalElement); }
    canonicalElement.href = canonical;
    setMeta("name", "description", description);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:type", "website");
    setMeta("property", "og:url", canonical);
    setMeta("name", "robots", noIndex ? "noindex,follow" : "index,follow");
  }, [title, description, canonicalPath, noIndex]);
}

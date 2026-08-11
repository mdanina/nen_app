import { useEffect } from "react";
import { href } from "../app/routes";

// Канонический адрес считается от боевого домена, а не от текущего origin:
// иначе превью-стенд подставит в canonical сам себя.
const PUBLIC_ORIGIN = (import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined)?.replace(/\/$/u, "");

export function useSeo(title: string, description: string, canonicalRoute: string, noIndex = false, type: "website" | "book" = "website") {
  useEffect(() => {
    document.title = title;

    const setMeta = (attribute: "name" | "property", key: string, content: string) => {
      let element = document.head.querySelector(`meta[${attribute}="${key}"]`) as HTMLMetaElement | null;
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attribute, key);
        document.head.append(element);
      }
      element.content = content;
    };

    const canonical = `${PUBLIC_ORIGIN || window.location.origin}${href(canonicalRoute)}`;
    let canonicalElement = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonicalElement) {
      canonicalElement = document.createElement("link");
      canonicalElement.rel = "canonical";
      document.head.append(canonicalElement);
    }
    canonicalElement.href = canonical;

    setMeta("name", "description", description);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:type", type);
    setMeta("property", "og:url", canonical);
    setMeta("property", "og:locale", "ru_RU");
    setMeta("property", "og:site_name", "НЭН");
    setMeta("name", "robots", noIndex ? "noindex,follow" : "index,follow");
  }, [title, description, canonicalRoute, noIndex, type]);
}

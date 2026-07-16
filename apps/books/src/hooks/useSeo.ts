import { useEffect } from "react";
export function useSeo(title: string, description: string, canonicalPath: string, noIndex = false) {
  useEffect(() => {
    document.title = title;
    const set = (selector: string, attr: string, value: string) => { let element = document.head.querySelector(selector) as HTMLMetaElement | HTMLLinkElement | null; if (!element) { element = document.createElement(selector.startsWith("link") ? "link" : "meta"); document.head.append(element); } element.setAttribute(attr, value); };
    set('meta[name="description"]', "content", description); set('meta[property="og:title"]', "content", title); set('meta[property="og:description"]', "content", description); set('meta[property="og:type"]', "content", "website"); set('link[rel="canonical"]', "href", `${window.location.origin}${canonicalPath}`); set('meta[name="robots"]', "content", noIndex ? "noindex,follow" : "index,follow");
  }, [title, description, canonicalPath, noIndex]);
}

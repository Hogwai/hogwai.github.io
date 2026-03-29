import { ui, defaultLang, type Lang, type UIKey } from "./ui";

export type { Lang };

export function getLangFromUrl(url: URL): Lang {
  const [, langOrSection] = url.pathname.split("/");
  if (langOrSection in ui && langOrSection !== defaultLang) {
    return langOrSection as Lang;
  }
  return defaultLang;
}

export function useTranslations(lang: Lang) {
  return function t(key: UIKey): string {
    return ui[lang][key] ?? ui[defaultLang][key];
  };
}

export function getLocalePath(lang: Lang): string {
  return lang === defaultLang ? "" : `/${lang}`;
}

export function getSlugWithoutLang(slug: string): string {
  const parts = slug.split("/");
  if (parts.length > 1 && parts[0] in ui) {
    return parts.slice(1).join("/");
  }
  return slug;
}

export function getLangFromSlug(slug: string): Lang {
  const parts = slug.split("/");
  if (parts[0] in ui) {
    return parts[0] as Lang;
  }
  return defaultLang;
}

export function getAlternateUrl(url: URL, targetLang: Lang): string {
  const currentLang = getLangFromUrl(url);
  let pathname = url.pathname;

  if (pathname !== "/" && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  if (currentLang !== defaultLang) {
    pathname = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, "") || "/";
  }

  if (targetLang === defaultLang) {
    return pathname === "" || pathname === "/" ? "/" : pathname + "/";
  }

  if (pathname === "" || pathname === "/") {
    return `/${targetLang}/`;
  }

  return `/${targetLang}${pathname}/`;
}

export function getOtherLang(lang: Lang): Lang {
  return lang === "en" ? "fr" : "en";
}

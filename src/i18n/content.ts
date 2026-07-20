import { type Lang } from "./ui";

/**
 * Filter collection entries by locale (en/ or fr/ prefix in id) and exclude drafts.
 * Use this instead of repeating `.filter(e => !e.data.draft && e.id.startsWith('en/'))`.
 */
export function filterByLocale<
  T extends { id: string; data: { draft?: boolean } },
>(entries: T[], lang: Lang): T[] {
  return entries.filter((e) => !e.data.draft && e.id.startsWith(`${lang}/`));
}

/**
 * Infer locale from a content entry ID string.
 * Returns "fr" if the id starts with "fr/", "en" otherwise.
 */
export function getLocaleFromId(id: string): Lang {
  return id.startsWith("fr/") ? "fr" : "en";
}

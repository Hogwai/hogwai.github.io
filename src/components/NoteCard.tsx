import { defaultLang, type Lang } from "../i18n/ui";
import { getLocalePath } from "../i18n/utils";

interface Props {
  title: string;
  description?: string;
  pubDate: Date;
  slug: string;
  tags: string[];
  language?: string;
  lang?: Lang;
  langBadge?: string;
}

export default function NoteCard({
  title,
  description,
  pubDate,
  slug,
  tags,
  language,
  lang = defaultLang,
  langBadge,
}: Props) {
  const prefix = getLocalePath(lang);
  const locale = lang === "fr" ? "fr-FR" : "en-GB";

  return (
    <article className="relative group border border-edge rounded-lg p-4 bg-surface hover:border-link transition">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold leading-snug">
            <a
              href={`${prefix}/notes/${slug}`}
              className="text-ink group-hover:text-link transition after:absolute after:inset-0 after:content-['']"
            >
              {title}
            </a>
          </h2>
          <div className="flex items-center gap-1">
            {langBadge && (
              <span className="relative z-10 shrink-0 px-2 py-0.5 bg-muted text-ink rounded text-xs font-mono">
                {langBadge}
              </span>
            )}
            {language && (
              <span className="relative z-10 shrink-0 px-2 py-0.5 bg-muted text-ink rounded text-xs font-mono">
                {language}
              </span>
            )}
          </div>
        </div>
        <time className="text-xs text-ink-muted block">
          {pubDate.toLocaleDateString(locale, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </time>
        {description && (
          <p className="text-sm text-ink line-clamp-2">{description}</p>
        )}
        {tags.length > 0 && (
          <div className="relative z-10 flex flex-wrap gap-1.5 pt-1">
            {tags.map((tag) => (
              <a
                key={tag}
                href={`${prefix}/tags/${tag}`}
                className="px-2 py-0.5 bg-tag-bg text-tag-text rounded text-xs hover:underline"
              >
                {tag}
              </a>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

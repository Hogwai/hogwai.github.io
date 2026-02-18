interface Props {
  title: string;
  description?: string;
  pubDate: Date;
  slug: string;
  tags: string[];
  language?: string;
}

export default function NoteCard({
  title,
  description,
  pubDate,
  slug,
  tags,
  language,
}: Props) {
  return (
    <a
      href={`/notes/${slug}`}
      className="block group border border-gray-200 dark:border-gray-800 rounded-lg p-4 bg-white dark:bg-gray-900 hover:border-blue-500 dark:hover:border-blue-500 transition"
    >
      <article className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition leading-snug">
            {title}
          </h2>
          {language && (
            <span className="shrink-0 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded text-xs font-mono">
              {language}
            </span>
          )}
        </div>
        <time className="text-xs text-gray-500 dark:text-gray-500 block">
          {pubDate.toLocaleDateString("en-GB", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </time>
        {description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
            {description}
          </p>
        )}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 bg-blue-100 dark:bg-blue-600/20 text-blue-700 dark:text-blue-400 rounded text-xs"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </article>
    </a>
  );
}

interface Props {
  title: string;
  description: string;
  pubDate: Date;
  slug: string;
  tags: string[];
}

export default function BlogCard({
  title,
  description,
  pubDate,
  slug,
  tags,
}: Props) {
  return (
    <article className="relative group border border-gray-200 dark:border-gray-800 rounded-lg p-4 bg-white dark:bg-gray-900 hover:border-blue-500 dark:hover:border-blue-500 transition">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold leading-snug">
          <a
            href={`/posts/${slug}`}
            className="text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition after:absolute after:inset-0 after:content-['']"
          >
            {title}
          </a>
        </h2>
        <time className="text-xs text-gray-500 dark:text-gray-500 block">
          {pubDate.toLocaleDateString("en-GB", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </time>
        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
          {description}
        </p>
        {tags.length > 0 && (
          <div className="relative z-10 flex flex-wrap gap-1.5 pt-1">
            {tags.map((tag) => (
              <a
                key={tag}
                href={`/tags/${tag}`}
                className="px-2 py-0.5 bg-blue-100 dark:bg-blue-600/20 text-blue-700 dark:text-blue-400 rounded-full text-xs hover:underline"
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

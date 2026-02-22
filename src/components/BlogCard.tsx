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
    <article className="relative group border border-edge rounded-lg p-4 bg-surface hover:border-link transition">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold leading-snug">
          <a
            href={`/posts/${slug}`}
            className="text-ink group-hover:text-link transition after:absolute after:inset-0 after:content-['']"
          >
            {title}
          </a>
        </h2>
        <time className="text-xs text-ink-muted block">
          {pubDate.toLocaleDateString("en-GB", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </time>
        <p className="text-sm text-ink line-clamp-2">{description}</p>
        {tags.length > 0 && (
          <div className="relative z-10 flex flex-wrap gap-1.5 pt-1">
            {tags.map((tag) => (
              <a
                key={tag}
                href={`/tags/${tag}`}
                className="px-2 py-0.5 bg-tag-bg text-tag-text rounded-full text-xs hover:underline"
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

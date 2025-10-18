interface Props {
  title: string;
  description: string;
  pubDate: Date;
  slug: string;
  tags: string[];
}

export default function BlogCard({ title, description, pubDate, slug, tags }: Props) {
  return (
    <article className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 hover:border-blue-500 dark:hover:border-blue-500 transition group">
      <a href={`/posts/${slug}`} className="block">
        <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
          {title}
        </h2>
        <time className="text-sm text-gray-600 dark:text-gray-400 mb-3 block">
          {pubDate.toLocaleDateString('en-GB', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}
        </time>
        <p className="text-gray-700 dark:text-gray-300 mb-4 line-clamp-3">{description}</p>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span key={tag} className="px-2 py-1 bg-blue-100 dark:bg-blue-600/20 text-blue-700 dark:text-blue-400 rounded text-sm">
                {tag}
              </span>
            ))}
          </div>
        )}
      </a>
    </article>
  );
}
import { useState, useMemo } from "react";
import BlogCard from "./BlogCard";
import { defaultLang, type Lang } from "../i18n/ui";
import { useTranslations } from "../i18n/utils";

interface Post {
  slug: string;
  data: {
    title: string;
    description: string;
    pubDate: Date;
    tags: string[];
  };
  lang?: Lang;
  langBadge?: string;
}

interface Props {
  posts: Post[];
  lang?: Lang;
}

export default function SearchAndFilter({ posts, lang = defaultLang }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const t = useTranslations(lang);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    posts.forEach((post) => {
      post.data.tags.forEach((tag) => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [posts]);

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      const normalizedSearch = searchQuery.trim().toLowerCase();

      const matchesSearch =
        searchQuery === "" ||
        post.data.title.toLowerCase().includes(normalizedSearch) ||
        post.data.description.toLowerCase().includes(normalizedSearch) ||
        post.data.tags.some((tag) =>
          tag.toLowerCase().includes(normalizedSearch),
        );

      const matchesTags =
        selectedTags.length === 0 ||
        selectedTags.every((tag) => post.data.tags.includes(tag));

      return matchesSearch && matchesTags;
    });
  }, [posts, searchQuery, selectedTags]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedTags([]);
  };

  const resultCount = filteredPosts.length;
  const resultText =
    resultCount === 1
      ? t("posts.found_one")
      : t("posts.found_other").replace("{count}", String(resultCount));

  return (
    <div>
      {/* Search bar */}
      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            placeholder={t("posts.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-3 pl-12 rounded-lg border border-edge bg-surface text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-link transition"
          />
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      {/* Filter by tag */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-ink">
            {t("posts.filterByTag")}
          </h3>
          {(searchQuery || selectedTags.length > 0) && (
            <button
              onClick={clearFilters}
              className="text-sm text-link hover:underline"
            >
              {t("posts.reset")}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                selectedTags.includes(tag)
                  ? "bg-accent-600 text-white"
                  : "bg-muted text-ink hover:bg-soft"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="mb-4">
        <p className="text-sm text-ink">{resultText}</p>
      </div>

      {/* Filtered results */}
      {filteredPosts.length > 0 ? (
        <div className="grid md:grid-cols-2 gap-6">
          {filteredPosts.map((post) => (
            <BlogCard
              key={post.slug}
              title={post.data.title}
              description={post.data.description}
              pubDate={post.data.pubDate}
              slug={post.slug}
              tags={post.data.tags}
              lang={post.lang ?? lang}
              langBadge={post.langBadge}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <svg
            className="w-16 h-16 mx-auto mb-4 text-ink-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-ink text-lg">{t("posts.noResults")}</p>
          <p className="text-ink-muted text-sm mt-2">
            {t("posts.noResultsHint")}
          </p>
        </div>
      )}
    </div>
  );
}

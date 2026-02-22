import { useState, useMemo } from "react";
import NoteCard from "./NoteCard";

interface Note {
  slug: string;
  data: {
    title: string;
    description?: string;
    pubDate: Date;
    tags: string[];
    language?: string;
  };
}

interface Props {
  notes: Note[];
}

export default function NotesSearchAndFilter({ notes }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    notes.forEach((note) => note.data.tags.forEach((tag) => tagSet.add(tag)));
    return Array.from(tagSet).sort();
  }, [notes]);

  const allLanguages = useMemo(() => {
    const langSet = new Set<string>();
    notes.forEach((note) => {
      if (note.data.language) langSet.add(note.data.language);
    });
    return Array.from(langSet).sort();
  }, [notes]);

  const filteredNotes = useMemo(() => {
    return notes.filter((note) => {
      const normalizedSearch = searchQuery.trim().toLowerCase();

      const matchesSearch =
        searchQuery === "" ||
        note.data.title.toLowerCase().includes(normalizedSearch) ||
        (note.data.description ?? "")
          .toLowerCase()
          .includes(normalizedSearch) ||
        note.data.tags.some((tag) =>
          tag.toLowerCase().includes(normalizedSearch),
        );

      const matchesTags =
        selectedTags.length === 0 ||
        selectedTags.every((tag) => note.data.tags.includes(tag));

      const matchesLanguage =
        selectedLanguage === "" || note.data.language === selectedLanguage;

      return matchesSearch && matchesTags && matchesLanguage;
    });
  }, [notes, searchQuery, selectedTags, selectedLanguage]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedTags([]);
    setSelectedLanguage("");
  };

  const hasActiveFilters =
    searchQuery !== "" || selectedTags.length > 0 || selectedLanguage !== "";

  return (
    <div>
      {/* Search bar */}
      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            placeholder="Search a note..."
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

      {/* Filters row */}
      <div className="mb-8 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Filters</h3>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-link hover:underline"
            >
              Reset
            </button>
          )}
        </div>

        {/* Language filter */}
        {allLanguages.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {allLanguages.map((lang) => (
              <button
                key={lang}
                onClick={() =>
                  setSelectedLanguage(selectedLanguage === lang ? "" : lang)
                }
                className={`px-3 py-1 rounded text-xs font-mono font-medium transition ${
                  selectedLanguage === lang
                    ? "bg-gray-700 dark:bg-gray-200 text-white dark:text-gray-900"
                    : "bg-muted text-ink hover:bg-soft"
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
        )}

        {/* Tag filter */}
        {allTags.length > 0 && (
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
        )}
      </div>

      {/* Result count */}
      <div className="mb-4">
        <p className="text-sm text-ink">
          {filteredNotes.length} note{filteredNotes.length !== 1 ? "s" : ""}{" "}
          found
        </p>
      </div>

      {/* Notes grid */}
      {filteredNotes.length > 0 ? (
        <div className="grid md:grid-cols-2 gap-4">
          {filteredNotes.map((note) => (
            <NoteCard
              key={note.slug}
              title={note.data.title}
              description={note.data.description}
              pubDate={note.data.pubDate}
              slug={note.slug}
              tags={note.data.tags}
              language={note.data.language}
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
          <p className="text-ink text-lg">No notes found</p>
          <p className="text-ink-muted text-sm mt-2">
            Try changing your search criteria
          </p>
        </div>
      )}
    </div>
  );
}

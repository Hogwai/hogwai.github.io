import { useState, useMemo } from "react";
import featuresData from "../data/micronaut-features.json";

interface Feature {
  feature: string;
  type: string;
  description: string;
  details: string;
}

type SortField = "feature" | "type" | "description" | "details";
type SortDirection = "asc" | "desc";

export default function MicronautFeaturesTable() {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>("feature");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [copiedFeature, setCopiedFeature] = useState<string | null>(null);

  const features = featuresData as Feature[];

  // Gather types
  const allTypes = useMemo(() => {
    const typeSet = new Set<string>();
    features.forEach((f) => typeSet.add(f.type));
    return Array.from(typeSet).sort();
  }, [features]);

  // Filter and sort
  const filteredAndSorted = useMemo(() => {
    let result = features;

    // Text
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (f) =>
          f.feature.toLowerCase().includes(query) ||
          f.type.toLowerCase().includes(query) ||
          f.description.toLowerCase().includes(query) ||
          f.details.toLowerCase().includes(query),
      );
    }

    // Type
    if (typeFilter) {
      result = result.filter((f) => f.type === typeFilter);
    }

    // Sort
    result = [...result].sort((a, b) => {
      const aVal = a[sortField].toLowerCase();
      const bVal = b[sortField].toLowerCase();

      if (sortDirection === "asc") {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });

    return result;
  }, [features, searchQuery, typeFilter, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setTypeFilter("");
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedFeature(text);
      setTimeout(() => setCopiedFeature(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return (
        <svg
          className="w-4 h-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
          />
        </svg>
      );
    }

    return sortDirection === "asc" ? (
      <svg
        className="w-4 h-4 text-link"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 15l7-7 7 7"
        />
      </svg>
    ) : (
      <svg
        className="w-4 h-4 text-link"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 9l-7 7-7-7"
        />
      </svg>
    );
  };

  return (
    <div className="my-6 p-4 bg-surface border border-edge rounded-lg">
      <h3 className="text-lg font-bold mb-4 text-ink">🔍 Micronaut Features</h3>

      {/* Search bar / filters */}
      <div className="flex gap-3 mb-4">
        {/* Search bar */}
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search features..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 pl-10 text-sm rounded-lg border border-edge bg-surface text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-link transition"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
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

        {/* Type */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-edge bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-link transition"
        >
          <option value="">All types</option>
          {allTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        {/* Clear button */}
        {(searchQuery || typeFilter) && (
          <button
            onClick={clearFilters}
            className="px-3 py-2 text-sm text-link hover:bg-soft rounded-lg transition whitespace-nowrap"
            title="Clear filters"
          >
            Clear
          </button>
        )}
      </div>

      {/* Counter */}
      <p className="text-xs text-ink mb-2">
        {filteredAndSorted.length} feature
        {filteredAndSorted.length !== 1 ? "s" : ""}
      </p>

      {/* Results */}
      {filteredAndSorted.length === 0 ? (
        <p className="text-sm text-ink-muted text-center py-8">
          No features found
        </p>
      ) : (
        <div className="border border-edge rounded-lg overflow-hidden">
          <div className="max-h-[300px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-edge sticky top-0">
                <tr>
                  <th
                    className="px-3 py-2 text-left text-xs font-semibold text-ink cursor-pointer hover:bg-soft transition"
                    onClick={() => handleSort("feature")}
                  >
                    <div className="flex items-center gap-1">
                      Feature
                      <SortIcon field="feature" />
                    </div>
                  </th>
                  <th
                    className="px-3 py-2 text-left text-xs font-semibold text-ink cursor-pointer hover:bg-soft transition"
                    onClick={() => handleSort("type")}
                  >
                    <div className="flex items-center gap-1">
                      Type
                      <SortIcon field="type" />
                    </div>
                  </th>
                  <th
                    className="px-3 py-2 text-left text-xs font-semibold text-ink cursor-pointer hover:bg-soft transition"
                    onClick={() => handleSort("description")}
                  >
                    <div className="flex items-center gap-1">
                      Description
                      <SortIcon field="description" />
                    </div>
                  </th>
                  <th
                    className="px-3 py-2 text-left text-xs font-semibold text-ink cursor-pointer hover:bg-soft transition"
                    onClick={() => handleSort("details")}
                  >
                    <div className="flex items-center gap-1">
                      Details
                      <SortIcon field="details" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {filteredAndSorted.map((feature, index) => (
                  <tr key={index} className="hover:bg-soft transition">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 group">
                        <code className="text-xs font-mono text-link">
                          {feature.feature}
                        </code>
                        <button
                          onClick={() => copyToClipboard(feature.feature)}
                          className="p-1 text-gray-400 hover:text-link hover:bg-soft rounded transition opacity-0 group-hover:opacity-100"
                          title="Copy feature name"
                        >
                          {copiedFeature === feature.feature ? (
                            <svg
                              className="w-3 h-3 text-green-600 dark:text-green-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="w-3 h-3"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                              />
                            </svg>
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 bg-muted text-ink rounded text-xs">
                        {feature.type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-ink text-xs">
                      {feature.description}
                    </td>
                    <td className="px-3 py-2 text-ink text-xs">
                      {feature.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

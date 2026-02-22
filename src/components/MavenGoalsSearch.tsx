import { useState } from "react";
import goals from "../data/maven-goals.json";

export default function MavenGoalsSearch() {
  const [query, setQuery] = useState("");
  const [expandedGoal, setExpandedGoal] = useState<string | null>(null);
  const [copiedGoal, setCopiedGoal] = useState<string | null>(null);

  const filtered = query.trim()
    ? goals.filter(
        (g) =>
          g.goal.toLowerCase().includes(query.toLowerCase()) ||
          g.phase.toLowerCase().includes(query.toLowerCase()),
      )
    : [];

  const toggleExpand = (goal: string) => {
    setExpandedGoal(expandedGoal === goal ? null : goal);
  };

  const copyToClipboard = async (text: string, goalId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedGoal(goalId);
      setTimeout(() => setCopiedGoal(null), 1000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="p-4 bg-surface border border-edge rounded-lg">
      <h3 className="text-lg font-bold mb-3 text-ink">🔍 Search Maven Goal</h3>

      <div className="relative mb-4">
        <input
          type="text"
          placeholder="Search for a goal..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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

      {query.trim() && (
        <>
          <p className="text-xs text-ink mb-2">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </p>

          {filtered.length === 0 ? (
            <p className="text-sm text-ink-muted text-center py-4">
              No goal found
            </p>
          ) : (
            <div className="border border-edge rounded-lg overflow-hidden">
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted border-b border-edge sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-ink">
                        Goal
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-ink">
                        Phase
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-ink">
                        Description
                      </th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge">
                    {filtered.map((g) => (
                      <>
                        <tr
                          key={g.goal}
                          className="hover:bg-soft cursor-pointer transition"
                          onClick={() => toggleExpand(g.goal)}
                        >
                          <td className="px-3 py-2">
                            <code className="text-xs font-mono text-link">
                              {g.goal}
                            </code>
                          </td>
                          <td className="px-3 py-2">
                            <span className="px-2 py-0.5 bg-muted text-ink rounded text-xs">
                              {g.phase}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-ink text-xs">
                            {g.description.length > 80
                              ? g.description.substring(0, 80) + "..."
                              : g.description}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <svg
                              className={`w-4 h-4 text-gray-400 transition-transform ${
                                expandedGoal === g.goal ? "rotate-180" : ""
                              }`}
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
                          </td>
                        </tr>
                        {expandedGoal === g.goal && (
                          <tr className="bg-muted">
                            <td colSpan={4} className="px-3 py-3">
                              <div className="space-y-2">
                                <div>
                                  <p className="text-xs font-semibold text-ink mb-1">
                                    Full description:
                                  </p>
                                  <p className="text-xs text-ink">
                                    {g.description}
                                  </p>
                                </div>

                                <div>
                                  <p className="text-xs font-semibold text-ink mb-1">
                                    Example:
                                  </p>
                                  <div className="relative group">
                                    <pre className="bg-surface border border-edge p-2 pr-10 rounded text-xs font-mono text-ink overflow-x-auto">
                                      {g.example}
                                    </pre>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        copyToClipboard(g.example, g.goal);
                                      }}
                                      className="absolute top-2 right-2 p-1.5 text-ink-muted hover:text-link hover:bg-soft rounded transition opacity-0 group-hover:opacity-100"
                                      title="Copy to clipboard"
                                    >
                                      {copiedGoal === g.goal ? (
                                        <svg
                                          className="w-4 h-4 text-green-600 dark:text-green-400"
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
                                          className="w-4 h-4"
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
                                </div>

                                <a
                                  href={g.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-link hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Official documentation
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
                                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                    />
                                  </svg>
                                </a>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

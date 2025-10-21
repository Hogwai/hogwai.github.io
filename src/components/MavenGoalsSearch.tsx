import { useState } from "react";
import goals from "../data/maven-goals.json";

export default function MavenGoalsSearch() {
  const [query, setQuery] = useState("");
  const [expandedGoal, setExpandedGoal] = useState<string | null>(null);
  const [copiedGoal, setCopiedGoal] = useState<string | null>(null);
  
  const filtered = query.trim() 
    ? goals.filter(g =>
        g.goal.toLowerCase().includes(query.toLowerCase()) ||
        g.phase.toLowerCase().includes(query.toLowerCase())
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
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
      <h3 className="text-lg font-bold mb-3 text-gray-900 dark:text-gray-100">
        🔍 Search Maven Goal
      </h3>
      
      <div className="relative mb-4">
        <input
          type="text"
          placeholder="Search for a goal..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-3 py-2 pl-10 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition"
        />
        <svg 
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {query.trim() && (
        <>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </p>

          {filtered.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
              No goal found
            </p>
          ) : (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Goal</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Phase</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Description</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {filtered.map((g) => (
                      <>
                        <tr 
                          key={g.goal}
                          className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition"
                          onClick={() => toggleExpand(g.goal)}
                        >
                          <td className="px-3 py-2">
                            <code className="text-xs font-mono text-blue-600 dark:text-blue-400">
                              {g.goal}
                            </code>
                          </td>
                          <td className="px-3 py-2">
                            <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs">
                              {g.phase}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300 text-xs">
                            {g.description.length > 80 
                              ? g.description.substring(0, 80) + '...' 
                              : g.description
                            }
                          </td>
                          <td className="px-3 py-2 text-center">
                            <svg 
                              className={`w-4 h-4 text-gray-400 transition-transform ${
                                expandedGoal === g.goal ? 'rotate-180' : ''
                              }`}
                              fill="none" 
                              stroke="currentColor" 
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </td>
                        </tr>
                        {expandedGoal === g.goal && (
                          <tr className="bg-gray-50 dark:bg-gray-800">
                            <td colSpan={4} className="px-3 py-3">
                              <div className="space-y-2">
                                <div>
                                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                                    Full description:
                                  </p>
                                  <p className="text-xs text-gray-700 dark:text-gray-300">
                                    {g.description}
                                  </p>
                                </div>
                                
                                <div>
                                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                                    Example:
                                  </p>
                                  <div className="relative group">
                                    <pre className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-2 pr-10 rounded text-xs font-mono text-gray-800 dark:text-gray-200 overflow-x-auto">
                                      {g.example}
                                    </pre>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        copyToClipboard(g.example, g.goal);
                                      }}
                                      className="absolute top-2 right-2 p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition opacity-0 group-hover:opacity-100"
                                      title="Copy to clipboard"
                                    >
                                      {copiedGoal === g.goal ? (
                                        <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                      ) : (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                      )}
                                    </button>
                                  </div>
                                </div>
                                
                                <a
                                  href={g.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Official documentation
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
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
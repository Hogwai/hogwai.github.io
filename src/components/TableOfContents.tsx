import { useState, useEffect } from "react";

interface Heading {
  depth: number;
  slug: string;
  text: string;
}

interface Props {
  headings: Heading[];
}

export default function TableOfContents({ headings }: Props) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "-100px 0px -80% 0px" },
    );

    headings.forEach((heading) => {
      const element = document.getElementById(heading.slug);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [headings]);

  const handleClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    slug: string,
  ) => {
    e.preventDefault();
    const element = document.getElementById(slug);
    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });

      history.pushState(null, "", `#${slug}`);
    }
  };

  if (headings.length === 0) return null;

  return (
    <nav className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
          Table of contents
        </h3>
      </div>
      <div className="p-4 max-h-[calc(100vh-12rem)] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700">
        <ul className="space-y-2 text-sm">
          {headings.map((heading) => (
            <li
              key={heading.slug}
              style={{ paddingLeft: `${(heading.depth - 2) * 0.75}rem` }}
            >
              <a
                href={`#${heading.slug}`}
                onClick={(e) => handleClick(e, heading.slug)}
                className={`hover:text-blue-600 dark:hover:text-blue-400 transition block ${
                  activeId === heading.slug
                    ? "text-blue-600 dark:text-blue-400 font-medium"
                    : "text-gray-600 dark:text-gray-400"
                }`}
              >
                {heading.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

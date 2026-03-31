import { useState, useRef, useEffect } from "react";
import { languages, flags, defaultLang, type Lang } from "../i18n/ui";

interface Props {
  lang: Lang;
  currentPath: string;
}

export default function LanguageSwitcher({ lang, currentPath }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  function getPathForLang(targetLang: Lang): string {
    let base = currentPath;
    if (lang !== defaultLang) {
      base = base.replace(/^\/[a-z]{2}(?=\/|$)/, "") || "/";
    }
    if (base !== "/" && base.endsWith("/")) {
      base = base.slice(0, -1);
    }

    if (targetLang === defaultLang) {
      return base === "/" ? "/" : base + "/";
    }
    return base === "/" ? `/${targetLang}/` : `/${targetLang}${base}/`;
  }

  const allLangs = Object.keys(languages) as Lang[];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg bg-muted hover:bg-soft transition text-lg leading-none"
        aria-label="Change language"
        aria-expanded={open}
      >
        {flags[lang]}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 py-1 bg-surface border border-edge rounded-lg shadow-lg z-50 min-w-[140px]">
          {allLangs.map((code) => (
            <a
              key={code}
              href={getPathForLang(code)}
              onClick={() => {
                try {
                  localStorage.setItem("preferred-lang", code);
                } catch {}
              }}
              className={`flex items-center gap-2 px-3 py-2 text-sm transition ${
                code === lang
                  ? "text-link font-medium bg-muted"
                  : "text-ink hover:bg-soft"
              }`}
            >
              <span>{flags[code]}</span>
              <span>{languages[code]}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

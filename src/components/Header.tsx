import { useState } from "react";
import ThemeToggle from "./ThemeToggle";
import LanguageSwitcher from "./LanguageSwitcher";
import { defaultLang, type Lang } from "../i18n/ui";
import { useTranslations, getLocalePath } from "../i18n/utils";

interface Props {
  lang?: Lang;
  currentPath?: string;
}

export default function Header({
  lang = defaultLang,
  currentPath = "/",
}: Props) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const t = useTranslations(lang);
  const prefix = getLocalePath(lang);

  const navItems = [
    { href: `${prefix}/`, label: t("nav.home") },
    { href: `${prefix}/posts`, label: t("nav.posts") },
    { href: `${prefix}/notes`, label: t("nav.notes") },
    { href: `${prefix}/projects`, label: t("nav.projects") },
    { href: `${prefix}/about`, label: t("nav.about") },
  ];

  return (
    <header className="bg-surface border-b border-edge sticky top-0 z-50">
      <nav className="container-custom py-4">
        <div className="flex justify-between items-center">
          <a
            href={`${prefix}/`}
            className="text-2xl font-bold text-link hover:text-link-hover transition"
          >
            Hogwai Tech Blog
          </a>

          <div className="flex items-center gap-4">
            <ul className="hidden md:flex gap-6">
              {navItems.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="text-ink hover:text-ink transition"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>

            <LanguageSwitcher lang={lang} currentPath={currentPath} />
            <ThemeToggle />

            <button
              className="md:hidden text-ink hover:text-ink"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Toggle menu"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {isMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Menu mobile */}
        <ul
          className={`${isMenuOpen ? "flex" : "hidden"} md:hidden flex-col gap-4 mt-4 pt-4 border-t border-edge`}
        >
          {navItems.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className="text-ink hover:text-ink transition"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

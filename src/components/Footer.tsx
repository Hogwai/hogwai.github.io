import { Rss } from "lucide-react";
import { defaultLang, type Lang } from "../i18n/ui";
import { useTranslations, getLocalePath } from "../i18n/utils";

interface Props {
  lang?: Lang;
}

export default function Footer({ lang = defaultLang }: Props) {
  const currentYear = new Date().getFullYear();
  const t = useTranslations(lang);
  const prefix = getLocalePath(lang);

  return (
    <footer className="bg-surface border-t border-edge py-4 mt-auto">
      <div className="container-custom">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-ink">
            © {currentYear}{" "}
            <a href="https://github.com/Hogwai" target="_blank">
              Hogwai
            </a>
            . {t("footer.contentLicense")}{" "}
            <a
              href="https://github.com/Hogwai/hogwai.github.io#licenses"
              target="_blank"
            >
              CC BY 4.0
            </a>
          </p>
          <div className="flex gap-6">
            <a
              href="https://github.com/Hogwai"
              className="text-ink hover:text-ink transition"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.49.5.09.68-.22.68-.48 0-.24-.01-.88-.01-1.73-2.78.6-3.37-1.34-3.37-1.34-.45-1.15-1.11-1.46-1.11-1.46-.91-.62.07-.61.07-.61 1.01.07 1.54 1.04 1.54 1.04.9 1.54 2.36 1.1 2.94.84.09-.65.35-1.1.64-1.35-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.28.1-2.67 0 0 .84-.27 2.75 1.02a9.56 9.56 0 015 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.39.2 2.42.1 2.67.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.86 0 1.34-.01 2.42-.01 2.75 0 .27.18.58.69.48C19.13 20.17 22 16.42 22 12c0-5.52-4.48-10-10-10z" />
              </svg>
            </a>
            <a
              href="https://www.linkedin.com/in/lilian-wernert/"
              className="text-ink hover:text-ink transition"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6z" />
                <rect width="4" height="12" x="2" y="9" />
                <circle cx="4" cy="4" r="2" />
              </svg>
            </a>
            <a
              href={`${prefix}/rss.xml`}
              className="text-ink hover:text-ink transition"
            >
              <Rss />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

import { Github, Linkedin, Rss } from "lucide-react";
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
              <Github />
            </a>
            <a
              href="https://www.linkedin.com/in/lilian-wernert/"
              className="text-ink hover:text-ink transition"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Linkedin />
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

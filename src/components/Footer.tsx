import { Github, Linkedin, Rss } from "lucide-react";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-surface border-t border-edge py-4 mt-auto">
      <div className="container-custom">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-ink">
            © {currentYear}{" "}
            <a href="https://github.com/Hogwai" target="_blank">
              Hogwai
            </a>
            . Content licensed under{" "}
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
            <a href="/rss.xml" className="text-ink hover:text-ink transition">
              <Rss />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

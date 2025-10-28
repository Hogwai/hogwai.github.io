export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 py-4 mt-auto">
      <div className="container-custom">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-gray-600 dark:text-gray-400">
            © {currentYear} <a href="https://github.com/Hogwai">Hogwai</a>.{" "}
            Content licensed under the <a href="/LICENSE">MIT license</a>.{" "}
          </p>
          <div className="flex gap-6">
            <a
              href="https://github.com/Hogwai"
              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            <a
              href="https://www.linkedin.com/in/lilian-wernert/"
              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition"
              target="_blank"
              rel="noopener noreferrer"
            >
              Linkedin
            </a>
            <a
              href="/rss.xml"
              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition"
            >
              RSS
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

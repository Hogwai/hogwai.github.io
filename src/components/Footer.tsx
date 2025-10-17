export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 py-8 mt-auto">
      <div className="container-custom">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-gray-600 dark:text-gray-400">
            © {currentYear} Dev Blog. Tous droits réservés.
          </p>
          <div className="flex gap-6">
            <a href="https://github.com" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <a href="https://twitter.com" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition" target="_blank" rel="noopener noreferrer">
              Twitter
            </a>
            <a href="/tech-blog/rss.xml" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition">
              RSS
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
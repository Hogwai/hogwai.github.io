import { useState } from 'react';
import ThemeToggle from './ThemeToggle';

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-50">
      <nav className="container-custom py-4">
        <div className="flex justify-between items-center">
          <a href="/" className="text-2xl font-bold text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 transition">
            Hogwai Tech Blog
          </a>
          
          <div className="flex items-center gap-4">
            <ul className="hidden md:flex gap-6">
              <li><a href="/" className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition">Home</a></li>
              <li><a href="/posts" className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition">Posts</a></li>
              <li><a href="/about" className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition">About</a></li>
            </ul>
            
            <ThemeToggle />
            
            <button
              className="md:hidden text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Toggle menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
        
        {/* Menu mobile */}
        <ul className={`${isMenuOpen ? 'flex' : 'hidden'} md:hidden flex-col gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-800`}>
          <li><a href="/" className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition">Home</a></li>
          <li><a href="/posts" className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition">Posts</a></li>
          <li><a href="/about" className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition">About</a></li>
        </ul>
      </nav>
    </header>
  );
}
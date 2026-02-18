import getReadingTime from "reading-time";
import { toString } from "mdast-util-to-string";

export function remarkReadingTime() {
  return function (tree, { data }) {
    const textOnPage = toString(tree);
    const readingTime = getReadingTime(textOnPage);
    // Exposes e.g. "5 min read" on remarkPluginFrontmatter.minutesRead
    data.astro.frontmatter.minutesRead = readingTime.text;
  };
}

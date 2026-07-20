import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import type { APIContext } from "astro";
import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";
import { filterByLocale } from "../../i18n/content";
import { getSlugWithoutLang } from "../../i18n/utils";

const md = new MarkdownIt();

export async function GET(context: APIContext) {
  const posts = await getCollection("posts");
  const notes = await getCollection("notes");

  const postItems = filterByLocale(posts, "fr").map((post) => ({
    title: post.data.title,
    description: post.data.description,
    pubDate: post.data.pubDate,
    link: `/fr/posts/${getSlugWithoutLang(post.id)}/`,
    categories: post.data.tags,
    author: "Hogwai",
    content: sanitizeHtml(md.render(post.body || ""), {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat([
        "img",
        "code",
        "pre",
      ]),
    }),
  }));

  const noteItems = filterByLocale(notes, "fr").map((note) => ({
    title: note.data.title,
    description:
      note.data.description ?? `${note.data.title} — Heap of Hogwai.`,
    pubDate: note.data.pubDate,
    link: `/fr/notes/${getSlugWithoutLang(note.id)}/`,
    categories: note.data.tags,
    author: "Hogwai",
    content: sanitizeHtml(md.render(note.body || ""), {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat([
        "img",
        "code",
        "pre",
      ]),
    }),
  }));

  const allItems = [...postItems, ...noteItems].sort(
    (a, b) => b.pubDate.valueOf() - a.pubDate.valueOf(),
  );

  return rss({
    title: "Heap of Hogwai",
    description:
      "Reflexions, tutoriels et articles techniques sur Java (principalement)",
    site: context.site || "https://hogwai.dev/",
    items: allItems,
    customData: `<language>fr</language>`,
  });
}

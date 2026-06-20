import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import type { APIContext } from "astro";
import { getSlugWithoutLang } from "../i18n/utils";

export async function GET(context: APIContext) {
  const posts = await getCollection("posts");
  const notes = await getCollection("notes");

  const postItems = posts
    .filter((post) => !post.data.draft && post.id.startsWith("en/"))
    .map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: `/posts/${getSlugWithoutLang(post.id)}/`,
      categories: post.data.tags,
      author: "Hogwai",
    }));

  const noteItems = notes
    .filter((note) => !note.data.draft && note.id.startsWith("en/"))
    .map((note) => ({
      title: note.data.title,
      description:
        note.data.description ?? `${note.data.title} — Heap of Hogwai.`,
      pubDate: note.data.pubDate,
      link: `/notes/${getSlugWithoutLang(note.id)}/`,
      categories: note.data.tags,
      author: "Hogwai",
    }));

  const allItems = [...postItems, ...noteItems].sort(
    (a, b) => b.pubDate.valueOf() - a.pubDate.valueOf(),
  );

  return rss({
    title: "Heap of Hogwai",
    description: "Thoughts, tutorials and technical posts about Java (mainly)",
    site: context.site || "https://hogwai.github.io/",
    items: allItems,
    customData: `<language>en</language>`,
  });
}

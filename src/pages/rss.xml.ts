import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import type { APIContext } from "astro";

export async function GET(context: APIContext) {
  const posts = await getCollection("posts");
  const notes = await getCollection("notes");

  const postItems = posts
    .filter((post) => !post.data.draft)
    .map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: `/posts/${post.slug}/`,
      categories: post.data.tags,
      author: "Hogwai",
    }));

  const noteItems = notes
    .filter((note) => !note.data.draft)
    .map((note) => ({
      title: note.data.title,
      description:
        note.data.description ?? `${note.data.title} — Hogwai Tech Blog.`,
      pubDate: note.data.pubDate,
      link: `/notes/${note.slug}/`,
      categories: note.data.tags,
      author: "Hogwai",
    }));

  const allItems = [...postItems, ...noteItems].sort(
    (a, b) => b.pubDate.valueOf() - a.pubDate.valueOf(),
  );

  return rss({
    title: "Hogwai Tech Blog",
    description: "Thoughts, tutorials and technical posts about Java (mainly)",
    site: context.site || "https://hogwai.github.io/",
    items: allItems,
    customData: `<language>en</language>`,
  });
}

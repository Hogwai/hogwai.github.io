import { OGImageRoute } from "astro-og-canvas";
import { getCollection } from "astro:content";
import { resolve } from "node:path";

const posts = await getCollection("posts");
const notes = await getCollection("notes");

type PageData = { title: string; description: string };

const pages: Record<string, PageData> = {};

// Content pages — match URL paths
for (const post of posts) {
  const lang = post.id.startsWith("en/") ? "en" : "fr";
  const slug = post.id.slice(3);
  const key = lang === "en" ? `posts/${slug}` : `fr/posts/${slug}`;
  pages[key] = {
    title: post.data.title,
    description: post.data.description,
  };
}

for (const note of notes) {
  const lang = note.id.startsWith("en/") ? "en" : "fr";
  const slug = note.id.slice(3);
  const key = lang === "en" ? `notes/${slug}` : `fr/notes/${slug}`;
  pages[key] = {
    title: note.data.title,
    description: note.data.description ?? "",
  };
}

// Static pages
pages["home"] = {
  title: "Hogwai Tech Blog",
  description:
    "Thoughts, tutorials and technical posts about Java and the JVM ecosystem.",
};
pages["fr/home"] = {
  title: "Hogwai Tech Blog",
  description:
    "Réflexions, tutoriels et articles techniques sur Java et l'écosystème JVM.",
};
pages["posts"] = {
  title: "All posts",
  description:
    "All posts on Hogwai Tech Blog — Java, performance, design patterns and more.",
};
pages["fr/posts"] = {
  title: "Tous les posts",
  description:
    "Tous les posts sur Hogwai Tech Blog — Java, performance, design patterns et plus.",
};
pages["notes"] = {
  title: "Notes",
  description:
    "Quick fixes, snippets and setup tips — short-form technical notes.",
};
pages["fr/notes"] = {
  title: "Notes",
  description: "Notes rapides, snippets et astuces — notes techniques courtes.",
};
pages["about"] = {
  title: "About",
  description:
    "About Lilian — developer with a passion for the Java ecosystem and the author of Hogwai Tech Blog.",
};
pages["fr/about"] = {
  title: "À propos",
  description:
    "À propos de Lilian, développeur passionné par l'écosystème Java et auteur de Hogwai Tech Blog.",
};
pages["tags"] = {
  title: "Tags",
  description: "Browse all tags on Hogwai Tech Blog.",
};
pages["fr/tags"] = {
  title: "Tags",
  description: "Parcourir tous les tags sur Hogwai Tech Blog.",
};
pages["projects"] = {
  title: "Projects",
  description: "Open-source and personal projects built by Lilian.",
};
pages["fr/projects"] = {
  title: "Projets",
  description: "Projets open-source et personnels réalisés par Lilian.",
};

export const { getStaticPaths, GET } = await OGImageRoute({
  param: "route",
  pages,
  getImageOptions: (_path, page) => ({
    title: page.title,
    description: page.description,
    logo: {
      path: resolve(process.cwd(), "public/favicon.png"),
      size: [80, 80],
    },
    font: {
      title: {
        families: ["Inter"],
        weight: "Bold",
        color: [255, 255, 255],
        size: 52,
        lineHeight: 1.1,
      },
      description: {
        families: ["Inter"],
        weight: "Normal",
        color: [164, 174, 188],
        size: 24,
        lineHeight: 1.3,
      },
    },
    bgGradient: [[32, 33, 36]],
    padding: 80,
    fonts: [
      resolve(process.cwd(), "public/fonts/Inter-Regular.ttf"),
      resolve(process.cwd(), "public/fonts/Inter-Bold.ttf"),
    ],
  }),
});

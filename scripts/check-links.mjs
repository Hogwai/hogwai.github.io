import fs from "node:fs";
import path from "node:path";
import markdownLinkCheck from "markdown-link-check";

const CONTENT_DIR = path.resolve("src/content");
const EXTENSIONS = new Set([".md", ".mdx"]);
// Statuses where the check could not conclude (bot blocking, rate limiting).
// Reported as neutral: they do not fail the run.
const NEUTRAL_STATUS_CODES = new Set([403]);

function collectMarkdownFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath));
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function checkFile(file, config) {
  return new Promise((resolve) => {
    const content = fs.readFileSync(file, "utf-8");
    markdownLinkCheck(content, config, (err, results) => {
      resolve({ file, err, results: results ?? [] });
    });
  });
}

const configPath = path.resolve(".markdown-link-check.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
config.aliveStatusCodes = [
  ...new Set([...(config.aliveStatusCodes ?? [200]), ...NEUTRAL_STATUS_CODES]),
];

// Files passed as arguments (CI diff-only mode) or full content scan.
const cliFiles = process.argv.slice(2);
const files =
  cliFiles.length > 0
    ? cliFiles.filter((file) => EXTENSIONS.has(path.extname(file)))
    : collectMarkdownFiles(CONTENT_DIR);
let deadCount = 0;
let neutralCount = 0;

for (const file of files) {
  const { err, results } = await checkFile(file, config);
  if (err) {
    console.error(`FILE: ${file}`);
    console.error(`  ERROR: ${err.message}`);
    deadCount++;
    continue;
  }
  if (results.length === 0) continue;

  console.log(`FILE: ${path.relative(process.cwd(), file)}`);
  for (const result of results) {
    if (result.status === "ignored") {
      // Internal anchors and other patterns from ignorePatterns.
      continue;
    }
    if (result.status === "alive") {
      if (NEUTRAL_STATUS_CODES.has(result.statusCode)) {
        neutralCount++;
        console.log(
          `  [?] ${result.link} -> Status: ${result.statusCode} (check inconclusive, not blocking)`,
        );
      } else {
        console.log(`  [✓] ${result.link}`);
      }
    } else {
      deadCount++;
      const status = result.statusCode ?? result.err?.code ?? "unknown";
      console.log(`  [✖] ${result.link} -> Status: ${status}`);
    }
  }
  console.log();
}

console.log(
  `${files.length} files checked, ${neutralCount} inconclusive link(s), ${deadCount} dead link(s).`,
);
process.exit(deadCount > 0 ? 1 : 0);

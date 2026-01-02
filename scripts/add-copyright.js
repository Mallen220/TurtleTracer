// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import fs from "fs";
import path from "path";

const OWNER = "Matthew Allen";
const CURRENT_YEAR = new Date().getFullYear();

const ONE_LINE_LICENSE = `Licensed under the Apache License, Version 2.0.`;

const EXTENSIONS = {
  ".js": "LINE",
  ".ts": "LINE",
  ".scss": "LINE",
  ".svelte": "HTML",
  ".html": "HTML",
  ".sh": "HASH",
};

const COMMENT_STYLES = {
  LINE: { start: "// ", end: "", prefix: "" },
  BLOCK: { start: "/*", end: "*/", prefix: " * " }, // Kept for reference or removal
  HTML: { start: "<!-- ", end: " -->", prefix: "" },
  HASH: { start: "# ", end: "", prefix: "" },
};

function getHeader(yearRange, styleType) {
  const text = `Copyright ${yearRange} ${OWNER}. ${ONE_LINE_LICENSE}`;

  if (styleType === "LINE") {
    return `// ${text}\n`;
  } else if (styleType === "HTML") {
    return `<!-- ${text} -->\n`;
  } else if (styleType === "HASH") {
    return `# ${text}\n`;
  } else if (styleType === "BLOCK") {
    // Fallback if we ever use it, but we want one line
    return `/* ${text} */\n`;
  }
}

function traverse(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      if (
        file === "node_modules" ||
        file === ".git" ||
        file === "dist" ||
        file === "build" ||
        file === "release" ||
        file === ".jules" ||
        file === ".vscode"
      )
        continue;
      traverse(filePath);
    } else {
      const ext = path.extname(file);
      if (EXTENSIONS[ext]) {
        processFile(filePath, EXTENSIONS[ext]);
      }
    }
  }
}

function processFile(filePath, styleType) {
  const originalContent = fs.readFileSync(filePath, "utf8");
  let content = originalContent;

  // Regex to detect existing copyright info to preserve years
  const copyrightRegex = /Copyright (\d{4})(?:-(\d{4}))? (.*?)(?:\.|,|\n)/i;
  const match = content.match(copyrightRegex);

  let startYear = CURRENT_YEAR;
  let endYear = CURRENT_YEAR;

  if (match) {
    startYear = parseInt(match[1]);
    if (match[2]) {
      endYear = parseInt(match[2]);
    }
    if (endYear < CURRENT_YEAR) {
      endYear = CURRENT_YEAR;
    }
  }

  const yearRange =
    startYear === endYear ? `${startYear}` : `${startYear}-${endYear}`;
  const newHeader = getHeader(yearRange, styleType);

  const lines = content.split("\n");
  let shebang = "";
  let bodyLines = lines;

  if (lines.length > 0 && lines[0].startsWith("#!")) {
    shebang = lines[0] + "\n";
    bodyLines = lines.slice(1);
  }

  let body = bodyLines.join("\n");

  // Logic to remove existing headers (both multi-line and single-line variants)

  // 1. Remove Multi-line Block Comments (/* ... */)
  // Matches start of block comment, content including "Copyright" and "Matthew Allen", end of block comment.
  const multiLineBlockRegex =
    /^\s*\/\*[\s\S]*?Copyright[\s\S]*?Matthew Allen[\s\S]*?\*\/\s*/;
  if (multiLineBlockRegex.test(body)) {
    body = body.replace(multiLineBlockRegex, "");
  }

  // 2. Remove HTML Comments (<!-- ... -->)
  // Matches start, content, end.
  const htmlCommentRegex =
    /^\s*<!--[\s\S]*?Copyright[\s\S]*?Matthew Allen[\s\S]*?-->\s*/;
  if (htmlCommentRegex.test(body)) {
    body = body.replace(htmlCommentRegex, "");
  }

  // 3. Remove Hash Comments (# ...)
  // This is tricky because it might match code. We only look at the top.
  // Matches a block of lines starting with #, containing Copyright and Matthew Allen.
  const hashBlockRegex = /^(\s*#[^\n]*\n)+/;
  const m = body.match(hashBlockRegex);
  if (m && m[0].includes("Copyright") && m[0].includes("Matthew Allen")) {
    body = body.substring(m[0].length);
  }

  // 4. Remove Single Line Comments (// ...) if present (e.g. if re-running this script)
  // Matches lines starting with // containing Copyright and Matthew Allen at the very top.
  const lineCommentRegex = /^\s*\/\/.*?Copyright.*?Matthew Allen.*?\n/;
  if (lineCommentRegex.test(body)) {
    body = body.replace(lineCommentRegex, "");
  }

  // Trim leading newlines from body to avoid gaps
  body = body.replace(/^\n+/, "");

  const finalContent = shebang + newHeader + body;

  if (finalContent !== originalContent) {
    fs.writeFileSync(filePath, finalContent);
    console.log(`Updated ${filePath}`);
  }
}

traverse(".");

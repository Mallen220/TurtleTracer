
import MarkdownIt from 'markdown-it';
import fs from 'fs';
import path from 'path';

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
});

const inputPath = path.resolve('src/lib/components/whats-new/pages/simulation.md');
const outputPath = path.resolve('verification/page_content.html');

try {
  const content = fs.readFileSync(inputPath, 'utf8');
  const result = md.render(content);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Markdown Preview</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    h1, h2, h3 { border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
    ul { padding-left: 20px; }
    code { background-color: #f6f8fa; padding: 0.2em 0.4em; border-radius: 3px; font-family: monospace; }
    strong { font-weight: 600; }
  </style>
</head>
<body>
  ${result}
</body>
</html>
  `;

  fs.writeFileSync(outputPath, html);
  console.log('HTML generated at', outputPath);
} catch (e) {
  console.error('Error:', e);
  process.exit(1);
}

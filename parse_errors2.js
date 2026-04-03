const fs = require('fs');
const lines = fs.readFileSync('svelte_check_2.log', 'utf8').split('\n');
const errors = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('Error:') || lines[i].includes('error TS') || lines[i].match(/^\s*src\/.*:\d+:\d+/)) {
    if (lines[i].includes('node_modules')) continue;
    errors.push(lines[i-1]);
    errors.push(lines[i]);
    errors.push('---');
  }
}
fs.writeFileSync('parsed_errors2.txt', errors.join('\n'));

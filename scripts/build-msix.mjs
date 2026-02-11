import { packageMSIX } from 'electron-windows-msix';
import fs from 'fs';

const configPath = process.env.CONFIG_PATH || './msix-config.json';
let raw = fs.readFileSync(configPath, 'utf8');
// Strip UTF-8 BOM if present
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
const config = JSON.parse(raw);

console.log('MSIX config manifest packageIdentity:', config.manifestVariables?.packageIdentity);
console.log('MSIX config manifest publisher:', config.manifestVariables?.publisher);

try {
  await packageMSIX(config);
  console.log('MSIX created successfully.');
} catch (e) {
  console.error('MSIX packaging failed:');
  console.error(e);
  process.exit(1);
}

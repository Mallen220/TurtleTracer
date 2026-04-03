const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

pkg.overrides = pkg.overrides || {};
pkg.overrides['svelte'] = pkg.devDependencies['svelte'] || pkg.dependencies['svelte'] || '^5.55.1';

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));

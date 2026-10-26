// Copies Font Awesome Free (core + solid + regular) into src/styles/vendor, woff2 only.
// Run with: npm run vendor:fa (only needed when upgrading Font Awesome)
import { readFileSync, writeFileSync } from 'node:fs';
const base = new URL('../node_modules/@fortawesome/fontawesome-free/', import.meta.url);
const read = (p) => readFileSync(new URL(p, base), 'utf8');
let css = ['css/fontawesome.min.css', 'css/solid.min.css', 'css/regular.min.css'].map(read).join('\n');
css = css.replace(/,\s*url\(\.\.\/webfonts\/[^)]+\.ttf\) format\("truetype"\)/g, '')
         .replace(/url\(\.\.\/webfonts\//g, 'url(@fortawesome/fontawesome-free/webfonts/');
writeFileSync(new URL('../src/styles/vendor/fontawesome.css', import.meta.url), '/* Font Awesome Free 6.4.0 — icons CC BY 4.0, fonts OFL 1.1, code MIT. woff2 only. */\n' + css);
console.log('fontawesome.css written', css.length);

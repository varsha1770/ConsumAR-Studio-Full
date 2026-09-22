const fs = require('fs');
const path = require('path');

const filesToPatch = [
  path.join(__dirname, 'node_modules', 'draco3d', 'draco_decoder_nodejs.js'),
  path.join(__dirname, 'node_modules', 'draco3d', 'draco_encoder_nodejs.js')
];

for (const file of filesToPatch) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    // Replace require('fs') and require('path') with empty objects to prevent Turbopack errors
    content = content.replace(/require\("fs"\)/g, "{}");
    content = content.replace(/require\('fs'\)/g, "{}");
    content = content.replace(/require\("path"\)/g, "{}");
    content = content.replace(/require\('path'\)/g, "{}");
    fs.writeFileSync(file, content);
    console.log(`Patched ${file} for Turbopack compatibility`);
  }
}

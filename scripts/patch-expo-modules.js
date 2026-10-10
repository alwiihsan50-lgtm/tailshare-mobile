const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      results.push(file);
    }
  });
  return results;
}

const targetDirs = [
  path.join(__dirname, '..', 'node_modules', 'expo-modules-jsi'),
  path.join(__dirname, '..', 'node_modules', '@expo', 'expo-modules-macros-plugin')
];

targetDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    const files = walk(dir);
    files.forEach(f => {
      if (f.endsWith('.swift') || f.endsWith('.h') || f.endsWith('.cpp')) {
        let content = fs.readFileSync(f, 'utf8');
        let changed = false;

        // Fix Swift tools version 6.2 -> 6.0
        if (content.includes('swift-tools-version: 6.2')) {
          content = content.replace(/swift-tools-version:\s*6\.2/g, 'swift-tools-version: 6.0');
          changed = true;
        }

        // Fix weak let and Sendable mutable properties with nonisolated(unsafe) weak var
        if (content.includes('weak let runtime') || content.includes('weak var runtime')) {
          content = content.replace(/(nonisolated\(unsafe\)\s+)?(private|internal)?\s*weak\s+(let|var)\s+runtime/g, (match, prefix, visibility) => {
            const vis = visibility ? visibility + ' ' : '';
            return `nonisolated(unsafe) ${vis}weak var runtime`;
          });
          changed = true;
        }

        // Any other weak let
        if (content.includes('weak let')) {
          content = content.replace(/\bweak\s+let\b/g, 'nonisolated(unsafe) weak var');
          changed = true;
        }

        // Fix C++ constructor return attribute
        if (content.includes('SWIFT_RETURNS_RETAINED RuntimeScheduler(')) {
          content = content.replace(/SWIFT_RETURNS_RETAINED\s+RuntimeScheduler\(/g, 'RuntimeScheduler(');
          changed = true;
        }

        // Fix trailing commas before closing parentheses
        if (content.match(/,\s*\)/)) {
          content = content.replace(/,\s*\)/g, ')');
          changed = true;
        }

        if (changed) {
          fs.writeFileSync(f, content, 'utf8');
          console.log('[patch] Fixed compatibility in:', path.basename(f));
        }
      }
    });
  }
});

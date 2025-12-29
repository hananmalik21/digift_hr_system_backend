/**
 * Script to update error handling in all models
 * This script helps identify files that need DatabaseError imports and updates
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const modelsDir = path.join(__dirname, '../feature');

function findModelFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'model') {
        const modelFiles = fs.readdirSync(fullPath)
          .filter(f => f.endsWith('Model.js') || f.endsWith('_model.js'))
          .map(f => path.join(fullPath, f));
        files.push(...modelFiles);
      } else {
        files.push(...findModelFiles(fullPath));
      }
    }
  }
  
  return files;
}

const modelFiles = findModelFiles(modelsDir);
console.log('Model files found:', modelFiles.length);
modelFiles.forEach(f => console.log('  -', f.replace(__dirname + '/../', '')));


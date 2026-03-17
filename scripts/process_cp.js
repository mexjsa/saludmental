import fs from 'fs';
import path from 'path';

const INPUT_PATH = 'C:\\Users\\Juan\\Dropbox\\Proyectos 2026\\CONASAMA CHATBOT\\CPdescarga.txt';
const OUTPUT_DIR = './public/api/cp';

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log("Reading file...");
const data = fs.readFileSync(INPUT_PATH, 'utf8');
const lines = data.split('\n');

const cpMap = {};

console.log("Parsing lines...");
// Skip first 2 lines (header)
for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split('|');
    if (parts.length < 15) continue;

    const cp = parts[0];
    const colonia = parts[1];
    const municipio = parts[3];
    const estado = parts[4];

    if (!cpMap[cp]) {
        cpMap[cp] = {
            cp: cp,
            estado: estado,
            municipio: municipio,
            colonias: []
        };
    }
    cpMap[cp].colonias.push(colonia);
}

console.log("Grouping by prefix (first 3 digits)...");
const prefixes = {};
Object.values(cpMap).forEach(item => {
    const prefix = item.cp.substring(0, 3);
    if (!prefixes[prefix]) prefixes[prefix] = {};
    prefixes[prefix][item.cp] = item;
});

console.log("Writing JSON files...");
Object.entries(prefixes).forEach(([prefix, data]) => {
    fs.writeFileSync(path.join(OUTPUT_DIR, `${prefix}.json`), JSON.stringify(data));
});

console.log("Done! Processed", Object.keys(cpMap).length, "unique postal codes.");

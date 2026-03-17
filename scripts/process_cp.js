import fs from 'fs';
import path from 'path';

const SEPOMEX_PATH = 'C:\\Users\\Juan\\Dropbox\\Proyectos 2026\\CONASAMA CHATBOT\\CPdescarga.txt';
const COORDS_PATH = 'C:\\Users\\Juan\\Dropbox\\Proyectos 2026\\CONASAMA CHATBOT\\cp lat long.txt';
const OUTPUT_DIR = './public/api/cp';

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log("Reading coordinates file...");
const coordsData = fs.readFileSync(COORDS_PATH, 'latin1');
const coordsLines = coordsData.split('\n');
const coordsMap = {};

coordsLines.forEach(line => {
    const parts = line.split('|');
    if (parts.length >= 6) {
        const cp = parts[0].trim();
        const lat = parseFloat(parts[4]);
        const lon = parseFloat(parts[5]);
        if (!isNaN(lat) && !isNaN(lon)) {
            coordsMap[cp] = { lat, lon };
        }
    }
});

console.log("Reading SEPOMEX file...");
const data = fs.readFileSync(SEPOMEX_PATH, 'latin1');
const lines = data.split('\n');

const cpMap = {};

console.log("Parsing lines...");
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
            colonias: [],
            coords: coordsMap[cp] || null
        };
    }
    cpMap[cp].colonias.push(colonia);
}

console.log("Grouping by prefix...");
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

console.log("Done! Processed", Object.keys(cpMap).length, "postal codes with coordinates.");

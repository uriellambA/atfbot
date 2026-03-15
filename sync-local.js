// sync-local.js — Correr ANTES de editar desde VS Code
// Descarga todos los JSONs desde GitHub para tener los datos más recientes
//
// Uso: node sync-local.js
// ───────────────────────────────────────────────────────────────────────────
 
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
 
const GITHUB_TOKEN  = process.env.GITHUB_TOKEN;
const GITHUB_REPO   = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
 
const FILES = [
    'players_data.json',
    'verify.json',
    'mensajes.json',
    'sanciones.json',
    'fixtures.json',
    'predicciones.json',
    'resultado.json',
    'status.json',
    'predicciones_sent.json',
];
 
async function downloadFile(filename) {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filename}?ref=${GITHUB_BRANCH}`;
 
    const res = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        }
    });
 
    if (res.status === 404) {
        console.log(`  ⚠️  ${filename} — no existe en GitHub todavía, se omite`);
        return;
    }
 
    if (!res.ok) {
        console.warn(`  ❌ ${filename} — error HTTP ${res.status}`);
        return;
    }
 
    const data    = await res.json();
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
 
    // Validar JSON antes de escribir
    try { JSON.parse(content); } catch (e) {
        console.warn(`  ❌ ${filename} — JSON inválido, se omite`);
        return;
    }
 
    fs.writeFileSync(path.join(__dirname, filename), content, 'utf-8');
    console.log(`  ✅ ${filename} — actualizado`);
}
 
async function main() {
    if (!GITHUB_TOKEN || !GITHUB_REPO) {
        console.error('❌ Falta GITHUB_TOKEN o GITHUB_REPO en el .env');
        process.exit(1);
    }
 
    console.log(`\n🔄 Sincronizando datos desde GitHub (${GITHUB_REPO})...\n`);
 
    for (const file of FILES) {
        await downloadFile(file);
    }
 
    console.log('\n✅ Sincronización completa. Ya podés editar desde VS Code.\n');
}
 
main();
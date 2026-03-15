// ═══════════════════════════════════════════════════════════════════════════════
// github-sync.js - Sincronización automática de archivos JSON con GitHub
//
// Requiere en .env:
//   GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
//   GITHUB_REPO=usuario/nombre-repo        (ej: ATFBot/atf-data)
//   GITHUB_BRANCH=main                     (opcional, default: main)
// ═══════════════════════════════════════════════════════════════════════════════
 
require('dotenv').config();
const fs = require('fs');
const path = require('path');
 
const GITHUB_TOKEN  = process.env.GITHUB_TOKEN;
const GITHUB_REPO   = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
 
// Cola de sincronización para evitar race conditions
const syncQueue = new Map(); // filename -> timeout
 
/**
 * Sincroniza un archivo JSON local con GitHub.
 * Llama con debounce de 3 segundos para no saturar la API.
 * @param {string} filePath  Ruta absoluta al archivo local
 * @param {string} [commitMsg] Mensaje de commit (opcional)
 */
function scheduleGitHubSync(filePath, commitMsg) {
    if (!GITHUB_TOKEN || !GITHUB_REPO) {
        // No configurado → silencioso (no rompe nada)
        return;
    }
 
    const filename = path.basename(filePath);
 
    // Cancelar sync pendiente del mismo archivo
    if (syncQueue.has(filename)) {
        clearTimeout(syncQueue.get(filename));
    }
 
    // Programar sync con debounce de 3 segundos
    const timer = setTimeout(() => {
        syncQueue.delete(filename);
        _pushToGitHub(filePath, commitMsg || `[bot] Update ${filename}`).catch(e => {
            console.error(`[GITHUB-SYNC] Error sincronizando ${filename}:`, e.message);
        });
    }, 3000);
 
    syncQueue.set(filename, timer);
}
 
/**
 * Sube el archivo a GitHub (crea o actualiza el blob).
 */
async function _pushToGitHub(filePath, message) {
    const filename = path.basename(filePath);
 
    if (!fs.existsSync(filePath)) {
        console.warn(`[GITHUB-SYNC] Archivo no existe: ${filePath}`);
        return;
    }
 
    const content = fs.readFileSync(filePath, 'utf-8');
    const contentB64 = Buffer.from(content, 'utf-8').toString('base64');
 
    const apiBase = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filename}`;
    const headers = {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    };
 
    // Obtener SHA del archivo actual (necesario para actualizar)
    let sha = null;
    try {
        const getRes = await fetch(`${apiBase}?ref=${GITHUB_BRANCH}`, { headers });
        if (getRes.ok) {
            const getData = await getRes.json();
            sha = getData.sha;
        }
    } catch (e) {
        // Archivo nuevo, sha = null está bien
    }
 
    const body = {
        message,
        content: contentB64,
        branch: GITHUB_BRANCH,
        ...(sha ? { sha } : {})
    };
 
    const putRes = await fetch(apiBase, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body)
    });
 
    if (!putRes.ok) {
        const errData = await putRes.json().catch(() => ({}));
        throw new Error(`HTTP ${putRes.status}: ${errData.message || 'Unknown error'}`);
    }
 
    console.log(`[GITHUB-SYNC] ✅ ${filename} sincronizado con GitHub`);
}
 
module.exports = { scheduleGitHubSync };
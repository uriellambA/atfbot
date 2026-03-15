// ═══════════════════════════════════════════════════════════════════════════════
// verify-api.js — Servidor HTTP integrado en el mismo PORT que Railway expone
//
// IMPORTANTE: ya no usar PORT_API. Railway solo expone un puerto (PORT).
//
// En .env de Railway:
//   VERIFY_API_SECRET=tu_secreto
//   (eliminar PORT_API si existe)
// ═══════════════════════════════════════════════════════════════════════════════
 
require('dotenv').config();
const http = require('http');
const fs   = require('fs');
const path = require('path');
 
const PORT        = process.env.PORT || 3000;
const API_SECRET  = process.env.VERIFY_API_SECRET;
const VERIFY_FILE = path.join(__dirname, 'verify.json');
 
if (!API_SECRET) {
    console.error('[API] ❌ VERIFY_API_SECRET no está definido en .env');
    process.exit(1);
}
 
function loadVerify() {
    if (fs.existsSync(VERIFY_FILE)) {
        try { return JSON.parse(fs.readFileSync(VERIFY_FILE, 'utf-8')); } catch (e) {}
    }
    return { config: null, codes: {}, links: {} };
}
 
function saveVerify(data) {
    fs.writeFileSync(VERIFY_FILE, JSON.stringify(data, null, 4), 'utf-8');
}
 
const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
 
    const urlPath = req.url.replace(/\/+$/, '');
 
    // Health check para Railway
    if (req.method === 'GET' && (urlPath === '' || urlPath === '/health')) {
        res.writeHead(200);
        return res.end(JSON.stringify({ status: 'ok', service: 'ATF Bot' }));
    }
 
    if (req.method !== 'POST' || urlPath !== '/verify') {
        res.writeHead(404);
        return res.end(JSON.stringify({ error: 'Not found' }));
    }
 
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', async () => {
        let data;
        try {
            data = JSON.parse(body);
        } catch {
            res.writeHead(400);
            return res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
 
        const { secret, code, roblox_user, roblox_id } = data;
 
        if (!secret || secret !== API_SECRET) {
            res.writeHead(401);
            return res.end(JSON.stringify({ error: 'Unauthorized' }));
        }
 
        if (!code || !roblox_user || !roblox_id) {
            res.writeHead(400);
            return res.end(JSON.stringify({ error: 'Faltan campos: code, roblox_user, roblox_id' }));
        }
 
        console.log(`[API] Verificación recibida: código=${code}, roblox=${roblox_user}`);
 
        const verifyData = loadVerify();
        const entry = verifyData.codes[code];
 
        if (!entry) {
            res.writeHead(404);
            return res.end(JSON.stringify({ success: false, error: 'Código inválido' }));
        }
 
        if (entry.expires < Date.now()) {
            delete verifyData.codes[code];
            saveVerify(verifyData);
            res.writeHead(410);
            return res.end(JSON.stringify({ success: false, error: 'Código expirado' }));
        }
 
        if (global._verifyBot) {
            try {
                const result = await global._verifyBot.processVerification({ code, roblox_user, roblox_id });
                res.writeHead(200);
                return res.end(JSON.stringify(result));
            } catch (e) {
                console.error('[API] Error en processVerification:', e);
                res.writeHead(500);
                return res.end(JSON.stringify({ success: false, error: e.message }));
            }
        }
 
        res.writeHead(503);
        res.end(JSON.stringify({ success: false, error: 'Bot no listo todavía' }));
    });
});
 
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[API] ✅ Servidor HTTP corriendo en puerto ${PORT}`);
    console.log(`[API] Endpoint: POST https://atfbot-production.up.railway.app/verify`);
});
 
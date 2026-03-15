// ═══════════════════════════════════════════════════════════════════════════════
// verify-api.js - Servidor API para recibir verificaciones desde Roblox
//
// Correr con: node verify-api.js
// Puerto por defecto: 3001
//
// Requiere en .env:
//   VERIFY_API_SECRET=tu_secreto_largo_aqui
//   DISCORD_TOKEN=tu_token_discord (mismo que usa bot.js)
//   PORT=3001 (opcional)
// ═══════════════════════════════════════════════════════════════════════════════

require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT_API || 3001;
const API_SECRET = process.env.VERIFY_API_SECRET;
const VERIFY_FILE = path.join(__dirname, 'verify.json');

if (!API_SECRET) {
    console.error('[API] ❌ VERIFY_API_SECRET no está definido en .env');
    process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Funciones de DB (mismas que en bot.js, duplicadas para independencia)
// ─────────────────────────────────────────────────────────────────────────────
function loadVerify() {
    if (fs.existsSync(VERIFY_FILE)) {
        try { return JSON.parse(fs.readFileSync(VERIFY_FILE, 'utf-8')); } catch (e) {}
    }
    return { config: null, codes: {}, links: {} };
}

function saveVerify(data) {
    fs.writeFileSync(VERIFY_FILE, JSON.stringify(data, null, 4), 'utf-8');
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Server
// ─────────────────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');

    // Solo POST /verify
    if (req.method !== 'POST' || req.url !== '/verify') {
        res.writeHead(404);
        return res.end(JSON.stringify({ error: 'Not found' }));
    }

    // Leer body
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

        // Validar secret
        if (!secret || secret !== API_SECRET) {
            res.writeHead(401);
            return res.end(JSON.stringify({ error: 'Unauthorized' }));
        }

        // Validar campos
        if (!code || !roblox_user || !roblox_id) {
            res.writeHead(400);
            return res.end(JSON.stringify({ error: 'Faltan campos: code, roblox_user, roblox_id' }));
        }

        console.log(`[API] Solicitud de verificación: código=${code}, usuario_roblox=${roblox_user}`);

        // Validar código en DB
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

        const discordId = entry.discord_id;

        // Guardar vinculación en DB
        verifyData.links[discordId] = {
            roblox_user,
            roblox_id,
            verified_at: Date.now()
        };
        delete verifyData.codes[code];
        saveVerify(verifyData);

        // Notificar al bot (si está corriendo en el mismo proceso con global._verifyBot)
        if (global._verifyBot) {
            const result = await global._verifyBot.processVerification({ code, roblox_user, roblox_id });
            res.writeHead(200);
            return res.end(JSON.stringify(result));
        }

        // Si el bot corre separado: hacer POST al bot-notifier endpoint (ver abajo)
        // O simplemente responder OK y el bot detectará el cambio en verify.json
        // Aquí usamos un webhook interno al bot si está disponible
        try {
            await notifyBot(discordId, roblox_user, roblox_id, verifyData.config);
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, message: 'Verificación procesada', discord_id: discordId }));
        } catch (e) {
            console.error('[API] Error notificando al bot:', e);
            res.writeHead(200); // igual guardamos en DB, bot lo detectará
            res.end(JSON.stringify({ success: true, message: 'Guardado en DB, bot procesará al reiniciar' }));
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Notificar al bot via Discord REST API directamente
// ─────────────────────────────────────────────────────────────────────────────
async function notifyBot(discordId, roblox_user, roblox_id, config) {
    // Si el bot corre en el mismo proceso (lo hace porque bot.js hace require('./verify-api.js'))
    if (global._verifyBot) {
        // Pasar _discordId para que processVerification omita la validación de código
        return global._verifyBot.processVerification({
            code: null,
            roblox_user,
            roblox_id,
            _discordId: discordId
        });
    }
 
    // Fallback: cliente temporal (solo si el bot corre en proceso separado)
    const { Client, GatewayIntentBits } = require('discord.js');
    const tempClient = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
 
    await tempClient.login(process.env.DISCORD_TOKEN);
    await new Promise(r => tempClient.once('ready', r));
 
    try {
        const APPEALS_GUILD_ID = process.env.APPEALS_GUILD_ID || '1477484621666189405';
        const guild = tempClient.guilds.cache.filter(g => g.id !== APPEALS_GUILD_ID).first()
                   || tempClient.guilds.cache.first();
        if (!guild) throw new Error('No guild found');
 
        const member = await guild.members.fetch(discordId);
 
        // Nickname
        try {
            let displayName = roblox_user;
            try {
                const res = await fetch(`https://users.roblox.com/v1/users/${roblox_id}`);
                const json = await res.json();
                if (json.displayName) displayName = json.displayName;
            } catch (e) {
                console.warn('[API] No se pudo obtener displayName de Roblox:', e.message);
            }
            await member.setNickname(`${displayName} (@${roblox_user})`);
        } catch (e) {
            console.warn('[API] No se pudo cambiar nickname:', e.message);
        }
 
        // Rol
        const roleId = config?.roleId;
        if (roleId) {
            try { await member.roles.add(roleId); } catch (e) {
                console.warn('[API] No se pudo asignar rol:', e.message);
            }
        }
 
        // DM
        try {
            await member.user.send(
                `✅ **¡Verificación completada!**\n` +
                `Tu cuenta de Roblox **${roblox_user}** ha sido vinculada.\n` +
                `Se te asignó el nickname y rol correspondiente.`
            );
        } catch (e) {}
 
        console.log(`[API] ✅ Discord ${discordId} verificado como ${roblox_user}`);
    } finally {
        tempClient.destroy();
    }
}

server.listen(PORT, () => {
    console.log(`[API] ✅ Servidor de verificación corriendo en puerto ${PORT}`);
    console.log(`[API] Endpoint: POST http://localhost:${PORT}/verify`);
    console.log(`[API] Body esperado: { secret, code, roblox_user, roblox_id }`);
});

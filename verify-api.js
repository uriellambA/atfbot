require('dotenv').config();
const http = require('http');
const fs   = require('fs');
const path = require('path');
 
const PORT       = process.env.PORT_API || 3001;
const API_SECRET = process.env.VERIFY_API_SECRET;
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
 
    // Normalizar URL (acepta /verify y /verify/)
    const urlPath = req.url.replace(/\/+$/, '');
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
 
        console.log(`[API] Solicitud de verificación: código=${code}, usuario_roblox=${roblox_user}`);
 
        // Validar código
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
 
        // Si el bot corre en el mismo proceso, delegarle todo (él borra el código y guarda)
        if (global._verifyBot) {
            try {
                const result = await global._verifyBot.processVerification({ code, roblox_user, roblox_id });
                res.writeHead(200);
                return res.end(JSON.stringify(result));
            } catch (e) {
                console.error('[API] Error llamando processVerification:', e);
                res.writeHead(500);
                return res.end(JSON.stringify({ success: false, error: e.message }));
            }
        }
 
        // Fallback: guardar en DB directamente y aplicar roles con cliente temporal
        verifyData.links[discordId] = { roblox_user, roblox_id, verified_at: Date.now() };
        delete verifyData.codes[code];
        saveVerify(verifyData);
 
        try {
            await applyDiscordRoles(discordId, roblox_user, roblox_id, verifyData.config);
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, discord_id: discordId }));
        } catch (e) {
            console.error('[API] Error aplicando roles:', e);
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, message: 'Guardado en DB, roles no aplicados' }));
        }
    });
});
 
async function applyDiscordRoles(discordId, roblox_user, roblox_id, config) {
    const { Client, GatewayIntentBits } = require('discord.js');
    const tempClient = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
    await tempClient.login(process.env.DISCORD_TOKEN);
    await new Promise(r => tempClient.once('ready', r));
    try {
        const APPEALS_ID = process.env.APPEALS_GUILD_ID || '1477484621666189405';
        const guild = tempClient.guilds.cache.filter(g => g.id !== APPEALS_ID).first()
                   || tempClient.guilds.cache.first();
        if (!guild) throw new Error('No guild found');
        const member = await guild.members.fetch(discordId);
        try {
            let displayName = roblox_user;
            try {
                const r = await fetch(`https://users.roblox.com/v1/users/${roblox_id}`);
                const j = await r.json();
                if (j.displayName) displayName = j.displayName;
            } catch (e) {}
            await member.setNickname(`${displayName} (@${roblox_user})`);
        } catch (e) { console.warn('[API] No se pudo cambiar nickname:', e.message); }
        const roleId = config?.roleId;
        if (roleId) {
            try { await member.roles.add(roleId); } catch (e) { console.warn('[API] No se pudo asignar rol:', e.message); }
        }
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
    console.log(`[API] ✅ Servidor corriendo en puerto ${PORT}`);
    console.log(`[API] Endpoint: POST http://localhost:${PORT}/verify`);
});
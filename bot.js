const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
require('./verify-api.js');

// Configuración del bot
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

// Archivo de base de datos
const DATABASE_FILE = 'players_data.json';
const DB_FILE = path.join(__dirname, 'sanciones.json');

function loadDatabase() {
    if (fs.existsSync(DATABASE_FILE)) {
        try {
            const data = fs.readFileSync(DATABASE_FILE, 'utf-8');
            const parsed = JSON.parse(data);
            if (!parsed.sanctions) parsed.sanctions = {};
            if (!parsed.sanctionCounter) parsed.sanctionCounter = 0;
            console.log('[DB] Base de datos cargada correctamente');
            return parsed;
        } catch (error) {
            console.error('[DB] Error al leer:', error);
            return {
                players: {},
                teams: {},
                squadsheet_messages: {},
                sanctions: {},
                sanctionCounter: 0
            };
        }
    }
    return {
        players: {},
        teams: {},
        squadsheet_messages: {},
        sanctions: {},
        sanctionCounter: 0
    };
}

function saveDatabase(data) {
    fs.writeFileSync(DATABASE_FILE, JSON.stringify(data, null, 4), 'utf-8');
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULTADOS FILE
// ─────────────────────────────────────────────────────────────────────────────
const RESULTADOS_FILE = path.join(__dirname, 'resultado.json');

function loadResultados() {
    if (fs.existsSync(RESULTADOS_FILE)) {
        try { return JSON.parse(fs.readFileSync(RESULTADOS_FILE, 'utf-8')); } catch (e) {}
    }
    return { partidos: [] };
}

function saveResultado(session) {
    const data = loadResultados();
    const partido = {
        id: `partido_${Date.now()}`,
        timestamp: Date.now(),
        competicion: session.competicion,
        serie: session.serie,
        equipoLocal: session.equipoLocal,
        equipoVisitante: session.equipoVisitante,
        estadio: session.estadio || null,
        marcador: {
            local: session.golesLocal,
            visitante: session.golesVisitante
        },
        fft: session.fft || false,
        equipoFFT: session.equipoFFT || null,
        goles: (session.goles || []).map(g => ({
            jugadorId: g.jugadorId,
            asistenciaId: g.asistenciaId || null,
            minuto: g.minuto,
            equipo: g.equipo,
            tipo: g.tipo,
            marcador: g.marcador
        })),
        sanciones: (session.sanciones || []).map(s => ({
            jugadorId: s.jugadorId,
            equipo: s.equipo,
            tarjeta: s.tarjeta,
            razon: s.razon
        })),
        mvp: session.mvp ? { jugadorId: session.mvp.jugadorId, equipo: session.mvp.equipo } : null,
        menciones: (session.menciones || []).map(m => ({
            jugadorId: m.jugadorId,
            equipo: m.equipo
        }))
    };
    data.partidos.push(partido);
    fs.writeFileSync(RESULTADOS_FILE, JSON.stringify(data, null, 4), 'utf-8');
    console.log(`[RESULTADOS] Partido guardado: ${session.equipoLocal} ${session.golesLocal}-${session.golesVisitante} ${session.equipoVisitante}`);
    return partido;
}

function getGoleadoresTable() {
    const data = loadResultados();
    const tabla = {};
    for (const partido of data.partidos) {
        for (const gol of (partido.goles || [])) {
            if (gol.tipo === 'golencontra') continue; // no cuenta goles en contra para el goleador
            const id = gol.jugadorId;
            if (!tabla[id]) tabla[id] = { jugadorId: id, equipo: gol.equipo, goles: 0 };
            tabla[id].goles++;
            tabla[id].equipo = gol.equipo; // actualizar con el último conocido
        }
    }
    return Object.values(tabla).sort((a, b) => b.goles - a.goles);
}

function getAsistenciasTable() {
    const data = loadResultados();
    const tabla = {};
    for (const partido of data.partidos) {
        for (const gol of (partido.goles || [])) {
            if (!gol.asistenciaId) continue;
            const id = gol.asistenciaId;
            if (!tabla[id]) tabla[id] = { jugadorId: id, equipo: gol.equipo, asistencias: 0 };
            tabla[id].asistencias++;
            tabla[id].equipo = gol.equipo;
        }
    }
    return Object.values(tabla).sort((a, b) => b.asistencias - a.asistencias);
}

const MOD_ROLE_ID = "1414386378371891363";

async function getFreshMember(guild, userId) {
    try {
        return await guild.members.fetch({ user: userId, force: true });
    } catch (e) {
        return null;
    }
}

async function isModeratorOrAdmin(guild, userId) {
    const member = await getFreshMember(guild, userId);
    if (!member) return false;
    const hasModRole = member.roles.cache.has(MOD_ROLE_ID);
    const isAdminUser = member.permissions.has(PermissionFlagsBits.Administrator);
    return hasModRole || isAdminUser;
}

async function isAdminOnly(guild, userId) {
    const member = await getFreshMember(guild, userId);
    if (!member) return false;
    return member.permissions.has(PermissionFlagsBits.Administrator);
}

// IDs de roles
const TEAM_ROLES = {
    "CJA": "1471248060171419899",
    "Club Deportivo Hospital": "1471249642736849138",
    "Lightkings FC": "1471249838950715514",
    "Kunts FC": "1471250131134316605",
    "SiuFC": "1471251469901500558",
    "Birdcam CF": "1471250527307305031",
    "Academia Polaris": "1471251662130774165",
    "Zinrack FC": "1471251835909046415",
    "Vanguards FC": "1471254126951403521",
    "Cojos FC": "1471254581412364502",
    "Bolivia FC": "1471254755014873130",
    "Universidad De Chile": "1471254927019081899",
    "Coopsol FC": "1471257720660299941",
    "Galindos": "1471258020762751100",
    "Bloxyneta FC": "1471255086712881193",
    "Black Mans FC": "1471255197605953621",
    "Stroganoff CF": "1471254422528065720",
    "CF Ineri": "1471254820156342434",
    "Orlando Pirates": "1471258786944651506",
    "Brazukinos Sport Club": "1471258910861299885",
    "Red Bull FC": "1471259006059417835",
    "Bellay Sporting Club": "1471259134283218956",
    "Red Waffles FC": "1471259283529269401",
    "Deportes Concepcion": "1471259414102147114"
};

const DIVISION_ROLES = {
    "División A": "1467325461628719355",
    "División B": "1467326426544865310",
    "División C": "1467326659521679516"
};

const MISC_ROLES = {
    "Agente Libre": "1414386378254323797",
    "DoubleAuth": "1414386378254323794",
    "Dueño De Club": "1414386378317500420",
    "Manager": "1417995563298852985",
    "Assistant Manager": "1414386378317500419",
    "Sancionado": "1419143075871064074"
};

const TEAM_EMOJIS = {
    "CJA": "<:CJA:1471684217871274127>",
    "Club Deportivo Hospital": "<:CDH:1471683405191057471>",
    "Lightkings FC": "<:lightkings_1:1471684210673582231>",
    "Kunts FC": "<:Kunts_FC:1471684215186919573>",
    "SiuFC": "<:SIU_FC:1471684204646498578>",
    "Birdcam CF": "<:Birdcam_FC:1471683414196490462>",
    "Academia Polaris": "<:Academia_Polaris:1471684208031305728>",
    "Zinrack FC": "<:ZinrackFC:1471684212309622922>",
    "Vanguards FC": "<:Vanguards_FC:1471684226024734894>",
    "Cojos FC": "<:Cojos_FC:1471684237013946514>",
    "Bolivia FC": "<:Bolivia_FC:1471684242215010417>",
    "Universidad De Chile": "<:UdeChile:1471684221096558726>",
    "Coopsol FC": "<:Deportivo_Coopsol:1471683407959298253>",
    "Galindos": "<:Galindos_FC:1471684234556211201>",
    "Bloxyneta FC": "<:Bloxyneta_FC:1471684238989590608>",
    "Black Mans FC": "<:black_mans_fc:1471684223143252112>",
    "Stroganoff CF": "<:MHM_Stroganoff:1471684230735200381>",
    "CF Ineri": "<:CF_Ineri:1471684244479672341>",
    "Orlando Pirates": "<:Orlando_Pirates:1471683411310809252>",
    "Brazukinos Sport Club": "<:brazukinos:1471689353343533159>",
    "Red Bull FC": "<:RedBull:1471684198589923450>",
    "Bellay Sporting Club": "<:Bellay:1471684196358684867>",
    "Red Waffles FC": "<:Sevilla:1471684189299409108>",
    "Deportes Concepcion": "<:Deportes_Concepcion:1471683395812855870>"
};

const DIVISION_EMOJIS = {
    "División A": "<:DivisionA:1471684441280745504>",
    "División B": "<:DivisionB:1471681882008588469>",
    "División C": "<:DivisionC:1471684516438347857>"
};

const RESULT_EMOJIS = {
    "arbitro": "<:ref:1472075852886835210>",
    "golencontra": "<:golencontra:1472075859891327160>",
    "penal": "<:penal:1475298067329581137>",
    "tarjeta_roja": "<:roja:1472075854552109056>",
    "tarjeta_amarilla": "<:amarilla:1472075856921886934>",
    "Bull Cup": "<:BullCup:1472076445634265180>",
    "DBA Intermission Cup": "<:DBA_PNG:1472076556938772480>",
    "Elite Division Cup": "<:EliteDivisionCup:1472076448297779280>"
};

const RESULT_CHANNELS = {
    "División A": "1414386379969789991",
    "División B": "1468369368399216761",
    "División C": "1468370118231986327",
    "Elite Division Cup": "1414386379969789991",
    "DBA Intermission Cup": "1468369368399216761",
    "Bull Cup": "1468370118231986327",
    "Copa ATF": "1468370118231986327",
    "Repechaje del ascenso División B": "1468369368399216761"
};

const SANCTION_EMOJIS = {
    "robux": "<:Robux:1472096131377926385>",
    "sancion": "<:Sancion:1472096133085007953>"
};


// ─────────────────────────────────────────────────────────────────────────────
// Emojis de dígitos para marcadores (0-9 por División)
// ─────────────────────────────────────────────────────────────────────────────
const SCORE_DIGIT_EMOJIS = {
    "División A": {
        0: "<:0DivA:1475179383688925184>",
        1: "<:1DivA:1475179293343612928>",
        2: "<:2DivA:1475179290852200703>",
        3: "<:3DivA:1475179288444539010>",
        4: "<:4DivA:1475179286338994411>",
        5: "<:5DivA:1475179284036452382>",
        6: "<:6DivA:1475179281893036177>",
        7: "<:7DivA:1475179279779106967>",
        8: "<:8DivA:1475179277694668812>",
        9: "<:9DivA:1475179275291201616>"
    },
    "División B": {
        0: "<:0DivB:1475179414424780881>",
        1: "<:1DivB:1475179411597819904>",
        2: "<:2DivB:1475179402475077783>",
        3: "<:3DivB:1475179399551910061>",
        4: "<:4DivB:1475179397639045272>",
        5: "<:5DivB:1475179395592224789>",
        6: "<:6DivB:1475179393583288552>",
        7: "<:7DivB:1475179391263834263>",
        8: "<:8DivB:1475179388818555075>",
        9: "<:9DivB:1475179386398314516>"
    },
    "División C": {
        0: "<:0DivC:1475179438726582416>",
        1: "<:1DivC:1475179436700733520>",
        2: "<:2DivC:1475179434465038530>",
        3: "<:3DivC:1475179432439320679>",
        4: "<:4DivC:1475179430245826591>",
        5: "<:5DivC:1475179428358258708>",
        6: "<:6DivC:1475179425518583839>",
        7: "<:7DivC:1475179422754668725>",
        8: "<:8DivC:1475179420745601297>",
        9: "<:9DivC:1475179418459570257>"
    }
};

function scoreToEmojis(number, competicion) {
    let divKey = null;
    if (competicion === "División A" || competicion === "Elite Division Cup") {
        divKey = "División A";
    } else if (competicion === "División B" || competicion === "DBA Intermission Cup" || competicion === "Repechaje del ascenso División B") {
        divKey = "División B";
    } else if (competicion === "División C" || competicion === "Bull Cup" || competicion === "Copa ATF") {
        divKey = "División C";
    }

    if (!divKey || !SCORE_DIGIT_EMOJIS[divKey]) {
        return String(number);
    }

    const digits = SCORE_DIGIT_EMOJIS[divKey];
    return String(number).split('').map(d => digits[parseInt(d)] || d).join('');
}

const SANCTION_CHANNEL = "1414386379106025610";
const SANCTION_LOGS_CHANNEL = "1474967295938924867";
const SANCIONADO_ROLE = "1419143075871064074";

const SANCTION_TYPES = {
    "Permanente": { duration: "Permanente", price: 4500, gw: null },
    "1 Season": { duration: "1 Season", price: 2500, gw: null },
    "7 GW": { duration: "7 GW", price: 1050, gw: 7 },
    "6 GW": { duration: "6 GW", price: 900, gw: 6 },
    "5 GW": { duration: "5 GW", price: 750, gw: 5 },
    "4 GW": { duration: "4 GW", price: 600, gw: 4 },
    "3 GW": { duration: "3 GW", price: 450, gw: 3 },
    "2 GW": { duration: "2 GW", price: 300, gw: 2 },
    "1 GW": { duration: "1 GW", price: 150, gw: 1 }
};

// SANCTION_REASONS combinado: cada razón incluye el tipo de sanción, precio y GWs
// Formato: { label, tipo, price, gw, duration }
const SANCTION_REASONS_DATA = [
    { label: "Tarjeta roja",                               tipo: "Tarjeta Roja",   duration: "1 GW",        price: 125,  gw: 1    },
    { label: "Doble amarilla = Roja",                       tipo: "Tarjeta Roja",   duration: "1 GW",        price: 125,  gw: 1    },
    { label: "GIF NSFW",                                    tipo: "Sanción Grave",  duration: "3 GW",        price: 450,  gw: 3    },
    { label: "Gore",                                        tipo: "Sanción Grave",  duration: "3 GW",        price: 450,  gw: 3    },
    { label: "Material +18",                                tipo: "Sanción Grave",  duration: "3 GW",        price: 450,  gw: 3    },
    { label: "Filtrar la cara de un usuario sin consentimiento", tipo: "Sanción Grave", duration: "3 GW",   price: 450,  gw: 3    },
    { label: "Filtrar información privada de un miembro de ATF", tipo: "Sanción Grave", duration: "3 GW",  price: 450,  gw: 3    },
    { label: "Jugar un partido sin estar fichado",          tipo: "Sanción Leve",   duration: "2 GW",        price: 350,  gw: 2    },
    { label: "Pasar por 3 equipos en una temporada",        tipo: "Sanción Leve",   duration: "2 GW",        price: 350,  gw: 2    },
    { label: "Evadir un PC CHECK",                          tipo: "Sanción Severa",   duration: "1 Season",        price: 2500,  gw: null    },
    { label: "Ser cómplice de actividades sancionables",    tipo: "Sanción Severa",   duration: "1 Season",        price: 2500,  gw: null    },
    { label: "Mala administración del club",                tipo: "Sanción Media",  duration: "4 GW",        price: 600,  gw: 4    },
    { label: "Poseer hacks que afecten al juego",           tipo: "Sanción Severa",  duration: "1 Season",        price: 2500,  gw: null    },
    { label: "Pasar por 6 equipos en una temporada",        tipo: "Sanción Media",  duration: "4 GW",        price: 600,  gw: 4    },
    { label: "Tener 3 sanciones activas",                   tipo: "Sanción Media",  duration: "5 GW",        price: 750,  gw: 5    },
    { label: "Corrupción siendo moderador",                 tipo: "Sanción Severa", duration: "1 Season",    price: 2500, gw: null },
    { label: "Falsificación de documentos",                 tipo: "Sanción Severa", duration: "1 Season",    price: 2500, gw: null },
    { label: "Alting",                                      tipo: "Sanción Severa", duration: "1 Season",    price: 2500, gw: null },
    { label: "ACC Share",                                   tipo: "Sanción Severa", duration: "1 Season",    price: 2500, gw: null },
    { label: "Intento de raid",                             tipo: "Sanción Severa", duration: "1 Season",    price: 2500, gw: null },
    { label: "Corrupción siendo owner",                     tipo: "Sanción Permanente", duration: "Permanente",    price: 5000, gw: null },
    { label: "Jugar 2 partidos en una misma fecha",         tipo: "Sanción Media", duration: "3 GW", price: 450, gw: 3 },
    { label: "Disband",                                     tipo: "Sanción Permanente", duration: "Permanente", price: 5000, gw: null },
];

// Array simple de razones para compatibilidad y choices de Discord
const SANCTION_REASONS = SANCTION_REASONS_DATA.map(r => r.label);

function getSanctionDataByReason(razon) {
    return SANCTION_REASONS_DATA.find(r => r.label === razon) || null;
}

const CHANNELS = {
    "mercado": "1414386379969789990",
    "squadsheets_a": "1417998600205500579",
    "squadsheets_b": "1471249740095029309",
    "squadsheets_c": "1471249782147121286"
};

const TEAM_DIVISIONS = {
    "Orlando Pirates": "C",
    "Brazukinos Sport Club": "C",
    "Coopsol FC": "B",
    "Club Deportivo Hospital": "A",
    "Red Waffles FC": "C",
    "Bellay Sporting Club": "C",
    "Red Bull FC": "C",
    "Deportes Concepcion": "C",
    "CF Ineri": "C",
    "Bolivia FC": "B",
    "Bloxyneta FC": "B",
    "Cojos FC": "B",
    "Galindos": "B",
    "Stroganoff CF": "C",
    "Vanguards FC": "B",
    "Black Mans FC": "B",
    "Universidad De Chile": "B",
    "CJA": "A",
    "Kunts FC": "A",
    "Zinrack FC": "A",
    "Lightkings FC": "A",
    "Academia Polaris": "A",
    "SiuFC": "A",
    "Birdcam CF": "A"
};

// ─────────────────────────────────────────────────────────────────────────────
// FLEXIBLE TEAM MATCHING
// Normaliza un string quitando espacios, guiones, puntos y pasando a minúsculas
// para comparación flexible (ej: "siufc" == "SiuFC" == "Siu FC")
// ─────────────────────────────────────────────────────────────────────────────
function normalizeTeamName(name) {
    return name.toLowerCase().replace(/[\s\-_.]/g, '');
}

function findTeamName(input) {
    if (!input) return null;
    const normalizedInput = normalizeTeamName(input);
    return Object.keys(TEAM_ROLES).find(k => normalizeTeamName(k) === normalizedInput) || null;
}

// Almacenar datos de resultados en proceso
const resultadoSessions = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function parseUserId(text) {
    if (!text) return null;
    const match = text.match(/(\d{17,20})/);
    return match ? match[1] : null;
}

async function updateOrFollowUp(interaction, payload) {
    if (interaction.isChatInputCommand() || (interaction.deferred && !interaction.isButton && !interaction.isModalSubmit)) {
        await interaction.editReply(payload);
    } else if (interaction.isModalSubmit()) {
        if (!interaction.replied && !interaction.deferred) {
            await interaction.deferUpdate();
        }
        await interaction.editReply(payload);
    } else {
        await interaction.update(payload);
    }
}

function getPlayerInfo(userId) {
    const db = loadDatabase();
    return db.players[userId.toString()] || null;
}

function setPlayerInfo(userId, team, gw, country, division, role = "Jugador") {
    const db = loadDatabase();
    db.players[userId.toString()] = { team, gw, country, division, role };
    saveDatabase(db);
}

function removePlayerInfo(userId) {
    const db = loadDatabase();
    if (db.players[userId.toString()]) {
        delete db.players[userId.toString()];
        saveDatabase(db);
    }
}

function getTeamPlayers(teamName) {
    const db = loadDatabase();
    const players = [];
    for (const [userId, data] of Object.entries(db.players)) {
        if (data.team === teamName) {
            players.push({ userId, ...data });
        }
    }
    return players;
}

function updatePlayerGW(userId, newGW) {
    const db = loadDatabase();
    if (db.players[userId.toString()]) {
        db.players[userId.toString()].gw = newGW;
        saveDatabase(db);
    }
}

function updatePlayerRole(userId, newRole) {
    const db = loadDatabase();
    if (db.players[userId.toString()]) {
        db.players[userId.toString()].role = newRole;
        saveDatabase(db);
    }
}

function getSquadsheetMessageId(teamName) {
    const db = loadDatabase();
    return db.squadsheet_messages[teamName] || null;
}

function setSquadsheetMessageId(teamName, messageId, channelId) {
    const db = loadDatabase();
    db.squadsheet_messages[teamName] = { message_id: messageId, channel_id: channelId };
    saveDatabase(db);
}

function getTeamEmoji(teamName) {
    return TEAM_EMOJIS[teamName] || "⚽";
}

function getDivisionEmoji(competicion) {
    if (RESULT_EMOJIS[competicion]) return RESULT_EMOJIS[competicion];
    return DIVISION_EMOJIS[competicion] || "🏆";
}

async function updateSquadsheet(guild, teamName) {
    try {
        const players = getTeamPlayers(teamName);
        let owner = null, manager = null, assistant = null;
        const regularPlayers = [];

        for (const player of players) {
            if (player.role === "Dueño") owner = player;
            else if (player.role === "Manager") manager = player;
            else if (player.role === "Assistant Manager") assistant = player;
            else regularPlayers.push(player);
        }

        const teamEmoji = TEAM_EMOJIS[teamName] || "⚽";
        const division = TEAM_DIVISIONS[teamName] || "C";
        const divisionKey = `División ${division}`;

        let message = `## ${teamEmoji} **${teamName}** \n`;
        message += owner ? `• **Dueño:** <@${owner.userId}> **[${owner.country}]**\n` : `• **Dueño:** **N/A**\n`;
        message += manager ? `• **Manager:** <@${manager.userId}> **[${manager.country}]**\n` : `• **Manager:** **N/A**\n`;
        message += assistant ? `• **Assistant Manager:** <@${assistant.userId}> **[${assistant.country}]**\n` : `• **Assistant Manager:** **N/A**\n`;
        message += "─────────────────────────\n";
        for (const player of regularPlayers) {
            message += `• <@${player.userId}> **[${player.country}]**\n`;
        }
        message += "─────────────────────────\n";
        message += `**${players.length}/12**`;

        let channelId;
        if (division === "A") channelId = CHANNELS.squadsheets_a;
        else if (division === "B") channelId = CHANNELS.squadsheets_b;
        else channelId = CHANNELS.squadsheets_c;

        const channel = guild.channels.cache.get(channelId);
        if (!channel) return;

        const squadsheetData = getSquadsheetMessageId(teamName);
        if (squadsheetData) {
            try {
                const msg = await channel.messages.fetch(squadsheetData.message_id);
                await msg.edit(message);
            } catch (error) {
                const newMsg = await channel.send(message);
                setSquadsheetMessageId(teamName, newMsg.id, channelId);
            }
        } else {
            const newMsg = await channel.send(message);
            setSquadsheetMessageId(teamName, newMsg.id, channelId);
        }
    } catch (error) {
        console.error('Error al actualizar squadsheet:', error);
    }
}

function getSanction(sanctionId) {
    const db = loadDatabase();
    return db.sanctions[sanctionId];
}

function createSanction(userId, numero, tipo, razon, messageId) {
    const db = loadDatabase();
    if (!db.sanctions) db.sanctions = {};
    if (!db.sanctionCounter) db.sanctionCounter = 0;

    const sanctionData = SANCTION_TYPES[tipo];
    const sanctionId = `sanction_${Date.now()}_${numero}`;

    db.sanctions[sanctionId] = {
        id: sanctionId,
        numero,
        userId,
        tipo,
        razon,
        precio: sanctionData.price,
        duracion: sanctionData.duration,
        duracion_restante: sanctionData.gw !== null ? sanctionData.gw : sanctionData.duration,
        gw: sanctionData.gw,
        estado: "Activa",
        messageId,
        timestamp: Date.now()
    };

    db.sanctionCounter = Math.max(db.sanctionCounter, numero);
    fs.writeFileSync(DATABASE_FILE, JSON.stringify(db, null, 4), 'utf-8');
    console.log(`[SANCION] Guardada sanción #${numero} en base de datos`);
    return sanctionId;
}

function updateSanctionStatus(id, status) {
    const db = loadDatabase();
    if (!db.sanctions[id]) return;
    db.sanctions[id].estado = status;
    saveDatabase(db);
}

function updateSanctionGW(id, newGW) {
    const db = loadDatabase();
    if (!db.sanctions[id]) return;
    db.sanctions[id].gw = newGW;
    saveDatabase(db);
}

function getUserActiveSanctions(userId) {
    const db = loadDatabase();
    const sanctions = [];
    for (const [id, sanction] of Object.entries(db.sanctions || {})) {
        if (sanction.userId === userId && sanction.estado === "Activa") {
            sanctions.push({ id, ...sanction });
        }
    }
    return sanctions;
}

function getAllActiveSanctions() {
    const db = loadDatabase();
    const sanctions = [];
    for (const [id, sanction] of Object.entries(db.sanctions || {})) {
        if (sanction.estado === "Activa") sanctions.push({ id, ...sanction });
    }
    return sanctions;
}

// ─────────────────────────────────────────────────────────────────────────────
// UPPERCASE HELPERS para competición y serie en el mensaje de resultado
// ─────────────────────────────────────────────────────────────────────────────
function formatCompeticionDisplay(competicion) {
    return competicion.toUpperCase();
}

function formatSerieDisplay(serie) {
    return serie.toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERAR MENSAJE DE RESULTADO
// ─────────────────────────────────────────────────────────────────────────────
function generateResultMessage(data) {
    const emojiComp = getDivisionEmoji(data.competicion);
    const emojiLocal = getTeamEmoji(data.equipoLocal);
    const emojiVis = getTeamEmoji(data.equipoVisitante);
    const emojiArb = RESULT_EMOJIS.arbitro;

    const roleLocal = TEAM_ROLES[data.equipoLocal];
    const roleVis = TEAM_ROLES[data.equipoVisitante];

    // Competición y serie en MAYÚSCULAS
    const competicionDisplay = formatCompeticionDisplay(data.competicion);
    const serieDisplay = formatSerieDisplay(data.serie);

    let msg = `> **${emojiComp}  \`${competicionDisplay} | ${serieDisplay}\`** ${emojiComp}\n`;
    msg += `> ${emojiArb} **REFS: <@${data.arbitroId}>**\n`;
    msg += `> **📹 STREAMER: <@${data.streamerId}>**\n`;
    // ── ESTADIO ──────────────────────────────────────────────────────────────
    if (data.estadio && data.estadio.trim() !== '') {
        msg += `> **🏟 ${data.estadio.trim()}** 📍\n`;
    }
    msg += `> \n`;
    const scoreLocal = scoreToEmojis(data.golesLocal, data.competicion);
    const scoreVis = scoreToEmojis(data.golesVisitante, data.competicion);
    msg += `> **${emojiLocal} <@&${roleLocal}> ${scoreLocal} - ${scoreVis} <@&${roleVis}> ${emojiVis}**\n`;


    if (data.tipo === 'ida_vuelta' && data.esIda === false && data.resultadoIda) {
        const globalL = data.resultadoIda.local + data.golesLocal;
        const globalV = data.resultadoIda.visitante + data.golesVisitante;
        const scoreGlobalL = scoreToEmojis(globalL, data.competicion);
        const scoreGlobalV = scoreToEmojis(globalV, data.competicion);
        msg += `-# ${emojiComp} **Global: ${scoreGlobalL} - ${scoreGlobalV}**\n`;
    }
    msg += `> \n`;

    // ── FFT: solo texto, sin sanciones/mvp/menciones ─────────────────────────
    if (data.fft && data.equipoFFT) {
        msg += getFFTLines(data.equipoFFT);
        return msg;
    }

    msg += `> \`0'\` **Inicio del Partido**\n`;

    if (data.goles && data.goles.length > 0) {
        const sorted = [...data.goles].sort((a, b) => (parseInt(a.minuto) || 0) - (parseInt(b.minuto) || 0));
        // Recalcular marcador cronológicamente después de ordenar por minuto
        let mLocal = 0, mVis = 0;
        for (const gol of sorted) {
            if (gol.equipo === data.equipoLocal) mLocal++;
            else mVis++;
            const marcadorCron = `${mLocal}-${mVis}`;
            const emoji = getTeamEmoji(gol.equipo);
            let linea = `> \`${gol.minuto}'\` **${emoji} <@${gol.jugadorId}> `;
            if (gol.tipo === 'golencontra') {
                linea += RESULT_EMOJIS.golencontra;
            } else if (gol.tipo === 'penal') {
                linea += RESULT_EMOJIS.penal;
            } else {
                linea += '⚽';
            }

            if (gol.asistenciaId) {
                linea += `, <@${gol.asistenciaId}> 🍷`;
            }
            linea += ` [${marcadorCron}]**\n`;
            msg += linea;
        }
    }

    msg += `> \n> **\`SANCIONES:\`**\n`;
    if (data.sanciones && data.sanciones.length > 0) {
        for (const s of data.sanciones) {
            const emoji = getTeamEmoji(s.equipo);
            const tarjeta = (s.tarjeta === 'roja' || s.tarjeta.includes('doble'))
                ? RESULT_EMOJIS.tarjeta_roja
                : RESULT_EMOJIS.tarjeta_amarilla;
            msg += `> - **${emoji} <@${s.jugadorId}> ${tarjeta} [${s.razon}]**\n`;
        }
    } else {
        msg += `> - **N/A**\n`;
    }

    if (data.mvp) {
        msg += `> \n> **\`MAN OF THE MATCH:\`**\n`;
        const emoji = getTeamEmoji(data.mvp.equipo);
        msg += `> - ${emoji} <@${data.mvp.jugadorId}>\n`;
    }

    if (data.menciones && data.menciones.length > 0) {
        msg += `> \n> **\`MENCIONES:\`**\n`;
        const medallas = ['🥇', '🥈', '🥉'];
        for (let i = 0; i < data.menciones.length && i < 3; i++) {
            const m = data.menciones[i];
            const emoji = getTeamEmoji(m.equipo);
            msg += `> - ${medallas[i]} ${emoji} <@${m.jugadorId}>\n`;
        }
    }

    return msg;
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENTO READY
// ─────────────────────────────────────────────────────────────────────────────
client.once('ready', async (c) => {
    console.log(`Bot conectado como ${c.user.tag}`);

    const firstGuild = c.guilds.cache.first();
    if (firstGuild) startConfigMessagesInterval(firstGuild);
    startFixtureReminderScheduler(c);
    startPrediccionesAutoScheduler(c);

    const commands = [
        new SlashCommandBuilder()
            .setName('fichaje')
            .setDescription('Fichar un jugador a un equipo')
            .addUserOption(option => option.setName('usuario').setDescription('Jugador a fichar').setRequired(true))
            .addStringOption(option => option.setName('equipo').setDescription('Equipo').setRequired(true).addChoices(...Object.keys(TEAM_ROLES).map(team => ({ name: team, value: team }))))
            .addIntegerOption(option => option.setName('gw').setDescription('Gameweeks de contrato').setRequired(true).addChoices({ name: '2', value: 2 }, { name: '3', value: 3 }, { name: '4', value: 4 }, { name: '5', value: 5 }, { name: '6', value: 6 }, { name: '7', value: 7 }))
            .addStringOption(option => option.setName('pais').setDescription('Bandera del país').setRequired(true))
            .addStringOption(option => option.setName('division').setDescription('División del equipo').setRequired(true).addChoices({ name: 'División A', value: 'División A' }, { name: 'División B', value: 'División B' }, { name: 'División C', value: 'División C' })),

        new SlashCommandBuilder()
            .setName('release')
            .setDescription('Liberar un jugador de su equipo')
            .addUserOption(option => option.setName('usuario').setDescription('Jugador a liberar').setRequired(true))
            .addStringOption(option => option.setName('razon').setDescription('Razón').setRequired(true)),

        new SlashCommandBuilder()
            .setName('setup-verify')
            .setDescription('Configurar el canal y embed de verificación')
            .addChannelOption(opt => opt.setName('canal').setDescription('Canal donde se enviará el botón de verificación').setRequired(true))
            .addStringOption(opt => opt.setName('mensaje').setDescription('Mensaje del embed').setRequired(true))
            .addRoleOption(opt => opt.setName('rol').setDescription('Rol a asignar al verificarse').setRequired(true)),

        new SlashCommandBuilder()
            .setName('forcerelease')
            .setDescription('Liberar forzosamente a un jugador')
            .addUserOption(option => option.setName('usuario').setDescription('Jugador a liberar').setRequired(true))
            .addStringOption(option => option.setName('razon').setDescription('Razón').setRequired(true)),

        new SlashCommandBuilder()
            .setName('forcerelease-add')
            .setDescription('Añadir +1 force a un usuario (máx 7)')
            .addUserOption(option => option.setName('usuario').setDescription('Usuario').setRequired(true)),

        new SlashCommandBuilder()
            .setName('forcerelease-view')
            .setDescription('Ver tus forces (mods ven la lista completa)'),

        new SlashCommandBuilder()
            .setName('forcerelease-reset')
            .setDescription('[SOLO ADMIN] Resetear todos los forces a 0'),

        new SlashCommandBuilder()
            .setName('playerrole')
            .setDescription('Cambiar el rol de un jugador en su equipo')
            .addUserOption(option => option.setName('usuario').setDescription('Jugador').setRequired(true))
            .addStringOption(option => option.setName('nuevo_rol').setDescription('Nuevo rol').setRequired(true).addChoices({ name: 'Jugador', value: 'Jugador' }, { name: 'Assistant Manager', value: 'Assistant Manager' }, { name: 'Manager', value: 'Manager' }, { name: 'Dueño', value: 'Dueño' })),

        new SlashCommandBuilder()
            .setName('passgw')
            .setDescription('Pasar fecha y restar 1 GW a los jugadores de un equipo')
            .addStringOption(option => option.setName('equipo').setDescription('Equipo').setRequired(true).addChoices(...Object.keys(TEAM_ROLES).map(team => ({ name: team, value: team })))),

        new SlashCommandBuilder()
            .setName('leftrelease')
            .setDescription('Liberar un jugador que salió del servidor (por ID)')
            .addStringOption(option => option.setName('user_id').setDescription('ID del usuario').setRequired(true))
            .addStringOption(option => option.setName('razon').setDescription('Razón').setRequired(true)),

        new SlashCommandBuilder()
            .setName('resultado')
            .setDescription('Publicar resultado de un partido')
            .addStringOption(option => option.setName('tipo').setDescription('Tipo de partido').setRequired(true).addChoices({ name: 'Partido Único', value: 'unico' }, { name: 'Ida y Vuelta', value: 'ida_vuelta' }))
            .addStringOption(option => option.setName('competicion').setDescription('Competición').setRequired(true).addChoices(
                { name: 'División A', value: 'División A' }, { name: 'División B', value: 'División B' }, { name: 'División C', value: 'División C' },
                { name: 'Elite Division Cup', value: 'Elite Division Cup' }, { name: 'DBA Intermission Cup', value: 'DBA Intermission Cup' },
                { name: 'Bull Cup', value: 'Bull Cup' }, { name: 'Copa ATF', value: 'Copa ATF' },
                { name: 'Repechaje del ascenso División B', value: 'Repechaje del ascenso División B' }
            ))
            .addStringOption(option => option.setName('serie').setDescription('Serie del partido').setRequired(true).addChoices(
                { name: 'Fecha 1', value: 'Fecha 1' }, { name: 'Fecha 2', value: 'Fecha 2' }, { name: 'Fecha 3', value: 'Fecha 3' },
                { name: 'Fecha 4', value: 'Fecha 4' }, { name: 'Fecha 5', value: 'Fecha 5' }, { name: 'Fecha 6', value: 'Fecha 6' },
                { name: 'Fecha 7', value: 'Fecha 7' }, { name: 'Octavos de final - ida', value: 'Octavos de final - ida' },
                { name: 'Octavos de final - vuelta', value: 'Octavos de final - vuelta' }, { name: 'Cuartos de final - ida', value: 'Cuartos de final - ida' },
                { name: 'Cuartos de final - vuelta', value: 'Cuartos de final - vuelta' }, { name: 'Semifinales - Ida', value: 'Semifinales - Ida' },
                { name: 'Semifinales - Vuelta', value: 'Semifinales - Vuelta' }, { name: 'Final', value: 'Final' },
                { name: 'Finales - Ida', value: 'Finales - Ida' }, { name: 'Finales - Vuelta', value: 'Finales - Vuelta' },
                { name: '3er puesto', value: '3er puesto' }
            ))
            .addUserOption(option => option.setName('arbitro').setDescription('Árbitro del partido').setRequired(true))
            .addUserOption(option => option.setName('streamer').setDescription('Streamer del partido').setRequired(true))
            .addStringOption(option => option.setName('equipo_local').setDescription('Equipo local').setRequired(true).addChoices(...Object.keys(TEAM_ROLES).map(team => ({ name: team, value: team }))))
            .addStringOption(option => option.setName('equipo_visitante').setDescription('Equipo visitante').setRequired(true).addChoices(...Object.keys(TEAM_ROLES).map(team => ({ name: team, value: team }))))
            .addStringOption(option => option.setName('estadio').setDescription('Nombre del estadio (opcional)').setRequired(false)),

        new SlashCommandBuilder()
            .setName('sancion')
            .setDescription('Aplicar una sanción a un usuario')
            .addIntegerOption(option => option.setName('numero').setDescription('Número de sanción (1-10)').setRequired(true).setMinValue(1).setMaxValue(10))
            .addUserOption(option => option.setName('usuario').setDescription('Usuario a sancionar').setRequired(true))
            .addStringOption(option => option.setName('razon').setDescription('Razón').setRequired(true).addChoices(...SANCTION_REASONS_DATA.map(r => ({ name: `${r.label} [${r.tipo} | ${r.duration} | ${r.price}rbx]`, value: r.label })))),

        new SlashCommandBuilder()
            .setName('revoke')
            .setDescription('Revocar una sanción activa')
            .addUserOption(option => option.setName('usuario').setDescription('Usuario con sanción').setRequired(true))
            .addStringOption(option => option.setName('razon').setDescription('Razón de la revocación').setRequired(true)),

        new SlashCommandBuilder()
            .setName('passgwsanciones')
            .setDescription('Restar 1 GW a todas las sanciones activas'),

        new SlashCommandBuilder()
            .setName('open')
            .setDescription('Abre un matchcall y menciona a los roles')
            .addChannelOption(option => option.setName('canal').setDescription('Canal matchcall').setRequired(true))
            .addRoleOption(option => option.setName('rol1').setDescription('Primer rol').setRequired(true))
            .addRoleOption(option => option.setName('rol2').setDescription('Segundo rol').setRequired(true))
            .addRoleOption(option => option.setName('arbitro').setDescription('Rol de árbitro').setRequired(true)),

        new SlashCommandBuilder()
            .setName('close')
            .setDescription('Cierra un matchcall')
            .addChannelOption(option => option.setName('canal').setDescription('Canal matchcall').setRequired(true)),

        new SlashCommandBuilder()
            .setName('renew')
            .setDescription('Renovar el contrato de un jugador')
            .addUserOption(option => option.setName('usuario').setDescription('Jugador a renovar').setRequired(true))
            .addStringOption(option => option.setName('equipo').setDescription('Equipo').setRequired(true).addChoices(...Object.keys(TEAM_ROLES).map(team => ({ name: team, value: team }))))
            .addIntegerOption(option => option.setName('gw').setDescription('Gameweeks').setRequired(true).addChoices({ name: '2', value: 2 }, { name: '3', value: 3 }, { name: '4', value: 4 }, { name: '5', value: 5 }, { name: '6', value: 6 }, { name: '7', value: 7 })),

        new SlashCommandBuilder()
            .setName('reset')
            .setDescription('[SOLO ADMIN] Resetea el bot y bloquea todos los comandos'),

        new SlashCommandBuilder()
            .setName('active-reset')
            .setDescription('[SOLO ADMIN] Activa el bot y habilita todos los comandos'),

        new SlashCommandBuilder()
            .setName('sancion-team')
            .setDescription('Sancionar a un equipo')
            .addStringOption(option => option.setName('equipo').setDescription('Equipo').setRequired(true).addChoices(...Object.keys(TEAM_ROLES).map(team => ({ name: team, value: team }))))
            .addStringOption(option => option.setName('razon').setDescription('Razón').setRequired(true)),

        new SlashCommandBuilder()
            .setName('boost-add')
            .setDescription('Añadir boosts a un usuario')
            .addUserOption(option => option.setName('usuario').setDescription('Usuario').setRequired(true))
            .addIntegerOption(option => option.setName('cantidad').setDescription('Cantidad').setRequired(true).addChoices({ name: '1', value: 1 }, { name: '2', value: 2 })),

        new SlashCommandBuilder()
            .setName('boost-remove')
            .setDescription('Eliminar boosts de un usuario')
            .addUserOption(option => option.setName('usuario').setDescription('Usuario').setRequired(true))
            .addIntegerOption(option => option.setName('cantidad').setDescription('Cantidad').setRequired(true).addChoices({ name: '1', value: 1 }, { name: '2', value: 2 })),

        new SlashCommandBuilder()
            .setName('boost-view')
            .setDescription('Ver lista de usuarios con sus boosts'),

        new SlashCommandBuilder()
            .setName('config-messages')
            .setDescription('[SOLO ADMIN] Configurar mensajes automáticos')
            .addChannelOption(option => option.setName('canal').setDescription('Canal').setRequired(true))
            .addIntegerOption(option => option.setName('cooldown').setDescription('Intervalo en minutos').setRequired(true).setMinValue(1)),

        new SlashCommandBuilder()
            .setName('goleadores')
            .setDescription('Ver la tabla de goleadores de la temporada'),

        new SlashCommandBuilder()
            .setName('asistencias')
            .setDescription('Ver la tabla de asistencias de la temporada'),

        new SlashCommandBuilder()
            .setName('fixture')
            .setDescription('Publicar fixture de una fecha')
            .addStringOption(option => option.setName('competicion').setDescription('Competición').setRequired(true).addChoices(
                { name: 'División A', value: 'División A' }, { name: 'División B', value: 'División B' }, { name: 'División C', value: 'División C' },
                { name: 'Elite Division Cup', value: 'Elite Division Cup' }, { name: 'DBA Intermission Cup', value: 'DBA Intermission Cup' },
                { name: 'Bull Cup', value: 'Bull Cup' }, { name: 'Copa ATF', value: 'Copa ATF' },
                { name: 'Repechaje del ascenso División B', value: 'Repechaje del ascenso División B' }
            ))
            .addStringOption(option => option.setName('fecha').setDescription('Fecha/Ronda').setRequired(true).addChoices(
                { name: 'Fecha 1', value: 'Fecha 1' }, { name: 'Fecha 2', value: 'Fecha 2' }, { name: 'Fecha 3', value: 'Fecha 3' },
                { name: 'Fecha 4', value: 'Fecha 4' }, { name: 'Fecha 5', value: 'Fecha 5' }, { name: 'Fecha 6', value: 'Fecha 6' },
                { name: 'Fecha 7', value: 'Fecha 7' }, { name: 'Octavos de final - ida', value: 'Octavos de final - ida' },
                { name: 'Octavos de final - vuelta', value: 'Octavos de final - vuelta' }, { name: 'Cuartos de final - ida', value: 'Cuartos de final - ida' },
                { name: 'Cuartos de final - vuelta', value: 'Cuartos de final - vuelta' }, { name: 'Semifinales - Ida', value: 'Semifinales - Ida' },
                { name: 'Semifinales - Vuelta', value: 'Semifinales - Vuelta' }, { name: 'Final', value: 'Final' },
                { name: 'Finales - Ida', value: 'Finales - Ida' }, { name: 'Finales - Vuelta', value: 'Finales - Vuelta' },
                { name: '3er puesto', value: '3er puesto' }
            ))
            .addIntegerOption(option => option.setName('enfrentamientos').setDescription('Cantidad de enfrentamientos (1-8)').setRequired(true).setMinValue(1).setMaxValue(8))
            .addChannelOption(option => option.setName('canal').setDescription('Canal donde publicar el fixture').setRequired(true)),

        new SlashCommandBuilder()
            .setName('pospone')
            .setDescription('Posponer un enfrentamiento del fixture')
            .addStringOption(option =>
                option.setName('enfrentamiento')
                    .setDescription('Seleccionar enfrentamiento a posponer')
                    .setRequired(true)
                    .setAutocomplete(true)
            )
            .addStringOption(option =>
                option.setName('nueva_hora')
                    .setDescription('Nueva hora (formato Hammertime, ej: <t:1771810200:F>)')
                    .setRequired(true)
            )
            .addChannelOption(option =>
                option.setName('canal')
                    .setDescription('Canal donde publicar el aviso')
                    .setRequired(true)
            ),

        new SlashCommandBuilder()
            .setName('search-username')
            .setDescription('Buscar el nombre de Roblox de un usuario de Discord')
            .addUserOption(option => option.setName('usuario').setDescription('Usuario de Discord').setRequired(true)),

        new SlashCommandBuilder()
            .setName('atf-tv')
            .setDescription('Publicar anuncio de transmisión de un partido')
            .addStringOption(option => option.setName('equipo_local').setDescription('Equipo local').setRequired(true).addChoices(...Object.keys(TEAM_ROLES).map(team => ({ name: team, value: team }))))
            .addStringOption(option => option.setName('equipo_visitante').setDescription('Equipo visitante').setRequired(true).addChoices(...Object.keys(TEAM_ROLES).map(team => ({ name: team, value: team }))))
            .addStringOption(option => option.setName('competicion').setDescription('Competición').setRequired(true).addChoices(
                { name: 'División A', value: 'División A' }, { name: 'División B', value: 'División B' }, { name: 'División C', value: 'División C' },
                { name: 'Elite Division Cup', value: 'Elite Division Cup' }, { name: 'DBA Intermission Cup', value: 'DBA Intermission Cup' },
                { name: 'Bull Cup', value: 'Bull Cup' }, { name: 'Copa ATF', value: 'Copa ATF' },
                { name: 'Repechaje del ascenso División B', value: 'Repechaje del ascenso División B' }
            ))
            .addStringOption(option => option.setName('fecha').setDescription('Fecha/Ronda').setRequired(true).addChoices(
                { name: 'Fecha 1', value: 'Fecha 1' }, { name: 'Fecha 2', value: 'Fecha 2' }, { name: 'Fecha 3', value: 'Fecha 3' },
                { name: 'Fecha 4', value: 'Fecha 4' }, { name: 'Fecha 5', value: 'Fecha 5' }, { name: 'Fecha 6', value: 'Fecha 6' },
                { name: 'Fecha 7', value: 'Fecha 7' }, { name: 'Octavos de final - ida', value: 'Octavos de final - ida' },
                { name: 'Octavos de final - vuelta', value: 'Octavos de final - vuelta' }, { name: 'Cuartos de final - ida', value: 'Cuartos de final - ida' },
                { name: 'Cuartos de final - vuelta', value: 'Cuartos de final - vuelta' }, { name: 'Semifinales - Ida', value: 'Semifinales - Ida' },
                { name: 'Semifinales - Vuelta', value: 'Semifinales - Vuelta' }, { name: 'Final', value: 'Final' },
                { name: 'Finales - Ida', value: 'Finales - Ida' }, { name: 'Finales - Vuelta', value: 'Finales - Vuelta' },
                { name: '3er puesto', value: '3er puesto' }
            ))
            .addChannelOption(option => option.setName('canal').setDescription('Canal donde se enviará el anuncio').setRequired(true))
            .addStringOption(option => option.setName('stream').setDescription('Link del stream').setRequired(true))
            .addAttachmentOption(option => option.setName('miniatura').setDescription('Imagen miniatura del partido (opcional)').setRequired(false))
            .addStringOption(option => option.setName('link_juego').setDescription('Link del juego (opcional)').setRequired(false)),

        new SlashCommandBuilder()
            .setName('check-lineup')
            .setDescription('Verificar si la alineación de un equipo está lista para jugar')
            .addStringOption(option => option.setName('equipo').setDescription('Equipo a revisar').setRequired(true).addChoices(...Object.keys(TEAM_ROLES).map(team => ({ name: team, value: team }))))
            .addStringOption(option => option.setName('fecha').setDescription('Fecha/ronda del partido').setRequired(true).addChoices(
                { name: 'Fecha 1', value: 'Fecha 1' }, { name: 'Fecha 2', value: 'Fecha 2' }, { name: 'Fecha 3', value: 'Fecha 3' },
                { name: 'Fecha 4', value: 'Fecha 4' }, { name: 'Fecha 5', value: 'Fecha 5' }, { name: 'Fecha 6', value: 'Fecha 6' },
                { name: 'Fecha 7', value: 'Fecha 7' }, { name: 'Octavos de final - ida', value: 'Octavos de final - ida' },
                { name: 'Octavos de final - vuelta', value: 'Octavos de final - vuelta' }, { name: 'Cuartos de final - ida', value: 'Cuartos de final - ida' },
                { name: 'Cuartos de final - vuelta', value: 'Cuartos de final - vuelta' }, { name: 'Semifinales - Ida', value: 'Semifinales - Ida' },
                { name: 'Semifinales - Vuelta', value: 'Semifinales - Vuelta' }, { name: 'Final', value: 'Final' },
                { name: 'Finales - Ida', value: 'Finales - Ida' }, { name: 'Finales - Vuelta', value: 'Finales - Vuelta' },
                { name: '3er puesto', value: '3er puesto' }
            ))
            .addUserOption(option => option.setName('jug1').setDescription('Jugador 1').setRequired(true))
            .addUserOption(option => option.setName('jug2').setDescription('Jugador 2').setRequired(true))
            .addUserOption(option => option.setName('jug3').setDescription('Jugador 3').setRequired(false))
            .addUserOption(option => option.setName('jug4').setDescription('Jugador 4').setRequired(false))
            .addUserOption(option => option.setName('jug5').setDescription('Jugador 5').setRequired(false))
            .addUserOption(option => option.setName('jug6').setDescription('Jugador 6').setRequired(false))
            .addUserOption(option => option.setName('jug7').setDescription('Jugador 7').setRequired(false)),

        new SlashCommandBuilder()
            .setName('predicciones')
            .setDescription('Crear una encuesta de predicciones para los partidos')
            .addStringOption(option => option.setName('competicion').setDescription('Competición').setRequired(true).addChoices(
                { name: 'División A', value: 'División A' }, { name: 'División B', value: 'División B' }, { name: 'División C', value: 'División C' },
                { name: 'Elite Division Cup', value: 'Elite Division Cup' }, { name: 'DBA Intermission Cup', value: 'DBA Intermission Cup' },
                { name: 'Bull Cup', value: 'Bull Cup' }, { name: 'Copa ATF', value: 'Copa ATF' },
                { name: 'Repechaje del ascenso División B', value: 'Repechaje del ascenso División B' }
            ))
            .addStringOption(option => option.setName('fecha').setDescription('Fecha/Ronda').setRequired(true).addChoices(
                { name: 'Fecha 1', value: 'Fecha 1' }, { name: 'Fecha 2', value: 'Fecha 2' }, { name: 'Fecha 3', value: 'Fecha 3' },
                { name: 'Fecha 4', value: 'Fecha 4' }, { name: 'Fecha 5', value: 'Fecha 5' }, { name: 'Fecha 6', value: 'Fecha 6' },
                { name: 'Fecha 7', value: 'Fecha 7' }, { name: 'Octavos de final - ida', value: 'Octavos de final - ida' },
                { name: 'Octavos de final - vuelta', value: 'Octavos de final - vuelta' }, { name: 'Cuartos de final - ida', value: 'Cuartos de final - ida' },
                { name: 'Cuartos de final - vuelta', value: 'Cuartos de final - vuelta' }, { name: 'Semifinales - Ida', value: 'Semifinales - Ida' },
                { name: 'Semifinales - Vuelta', value: 'Semifinales - Vuelta' }, { name: 'Final', value: 'Final' },
                { name: 'Finales - Ida', value: 'Finales - Ida' }, { name: 'Finales - Vuelta', value: 'Finales - Vuelta' },
                { name: '3er puesto', value: '3er puesto' }
            ))
            .addIntegerOption(option => option.setName('enfrentamientos').setDescription('Cantidad de enfrentamientos (1-8)').setRequired(true).setMinValue(1).setMaxValue(8))
            .addChannelOption(option => option.setName('canal').setDescription('Canal donde publicar las predicciones').setRequired(true)),

        new SlashCommandBuilder()
            .setName('revoke-team')
            .setDescription('Revocar una sanción activa de un equipo')
            .addStringOption(option => option.setName('equipo').setDescription('Equipo').setRequired(true).addChoices(...Object.keys(TEAM_ROLES).map(team => ({ name: team, value: team }))))
            .addStringOption(option => option.setName('razon').setDescription('Razón de la revocación').setRequired(true)),

        new SlashCommandBuilder()
            .setName('man-verify')
            .setDescription('Verificar manualmente a un usuario de Discord con su cuenta de Roblox')
            .addUserOption(option => option.setName('usuario').setDescription('Usuario de Discord a verificar').setRequired(true))
            .addStringOption(option => option.setName('roblox_user').setDescription('Nombre de usuario de Roblox').setRequired(true))
            .addStringOption(option => option.setName('roblox_id').setDescription('ID de usuario de Roblox').setRequired(true)),

        new SlashCommandBuilder()
            .setName('predicciones-result')
            .setDescription('Revelar el resultado de una predicción y notificar a los acertantes')
            .addStringOption(option =>
                option.setName('prediccion')
                    .setDescription('Seleccionar predicción')
                    .setRequired(true)
                    .setAutocomplete(true)
            )
            .addStringOption(option =>
                option.setName('resultado')
                    .setDescription('Resultado del partido')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Local (ganó el equipo local)', value: 'local' },
                        { name: 'Empate', value: 'empate' },
                        { name: 'Visitante (ganó el equipo visitante)', value: 'visitante' }
                    )
            ),

        new SlashCommandBuilder()
            .setName('mute')
            .setDescription('Mutear a un usuario del servidor')
            .addUserOption(option => option.setName('usuario').setDescription('Usuario a mutear').setRequired(true))
            .addStringOption(option => option.setName('razon').setDescription('Razón del mute').setRequired(true))
            .addStringOption(option => option.setName('duracion').setDescription('Duración (ej: 10s, 5m, 2h, 3d, 1w — max 4w)').setRequired(true)),
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('Registrando comandos slash...');
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Comandos registrados exitosamente');
    } catch (error) {
        console.error('Error al registrar comandos:', error);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG MESSAGES
// ─────────────────────────────────────────────────────────────────────────────
const MESSAGES_FILE = path.join(__dirname, 'mensajes.json');

function loadMessages() {
    if (fs.existsSync(MESSAGES_FILE)) {
        try { return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf-8')); } catch (e) {}
    }
    return { config: null, messages: [] };
}

function saveMessages(data) {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(data, null, 4), 'utf-8');
}

async function resolveMessageVariables(text, guild) {
    const db = loadDatabase();
    const totalPlayers = Object.keys(db.players || {}).length;
    text = text.replace(/\{players_actuales\}/g, totalPlayers.toString());

    const sanctionedRole = guild.roles.cache.get(SANCIONADO_ROLE);
    let sancionadosCount = 0;
    if (sanctionedRole) {
        try {
            await guild.members.fetch();
            sancionadosCount = guild.members.cache.filter(m => m.roles.cache.has(SANCIONADO_ROLE)).size;
        } catch (e) { sancionadosCount = sanctionedRole.members.size; }
    }
    text = text.replace(/\{sancionados\}/g, sancionadosCount.toString());

    let memberCount = guild.memberCount;
    try { await guild.members.fetch(); memberCount = guild.members.cache.size; } catch (e) {}
    text = text.replace(/\{miembros\}/g, memberCount.toString());

    text = text.replace(/\{team_([^_}]+)\}/g, (_, name) => {
        const key = Object.keys(TEAM_ROLES).find(k => k.toLowerCase() === name.toLowerCase());
        return key || name;
    });

    text = text.replace(/\{team_([^_}]+)_division\}/g, (_, name) => {
        const key = Object.keys(TEAM_DIVISIONS).find(k => k.toLowerCase() === name.toLowerCase());
        return key ? (TEAM_DIVISIONS[key] || 'N/A') : 'N/A';
    });

    const roleVariants = [
        { suffix: 'owner', role: 'Dueño' },
        { suffix: 'manager', role: 'Manager' },
        { suffix: 'assist', role: 'Assistant Manager' }
    ];
    for (const { suffix, role } of roleVariants) {
        text = text.replace(new RegExp(`\\{team_([^_}]+)_${suffix}\\}`, 'g'), (_, name) => {
            const key = Object.keys(TEAM_ROLES).find(k => k.toLowerCase() === name.toLowerCase());
            if (!key) return 'N/A';
            const players = getTeamPlayers(key);
            const found = players.find(p => p.role === role);
            return found ? `<@${found.userId}>` : 'N/A';
        });
    }

    return text;
}

let configMessagesInterval = null;

function startConfigMessagesInterval(guild) {
    if (configMessagesInterval) {
        clearInterval(configMessagesInterval);
        configMessagesInterval = null;
    }
    const data = loadMessages();
    if (!data.config || !data.messages || data.messages.length === 0) return;

    const { channelId, cooldownMs } = data.config;
    let index = 0;

    configMessagesInterval = setInterval(async () => {
        try {
            const channel = guild.channels.cache.get(channelId);
            if (!channel) return;
            const msgs = loadMessages().messages;
            if (!msgs || msgs.length === 0) return;
            const raw = msgs[index % msgs.length];
            const resolved = await resolveMessageVariables(raw, guild);

            const embed = new EmbedBuilder()
                .setColor(0x1D70B8)
                .setDescription(resolved)

            await channel.send({ embeds: [embed] });
            index++;
        } catch (e) {
            console.error('[CONFIG-MESSAGES] Error al enviar mensaje:', e);
        }
    }, cooldownMs);

    console.log(`[CONFIG-MESSAGES] Intervalo iniciado: cada ${cooldownMs / 60000} min en canal ${channelId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS (reset)
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_FILE = path.join(__dirname, 'status.json');

function loadStatus() {
    if (fs.existsSync(STATUS_FILE)) {
        try { return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8')); } catch (e) {}
    }
    return { status: 'Activo' };
}

function saveStatus(status) {
    fs.writeFileSync(STATUS_FILE, JSON.stringify({ status }, null, 2), 'utf-8');
}

function isBotReset() {
    return loadStatus().status === 'Reset';
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERACTION CREATE
// ─────────────────────────────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        const adminOnlyCommands = ['reset', 'active-reset', 'forcerelease-reset'];

        if (isBotReset() && !adminOnlyCommands.includes(commandName)) {
            return await interaction.reply({
                content: '🔴 **El bot está en modo Reset.** Todos los comandos están deshabilitados temporalmente.',
                ephemeral: true
            }).catch(() => {});
        }

        try {
            if (commandName === 'fichaje') await handleFichaje(interaction);
            else if (commandName === 'setup-verify') await handleSetupVerify(interaction);
            else if (commandName === 'release') await handleRelease(interaction);
            else if (commandName === 'forcerelease') await handleForceRelease(interaction);
            else if (commandName === 'playerrole') await handlePlayerRole(interaction);
            else if (commandName === 'passgw') await handlePassGW(interaction);
            else if (commandName === 'leftrelease') await handleLeftRelease(interaction);
            else if (commandName === 'renew') await handleRenew(interaction);
            else if (commandName === 'resultado') await handleResultado(interaction);
            else if (commandName === 'sancion') await handleSancion(interaction);
            else if (commandName === 'revoke') await handleRevoke(interaction);
            else if (commandName === 'passgwsanciones') await handlePassGWSanciones(interaction);
            else if (commandName === 'open') await handleOpen(interaction);
            else if (commandName === 'close') await handleClose(interaction);
            else if (commandName === 'reset') await handleReset(interaction);
            else if (commandName === 'active-reset') await handleActiveReset(interaction);
            else if (commandName === 'sancion-team') await handleSancionTeam(interaction);
            else if (commandName === 'boost-add') await handleBoostAdd(interaction);
            else if (commandName === 'boost-remove') await handleBoostRemove(interaction);
            else if (commandName === 'boost-view') await handleBoostView(interaction);
            else if (commandName === 'forcerelease-add') await handleForceReleaseAdd(interaction);
            else if (commandName === 'forcerelease-view') await handleForceReleaseView(interaction);
            else if (commandName === 'forcerelease-reset') await handleForceReleaseReset(interaction);
            else if (commandName === 'config-messages') await handleConfigMessages(interaction);
            else if (commandName === 'goleadores') await handleGoleadores(interaction);
            else if (commandName === 'asistencias') await handleAsistencias(interaction);
            else if (commandName === 'fixture') await handleFixture(interaction);
            else if (commandName === 'pospone') await handlePospone(interaction);
            else if (commandName === 'atf-tv') await handleAtfTv(interaction);
            else if (commandName === 'check-lineup') await handleCheckLineup(interaction);
            else if (commandName === 'predicciones') await handlePredicciones(interaction);
            else if (commandName === 'predicciones-result') await handlePrediccionesResult(interaction);
            else if (commandName === 'search-username') await handleSearchUsername(interaction);  // 👈 AÑADIR AQUÍ
            else if (commandName === 'revoke-team') await handleRevokeTeam(interaction);
            else if (commandName === 'man-verify') await handleManVerify(interaction);
            else if (commandName === 'mute') await handleMute(interaction);
        } catch (error) {
            console.error(`Error en comando ${commandName}:`, error);
            const errorMsg = ':x: Ocurrió un error al ejecutar el comando.';
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(errorMsg).catch(() => {});
            } else {
                await interaction.reply({ content: errorMsg, ephemeral: true }).catch(() => {});
            }
        }
    } else if (interaction.isButton()) {
        await handleButton(interaction);
    } else if (interaction.isModalSubmit()) {
        await handleModal(interaction);
    } else if (interaction.isAutocomplete()) {
        if (interaction.commandName === 'pospone') {
            await handlePosponeAutocomplete(interaction);
        } else if (interaction.commandName === 'predicciones-result') {
            await handlePrediccionesResultAutocomplete(interaction);
        }
    } else if (interaction.isStringSelectMenu()) {
        try {
            if (interaction.customId.startsWith('revoke_select_')) {
                const parts = interaction.customId.split('_');
                const userId = parts[2];
                const requesterId = parts[3];
                const sanctionId = interaction.values[0];
                const razon = global.revokeReasons?.[`${userId}_${requesterId}`] || 'Sin razón';
                const sanction = getSanction(sanctionId);
                const usuario = await interaction.client.users.fetch(userId);
                await revokeSanction(interaction, sanction, usuario, razon);
                if (global.revokeReasons) delete global.revokeReasons[`${userId}_${requesterId}`];
            }
        } catch (error) {
            console.error('[SELECT_MENU] Error:', error);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(':x: Error al procesar la selección.').catch(() => {});
            } else {
                await interaction.reply({ content: ':x: Error al procesar la selección.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: /search-username
// ─────────────────────────────────────────────────────────────────────────────

async function handleSearchUsername(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const targetUser = interaction.options.getUser('usuario');
    const data = loadVerify();
    const link = data.links[targetUser.id];
    if (!link) {
        return interaction.editReply('❌ Este usuario no se verificó o no se encontró su nombre en la base de datos.');
    }
    const embed = new EmbedBuilder()
        .setColor(0x00b4d8)
        .setTitle('🔍 Resultado de búsqueda')
        .addFields(
            { name: 'Usuario de Discord', value: `<@${targetUser.id}>`, inline: true },
            { name: 'Usuario de Roblox', value: `**${link.roblox_user}**`, inline: true }
        )
        .setFooter({ text: 'ATF Verification System' });
    return interaction.editReply({ embeds: [embed] });
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: /resultado
// ─────────────────────────────────────────────────────────────────────────────
async function handleResultado(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        if (!await isModeratorOrAdmin(interaction.guild, interaction.user.id)) {
            return await interaction.editReply(':x: Solo los moderadores pueden usar este comando.');
        }

        const tipo = interaction.options.getString('tipo');
        const competicion = interaction.options.getString('competicion');
        const serie = interaction.options.getString('serie');
        const arbitro = interaction.options.getUser('arbitro');
        const streamer = interaction.options.getUser('streamer');
        const equipoLocal = interaction.options.getString('equipo_local');
        const equipoVisitante = interaction.options.getString('equipo_visitante');
        const estadio = interaction.options.getString('estadio') || null;

        const sessionId = `${interaction.user.id}_${Date.now()}`;

        resultadoSessions.set(sessionId, {
            competicion,
            serie,
            tipo,
            arbitroId: arbitro.id,
            streamerId: streamer.id,
            equipoLocal,
            equipoVisitante,
            estadio,
            golesLocal: 0,
            golesVisitante: 0,
            goles: [],
            sanciones: [],
            mvp: null,
            menciones: [],
            userId: interaction.user.id,
            timestamp: Date.now(),
            esIda: null,
            resultadoIda: null,
            currentGolLocal: 1,
            totalGolesLocal: 0,
            currentGolVisitante: 1,
            totalGolesVisitante: 0,
            marcadorLocal: 0,
            marcadorVisitante: 0,
            totalSanciones: 0,
            currentSancion: 1
        });

        if (tipo === 'ida_vuelta') {
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('📊 Tipo de Partido')
                .setDescription('**¿El partido está en ida o vuelta?**');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`partido_ida_${sessionId}`).setLabel('Ida').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`partido_vuelta_${sessionId}`).setLabel('Vuelta').setStyle(ButtonStyle.Success)
            );

            await interaction.editReply({ embeds: [embed], components: [row] });
        } else {
            await askFFT(interaction, sessionId);
        }

    } catch (error) {
        console.error('[RESULTADO] Error:', error);
        await interaction.editReply(':x: Error al procesar el comando.').catch(() => {});
    }
}

// Muestra el embed para ingresar goles del equipo local
async function mostrarEmbedGolesLocal(interaction, sessionId) {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('📊 Goles del Equipo Local')
        .setDescription('**Ingrese la cantidad de goles del equipo local**');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`goles_local_${sessionId}`).setLabel('Completar aquí').setStyle(ButtonStyle.Primary)
    );

    await updateOrFollowUp(interaction, { embeds: [embed], components: [row] });
}

// ─────────────────────────────────────────────────────────────────────────────
// FFT FLOW
// ─────────────────────────────────────────────────────────────────────────────

async function askFFT(interaction, sessionId) {
    const embed = new EmbedBuilder()
        .setColor('#ff6600')
        .setTitle('⚠️ FFT (Forfeit)')
        .setDescription('**¿El partido fue FFT (algún equipo no se presentó)?**');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fft_no_${sessionId}`).setLabel('No').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`fft_si_${sessionId}`).setLabel('Sí — FFT').setStyle(ButtonStyle.Danger)
    );

    await updateOrFollowUp(interaction, { embeds: [embed], components: [row] });
}

async function askFFTEquipo(interaction, sessionId) {
    const session = resultadoSessions.get(sessionId);
    if (!session) return interaction.reply({ content: 'Sesión expirada', flags: MessageFlags.Ephemeral });

    const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('🚩 ¿Qué equipo dio FFT?')
        .setDescription(
            `**Seleccioná el equipo que no se presentó:**\n\n` +
            `🏠 Local: **${session.equipoLocal}**\n` +
            `✈️ Visitante: **${session.equipoVisitante}**`
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`fft_equipo_local_${sessionId}`)
            .setLabel(`Local: ${session.equipoLocal}`)
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`fft_equipo_visitante_${sessionId}`)
            .setLabel(`Visitante: ${session.equipoVisitante}`)
            .setStyle(ButtonStyle.Secondary)
    );

    await updateOrFollowUp(interaction, { embeds: [embed], components: [row] });
}

async function handleFFTEquipo(interaction, sessionId, tipo) {
    const session = resultadoSessions.get(sessionId);
    if (!session) return interaction.reply({ content: 'Sesión expirada', flags: MessageFlags.Ephemeral });

    const esLocal = tipo === 'local';
    const equipoFFT = esLocal ? session.equipoLocal : session.equipoVisitante;

    session.fft = true;
    session.equipoFFT = equipoFFT;
    session.golesLocal = esLocal ? 0 : 3;
    session.golesVisitante = esLocal ? 3 : 0;
    session.goles = [];
    session.sanciones = [];
    session.mvp = null;
    session.menciones = [];

    resultadoSessions.set(sessionId, session);

    return showPreview(interaction, sessionId);
}

// Genera las líneas FFT para el mensaje de resultado
function getFFTLines(equipoFFT) {
    return (
        `> \`FFT.\` **${equipoFFT} no presentó el mínimo de jugadores al partido.**\n` +
        `> \`FFT.\` **${equipoFFT} did not present the minimum number of players for the match.**\n`
    );
}

async function handleButton(interaction) {
    const customId = interaction.customId;

    try {
        if (customId.startsWith('partido_ida_')) {
            const sessionId = customId.slice('partido_ida_'.length);
            const session = resultadoSessions.get(sessionId);
            if (!session) return interaction.reply({ content: 'Sesión expirada', flags: MessageFlags.Ephemeral });
            session.esIda = true;
            resultadoSessions.set(sessionId, session);
            return askFFT(interaction, sessionId);
        }

        if (customId.startsWith('partido_vuelta_')) {
            const sessionId = customId.slice('partido_vuelta_'.length);
            const session = resultadoSessions.get(sessionId);
            if (!session) return interaction.reply({ content: 'Sesión expirada', flags: MessageFlags.Ephemeral });
            session.esIda = false;
            resultadoSessions.set(sessionId, session);

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('📊 Resultado de la Ida')
                .setDescription('**Ingrese el resultado de la ida**\n\nFormato: `X - Y`\nEjemplo: `2 - 1`');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`resultado_ida_input_${sessionId}`).setLabel('Ingresar resultado').setStyle(ButtonStyle.Primary)
            );
            return interaction.update({ embeds: [embed], components: [row] });
        }

        if (customId.startsWith('resultado_ida_input_')) {
            const sessionId = customId.slice('resultado_ida_input_'.length);
            const modal = new ModalBuilder()
                .setCustomId(`resultado_ida_submit_${sessionId}`)
                .setTitle('Resultado de la Ida');
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('resultado').setLabel('Resultado (X - Y)').setStyle(TextInputStyle.Short).setPlaceholder('2 - 1').setRequired(true)
            ));
            return interaction.showModal(modal);
        }

        if (customId.startsWith('goles_local_')) {
            const sessionId = customId.slice('goles_local_'.length);
            const modal = new ModalBuilder()
                .setCustomId(`goles_local_count_${sessionId}`)
                .setTitle('Goles del Equipo Local');
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('cantidad_goles').setLabel('Cantidad de goles').setStyle(TextInputStyle.Short).setPlaceholder('0').setRequired(true)
            ));
            return interaction.showModal(modal);
        }

        if (customId.startsWith('goles_visitante_')) {
            const sessionId = customId.slice('goles_visitante_'.length);
            const modal = new ModalBuilder()
                .setCustomId(`goles_visitante_count_${sessionId}`)
                .setTitle('Goles del Equipo Visitante');
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('cantidad_goles').setLabel('Cantidad de goles').setStyle(TextInputStyle.Short).setPlaceholder('0').setRequired(true)
            ));
            return interaction.showModal(modal);
        }

        if (customId.startsWith('gol_detail_local_')) {
            const sessionId = customId.slice('gol_detail_local_'.length);
            return showGolDetailModal(interaction, sessionId, 'local');
        }

        if (customId.startsWith('gol_detail_visitante_')) {
            const sessionId = customId.slice('gol_detail_visitante_'.length);
            return showGolDetailModal(interaction, sessionId, 'visitante');
        }

        if (customId.startsWith('sanciones_cantidad_')) {
            const sessionId = customId.slice('sanciones_cantidad_'.length);
            const modal = new ModalBuilder()
                .setCustomId(`sanciones_count_${sessionId}`)
                .setTitle('Sanciones del Partido');
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('cantidad_sanciones').setLabel('Cantidad de sanciones').setStyle(TextInputStyle.Short).setPlaceholder('0').setRequired(true)
            ));
            return interaction.showModal(modal);
        }

        if (customId.startsWith('sancion_detail_')) {
            const sessionId = customId.slice('sancion_detail_'.length);
            return showSancionDetailModal(interaction, sessionId);
        }

        if (customId.startsWith('mvp_')) {
            const sessionId = customId.slice('mvp_'.length);
            return showMvpModal(interaction, sessionId);
        }

        if (customId.startsWith('menciones_')) {
            const sessionId = customId.slice('menciones_'.length);
            return showMencionesModal(interaction, sessionId);
        }

        if (customId.startsWith('publicar_')) {
            const sessionId = customId.slice('publicar_'.length);
            return publicarResultado(interaction, sessionId);
        }

        if (customId.startsWith('fft_no_')) {
            const sessionId = customId.slice('fft_no_'.length);
            const session = resultadoSessions.get(sessionId);
            if (!session) return interaction.reply({ content: 'Sesión expirada', flags: MessageFlags.Ephemeral });
            return mostrarEmbedGolesLocal(interaction, sessionId);
        }

        if (customId.startsWith('fft_si_')) {
            const sessionId = customId.slice('fft_si_'.length);
            return askFFTEquipo(interaction, sessionId);
        }

        if (customId.startsWith('fft_equipo_local_')) {
            const sessionId = customId.slice('fft_equipo_local_'.length);
            return handleFFTEquipo(interaction, sessionId, 'local');
        }

        if (customId.startsWith('fft_equipo_visitante_')) {
            const sessionId = customId.slice('fft_equipo_visitante_'.length);
            return handleFFTEquipo(interaction, sessionId, 'visitante');
        }

        if (customId.startsWith('config_msg_add_')) {
            return handleConfigMsgAddButton(interaction);
        }

        if (customId.startsWith('atftv_publicar_')) {
            const sessionId = customId.slice('atftv_publicar_'.length);
            return publicarAtfTv(interaction, sessionId);
        }

        if (customId.startsWith('fixture_enfrentamiento_')) {
            const sessionId = customId.slice('fixture_enfrentamiento_'.length);
            return showFixtureEnfrentamientoModal(interaction, sessionId);
        }

        if (customId.startsWith('fixture_publicar_')) {
            const sessionId = customId.slice('fixture_publicar_'.length);
            return publicarFixture(interaction, sessionId);
        }

        if (customId.startsWith('pred_enfrentamiento_')) {
            const sessionId = customId.slice('pred_enfrentamiento_'.length);
            return showPrediccionEnfrentamientoModal(interaction, sessionId);
        }

        if (customId.startsWith('pred_publicar_')) {
            const sessionId = customId.slice('pred_publicar_'.length);
            return publicarPredicciones(interaction, sessionId);
        }

        // Botones de votación de predicciones: pred_vote_{matchId}_{opcion}
        if (customId.startsWith('pred_vote_')) {
            return handlePrediccionVote(interaction);
        }

        // Botones filtro goleadores por división
        if (customId.startsWith('goleadores_')) {
            const divFilter = customId.replace('goleadores_', '');
            return sendGoleadoresEmbed(interaction, divFilter);
        }

        // Botones filtro asistencias por división
        if (customId.startsWith('asistencias_')) {
            const divFilter = customId.replace('asistencias_', '');
            return sendAsistenciasEmbed(interaction, divFilter);
        }

        // Botones de paginación de forces
        if (customId.startsWith('forces_prev_') || customId.startsWith('forces_next_')) {
            if (!await isModeratorOrAdmin(interaction.guild, interaction.user.id)) {
                return interaction.reply({ content: ':x: No tienes permiso.', flags: MessageFlags.Ephemeral });
            }
            const isPrev = customId.startsWith('forces_prev_');
            const currentPage = parseInt(customId.split('_')[2]);
            const newPage = isPrev ? currentPage - 1 : currentPage + 1;
            const forces = getForces();
            const entries = Object.entries(forces).sort((a, b) => b[1] - a[1]);
            const totalPages = Math.ceil(entries.length / FORCES_PER_PAGE);
            const embed = buildForcesEmbed(entries, newPage, totalPages);
            const components = buildForcesButtons(newPage, totalPages);
            return interaction.update({ embeds: [embed], components });
        }

        if (interaction.customId === 'verify_now') { 
            await handleVerifyButton(interaction); 
            return; 
        }


    } catch (error) {
        console.error('Error en handleButton:', error);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: ':x: Error al procesar el botón.', flags: MessageFlags.Ephemeral });
            }
        } catch (e) {}
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MODALS
// ─────────────────────────────────────────────────────────────────────────────
async function showGolDetailModal(interaction, sessionId, tipo) {
    const session = resultadoSessions.get(sessionId);
    if (!session) {
        return interaction.reply({ content: 'Sesión expirada', flags: MessageFlags.Ephemeral });
    }

    const golNumber = tipo === 'local' ? session.currentGolLocal : session.currentGolVisitante;
    const equipo = tipo === 'local' ? session.equipoLocal : session.equipoVisitante;

    const modal = new ModalBuilder()
        .setCustomId(`gol_detail_submit_${tipo}_${sessionId}`)
        .setTitle(`Gol #${golNumber} - ${equipo}`);

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('jugador').setLabel('ID del jugador que anotó').setStyle(TextInputStyle.Short).setPlaceholder('123456789012345678').setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('asistencia').setLabel('ID del asistente (0 si no hay)').setStyle(TextInputStyle.Short).setPlaceholder('123456789012345678 o 0').setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('minuto').setLabel('Minuto del gol').setStyle(TextInputStyle.Short).setPlaceholder('45').setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('tipo_gol').setLabel('Tipo (normal / golencontra / penal)').setStyle(TextInputStyle.Short).setPlaceholder('normal').setRequired(true)
        )
    );

    await interaction.showModal(modal);
}

async function showSancionDetailModal(interaction, sessionId) {
    const session = resultadoSessions.get(sessionId);
    if (!session) {
        return interaction.reply({ content: 'Sesión expirada', flags: MessageFlags.Ephemeral });
    }

    const modal = new ModalBuilder()
        .setCustomId(`sancion_detail_submit_${sessionId}`)
        .setTitle(`Sanción #${session.currentSancion}`);

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('jugador').setLabel('ID del jugador sancionado').setStyle(TextInputStyle.Short).setPlaceholder('123456789012345678').setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('equipo').setLabel('Equipo del jugador').setStyle(TextInputStyle.Short).setPlaceholder(session.equipoLocal).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('tarjeta').setLabel('Tarjeta (amarilla / roja / doble)').setStyle(TextInputStyle.Short).setPlaceholder('amarilla').setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('razon').setLabel('Razón de la sanción').setStyle(TextInputStyle.Short).setPlaceholder('Falta violenta').setRequired(true)
        )
    );

    await interaction.showModal(modal);
}

async function showMvpModal(interaction, sessionId) {
    const session = resultadoSessions.get(sessionId);
    if (!session) {
        return interaction.reply({ content: 'Sesión expirada', flags: MessageFlags.Ephemeral });
    }

    const modal = new ModalBuilder()
        .setCustomId(`mvp_submit_${sessionId}`)
        .setTitle('Man of the Match');

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('jugador').setLabel('ID del MVP').setStyle(TextInputStyle.Short).setPlaceholder('123456789012345678').setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('equipo').setLabel('Equipo del MVP').setStyle(TextInputStyle.Short).setPlaceholder(session.equipoLocal).setRequired(true)
        )
    );

    await interaction.showModal(modal);
}

async function showMencionesModal(interaction, sessionId) {
    const session = resultadoSessions.get(sessionId);
    if (!session) {
        return interaction.reply({ content: 'Sesión expirada', flags: MessageFlags.Ephemeral });
    }

    const modal = new ModalBuilder()
        .setCustomId(`menciones_submit_${sessionId}`)
        .setTitle('Menciones del Partido');

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('mencion1').setLabel('1ra Mención (ID | Equipo)').setStyle(TextInputStyle.Short).setPlaceholder('123456789012345678 | CJA').setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('mencion2').setLabel('2da Mención (ID | Equipo)').setStyle(TextInputStyle.Short).setPlaceholder('123456789012345678 | SiuFC').setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('mencion3').setLabel('3ra Mención (ID | Equipo)').setStyle(TextInputStyle.Short).setPlaceholder('123456789012345678 | Kunts FC').setRequired(false)
        )
    );

    await interaction.showModal(modal);
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER DE MODALS
// ─────────────────────────────────────────────────────────────────────────────
async function handleModal(interaction) {
    const customId = interaction.customId;

    try {
        if (customId.startsWith('resultado_ida_submit_')) {
            return handleResultadoIdaSubmit(interaction);
        }
        if (customId.startsWith('goles_local_count_') || customId.startsWith('goles_visitante_count_')) {
            return handleGolesCountModal(interaction);
        }
        if (customId.startsWith('gol_detail_submit_')) {
            return handleGolDetailModal(interaction);
        }
        if (customId.startsWith('sanciones_count_')) {
            return handleSancionesCountModal(interaction);
        }
        if (customId.startsWith('sancion_detail_submit_')) {
            return handleSancionDetailModal(interaction);
        }
        if (customId.startsWith('mvp_submit_')) {
            return handleMvpModal(interaction);
        }
        if (customId.startsWith('menciones_submit_')) {
            return handleMencionesModal(interaction);
        }
        if (customId.startsWith('config_msg_submit_')) {
            return handleConfigMsgSubmit(interaction);
        }
        if (customId.startsWith('fixture_enfrentamiento_submit_')) {
            return handleFixtureEnfrentamientoModal(interaction);
        }
        if (customId.startsWith('pred_enfrentamiento_submit_')) {
            return handlePrediccionEnfrentamientoModal(interaction);
        }
    } catch (error) {
        console.error('[MODAL] Error:', error);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: ':x: Error al procesar el formulario.', flags: MessageFlags.Ephemeral });
            } else {
                await interaction.followUp({ content: ':x: Error al procesar el formulario.', flags: MessageFlags.Ephemeral });
            }
        } catch (e) {}
    }
}

async function handleResultadoIdaSubmit(interaction) {
    const sessionId = interaction.customId.slice('resultado_ida_submit_'.length);
    const session = resultadoSessions.get(sessionId);
    if (!session) {
        return interaction.reply({ content: 'Sesión expirada', flags: MessageFlags.Ephemeral });
    }

    const texto = interaction.fields.getTextInputValue('resultado');
    const match = texto.match(/(\d+)\s*-\s*(\d+)/);
    if (!match) {
        return interaction.reply({ content: ':x: Formato inválido. Usa: `X - Y` (ej: `2 - 1`)', flags: MessageFlags.Ephemeral });
    }

    session.resultadoIda = { local: parseInt(match[1]), visitante: parseInt(match[2]) };
    resultadoSessions.set(sessionId, session);

    await askFFT(interaction, sessionId);
}

async function handleGolesCountModal(interaction) {
    const customId = interaction.customId;
    const esLocal = customId.startsWith('goles_local_count_');
    const tipo = esLocal ? 'local' : 'visitante';
    const sessionId = esLocal
        ? customId.slice('goles_local_count_'.length)
        : customId.slice('goles_visitante_count_'.length);

    const session = resultadoSessions.get(sessionId);
    if (!session) {
        return interaction.reply({ content: 'Sesión expirada', flags: MessageFlags.Ephemeral });
    }

    const cantidadRaw = interaction.fields.getTextInputValue('cantidad_goles');
    const cantidadGoles = parseInt(cantidadRaw);
    if (isNaN(cantidadGoles) || cantidadGoles < 0) {
        return interaction.reply({ content: ':x: Ingresa un número válido.', flags: MessageFlags.Ephemeral });
    }

    if (tipo === 'local') {
        session.golesLocal = cantidadGoles;
        session.currentGolLocal = 1;
        session.totalGolesLocal = cantidadGoles;
    } else {
        session.golesVisitante = cantidadGoles;
        session.currentGolVisitante = 1;
        session.totalGolesVisitante = cantidadGoles;
    }
    resultadoSessions.set(sessionId, session);

    if (cantidadGoles === 0) {
        if (tipo === 'local') return askGolesVisitante(interaction, sessionId);
        else return askSanciones(interaction, sessionId);
    } else {
        return askGolDetails(interaction, sessionId, tipo);
    }
}

async function askGolDetails(interaction, sessionId, tipo) {
    const session = resultadoSessions.get(sessionId);
    const golNumber = tipo === 'local' ? session.currentGolLocal : session.currentGolVisitante;
    const totalGoles = tipo === 'local' ? session.totalGolesLocal : session.totalGolesVisitante;
    const equipo = tipo === 'local' ? session.equipoLocal : session.equipoVisitante;

    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('⚽ Detalle del Gol')
        .setDescription(`**Gol ${golNumber} de ${totalGoles}**`)
        .addFields({ name: 'Equipo', value: `${getTeamEmoji(equipo)} ${equipo}` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`gol_detail_${tipo}_${sessionId}`)
            .setLabel('Completar aquí')
            .setStyle(ButtonStyle.Success)
    );

    await updateOrFollowUp(interaction, { embeds: [embed], components: [row] });
}

async function handleGolDetailModal(interaction) {
    const customId = interaction.customId;
    const withoutPrefix = customId.slice('gol_detail_submit_'.length);
    const tipo = withoutPrefix.startsWith('local_') ? 'local' : 'visitante';
    const sessionId = withoutPrefix.slice(tipo.length + 1);

    const session = resultadoSessions.get(sessionId);
    if (!session) {
        return interaction.reply({ content: 'Sesión expirada', flags: MessageFlags.Ephemeral });
    }

    const jugadorRaw = interaction.fields.getTextInputValue('jugador').trim();
    const asistenciaRaw = interaction.fields.getTextInputValue('asistencia').trim();
    const minuto = interaction.fields.getTextInputValue('minuto').trim();
    const tipoGol = interaction.fields.getTextInputValue('tipo_gol').trim().toLowerCase();

    const jugadorId = parseUserId(jugadorRaw);
    const asistenciaId = (asistenciaRaw === '0' || asistenciaRaw === '') ? null : parseUserId(asistenciaRaw);

    if (!jugadorId) {
        return interaction.reply({ content: ':x: ID del jugador inválido.', flags: MessageFlags.Ephemeral });
    }

    const equipo = tipo === 'local' ? session.equipoLocal : session.equipoVisitante;

    if (tipo === 'local') {
        session.marcadorLocal = (session.marcadorLocal || 0) + 1;
    } else {
        session.marcadorVisitante = (session.marcadorVisitante || 0) + 1;
    }
    const marcador = `${session.marcadorLocal || 0}-${session.marcadorVisitante || 0}`;

    session.goles.push({
        jugadorId,
        asistenciaId,
        minuto,
        equipo,
        tipo: tipoGol,
        marcador
    });

    if (tipo === 'local') session.currentGolLocal++;
    else session.currentGolVisitante++;

    resultadoSessions.set(sessionId, session);

    const currentGol = tipo === 'local' ? session.currentGolLocal : session.currentGolVisitante;
    const totalGoles = tipo === 'local' ? session.totalGolesLocal : session.totalGolesVisitante;

    if (currentGol <= totalGoles) {
        return askGolDetails(interaction, sessionId, tipo);
    } else {
        if (tipo === 'local') return askGolesVisitante(interaction, sessionId);
        else return askSanciones(interaction, sessionId);
    }
}

async function askGolesVisitante(interaction, sessionId) {
    const session = resultadoSessions.get(sessionId);

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('📊 Goles del Visitante')
        .setDescription('**Ingrese la cantidad de goles del equipo visitante**')
        .addFields({ name: 'Equipo Visitante', value: `${getTeamEmoji(session.equipoVisitante)} ${session.equipoVisitante}` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`goles_visitante_${sessionId}`).setLabel('Completar aquí').setStyle(ButtonStyle.Primary)
    );

    await updateOrFollowUp(interaction, { embeds: [embed], components: [row] });
}

async function askSanciones(interaction, sessionId) {
    const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('🟨🟥 Sanciones')
        .setDescription('**Ingrese la cantidad de sanciones en el partido**');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`sanciones_cantidad_${sessionId}`).setLabel('Completar aquí').setStyle(ButtonStyle.Danger)
    );

    await updateOrFollowUp(interaction, { embeds: [embed], components: [row] });
}

async function handleSancionesCountModal(interaction) {
    const sessionId = interaction.customId.slice('sanciones_count_'.length);
    const session = resultadoSessions.get(sessionId);
    if (!session) {
        return interaction.reply({ content: 'Sesión expirada', flags: MessageFlags.Ephemeral });
    }

    const cantidadSanciones = parseInt(interaction.fields.getTextInputValue('cantidad_sanciones'));
    session.totalSanciones = isNaN(cantidadSanciones) ? 0 : cantidadSanciones;
    session.currentSancion = 1;
    resultadoSessions.set(sessionId, session);

    if (session.totalSanciones === 0) return askMvp(interaction, sessionId);
    else return askSancionDetail(interaction, sessionId);
}

async function askSancionDetail(interaction, sessionId) {
    const session = resultadoSessions.get(sessionId);

    const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('🟨🟥 Detalle de Sanción')
        .setDescription(`**Sanción ${session.currentSancion} de ${session.totalSanciones}**`);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`sancion_detail_${sessionId}`).setLabel('Completar aquí').setStyle(ButtonStyle.Danger)
    );

    await updateOrFollowUp(interaction, { embeds: [embed], components: [row] });
}

async function handleSancionDetailModal(interaction) {
    const sessionId = interaction.customId.slice('sancion_detail_submit_'.length);
    const session = resultadoSessions.get(sessionId);
    if (!session) {
        return interaction.reply({ content: 'Sesión expirada', flags: MessageFlags.Ephemeral });
    }

    const jugadorRaw = interaction.fields.getTextInputValue('jugador').trim();
    const equipoRaw = interaction.fields.getTextInputValue('equipo').trim();
    const tarjeta = interaction.fields.getTextInputValue('tarjeta').trim().toLowerCase();
    const razon = interaction.fields.getTextInputValue('razon').trim();

    const jugadorId = parseUserId(jugadorRaw);
    if (!jugadorId) {
        return interaction.reply({ content: ':x: ID del jugador inválido.', flags: MessageFlags.Ephemeral });
    }

    // Búsqueda flexible de equipo (case-insensitive, sin espacios)
    const equipoNombre = findTeamName(equipoRaw) || equipoRaw;

    session.sanciones.push({ jugadorId, equipo: equipoNombre, tarjeta, razon });
    session.currentSancion++;
    resultadoSessions.set(sessionId, session);

    if (session.currentSancion <= session.totalSanciones) return askSancionDetail(interaction, sessionId);
    else return askMvp(interaction, sessionId);
}

async function askMvp(interaction, sessionId) {
    const embed = new EmbedBuilder()
        .setColor('#ffd700')
        .setTitle('⭐ Man of the Match')
        .setDescription('**Ingrese el MVP del partido**');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`mvp_${sessionId}`).setLabel('Completar aquí').setStyle(ButtonStyle.Success)
    );

    await updateOrFollowUp(interaction, { embeds: [embed], components: [row] });
}

async function handleMvpModal(interaction) {
    const sessionId = interaction.customId.slice('mvp_submit_'.length);
    const session = resultadoSessions.get(sessionId);
    if (!session) {
        return interaction.reply({ content: 'Sesión expirada', flags: MessageFlags.Ephemeral });
    }

    const jugadorRaw = interaction.fields.getTextInputValue('jugador').trim();
    const equipoRaw = interaction.fields.getTextInputValue('equipo').trim();
    const jugadorId = parseUserId(jugadorRaw);

    if (!jugadorId) {
        return interaction.reply({ content: ':x: ID del MVP inválido.', flags: MessageFlags.Ephemeral });
    }

    // Búsqueda flexible de equipo (case-insensitive, sin espacios)
    const equipoNombre = findTeamName(equipoRaw) || equipoRaw;
    session.mvp = { jugadorId, equipo: equipoNombre };
    resultadoSessions.set(sessionId, session);

    return askMenciones(interaction, sessionId);
}

async function askMenciones(interaction, sessionId) {
    const embed = new EmbedBuilder()
        .setColor('#c0c0c0')
        .setTitle('🏅 Menciones Honoríficas')
        .setDescription('**Ingrese las menciones del partido**\n\nFormato: `ID | Equipo`');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`menciones_${sessionId}`).setLabel('Completar aquí').setStyle(ButtonStyle.Secondary)
    );

    await updateOrFollowUp(interaction, { embeds: [embed], components: [row] });
}

async function handleMencionesModal(interaction) {
    const sessionId = interaction.customId.slice('menciones_submit_'.length);
    const session = resultadoSessions.get(sessionId);
    if (!session) {
        return interaction.reply({ content: 'Sesión expirada', flags: MessageFlags.Ephemeral });
    }

    const parseMencion = (text) => {
        if (!text || text.trim() === '') return null;
        const parts = text.split('|').map(p => p.trim());
        const jugadorId = parseUserId(parts[0]);
        // Búsqueda flexible de equipo (case-insensitive, sin espacios)
        const equipoEncontrado = findTeamName(parts[1] || '');
        const equipo = equipoEncontrado || (parts[1] || session.equipoLocal);
        return jugadorId ? { jugadorId, equipo } : null;
    };

    const menciones = [
        parseMencion(interaction.fields.getTextInputValue('mencion1')),
        parseMencion(interaction.fields.getTextInputValue('mencion2')),
        parseMencion(interaction.fields.getTextInputValue('mencion3'))
    ].filter(Boolean);

    session.menciones = menciones;
    resultadoSessions.set(sessionId, session);

    return showPreview(interaction, sessionId);
}

async function showPreview(interaction, sessionId) {
    const session = resultadoSessions.get(sessionId);
    const message = generateResultMessage(session);

    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('✅ Preview del Resultado')
        .setDescription('**Revise el resultado antes de publicar:**\n\n' + message.substring(0, 4000));

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`publicar_${sessionId}`).setLabel('✅ Publicar').setStyle(ButtonStyle.Success)
    );

    await updateOrFollowUp(interaction, { embeds: [embed], components: [row] });
}

async function publicarResultado(interaction, sessionId) {
    const session = resultadoSessions.get(sessionId);
    if (!session) {
        return interaction.reply({ content: 'Sesión expirada', flags: MessageFlags.Ephemeral });
    }

    const channelId = RESULT_CHANNELS[session.competicion];
    if (!channelId) {
        return interaction.update({ content: ':x: No se encontró el canal para esta competición.', embeds: [], components: [] });
    }

    const channel = interaction.guild.channels.cache.get(channelId);
    if (!channel) {
        return interaction.update({ content: ':x: No se pudo encontrar el canal.', embeds: [], components: [] });
    }

    const message = generateResultMessage(session);

    try {
        await channel.send(message);

        saveResultado(session);

        // ── Auto-sancionar equipo FFT ─────────────────────────────────────────
        if (session.fft && session.equipoFFT) {
            try {
                await autoSancionarEquipoFFT(interaction, session.equipoFFT);
            } catch (err) {
                console.error('[AUTO-SANCION-TEAM-FFT] Error:', err);
            }
        }

        // ── Auto-sancionar jugadores con tarjeta roja o doble amarilla ────
        const sanctionChannel = interaction.guild.channels.cache.get(SANCTION_CHANNEL);
        const db = loadDatabase();
        if (!db.sanctionCounter) db.sanctionCounter = 0;

        for (const s of (session.sanciones || [])) {
            const esRoja = s.tarjeta === 'roja' || s.tarjeta.includes('doble');
            if (!esRoja) continue;

            try {
                const member = await interaction.guild.members.fetch(s.jugadorId).catch(() => null);
                if (!member) continue;

                const activeSanctions = getUserActiveSanctions(s.jugadorId);
                const numero = activeSanctions.length === 0 ? 1 : Math.max(...activeSanctions.map(x => x.numero)) + 1;

                const tipo = '1 GW';
                const razonSancion = s.tarjeta.includes('doble') ? 'Doble amarilla = Roja' : 'Tarjeta roja';

                const emojiSancion = SANCTION_EMOJIS.sancion;
                const sanctionData = SANCTION_TYPES[tipo];

                let sentMessage = null;
                if (sanctionChannel) {
                    sentMessage = await sanctionChannel.send(
                        `## ${emojiSancion} SANCIÓN #${numero} ${emojiSancion}\n` +
                        `- **Usuario: <@${s.jugadorId}>**\n` +
                        `- **Razón: ${razonSancion}**\n` +
                        `- **Duración: ${sanctionData.duration}**\n` +
                        `- **Duración Restante: ${sanctionData.gw} GW**\n` +
                        `- **Estado: Activa**\n` +
                        `-# *(Sanción automática por tarjeta roja en partido: ${session.equipoLocal} vs ${session.equipoVisitante})*`
                    );
                }

                createSanction(s.jugadorId, numero, tipo, razonSancion, sentMessage ? sentMessage.id : null);

                if (!member.roles.cache.has(SANCIONADO_ROLE)) {
                    await member.roles.add(SANCIONADO_ROLE);
                }

                const logsChannel = interaction.guild.channels.cache.get(SANCTION_LOGS_CHANNEL);
                if (logsChannel) {
                    await logsChannel.send(`**AUTO-SANCIÓN** | **USUARIO:** <@${s.jugadorId}> **| RAZÓN:** ${razonSancion} **| PARTIDO:** ${session.equipoLocal} vs ${session.equipoVisitante}`);
                }

                console.log(`[AUTO-SANCION] Sancionado <@${s.jugadorId}> por tarjeta roja (${s.tarjeta})`);
            } catch (err) {
                console.error(`[AUTO-SANCION] Error al sancionar jugador ${s.jugadorId}:`, err);
            }
        }

        await updateOrFollowUp(interaction, { content: ':white_check_mark: ¡Resultado publicado exitosamente!', embeds: [], components: [] });
        resultadoSessions.delete(sessionId);
    } catch (error) {
        console.error('Error al publicar resultado:', error);
        await updateOrFollowUp(interaction, { content: ':x: Error al publicar el resultado.', embeds: [], components: [] });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLERS DE OTROS COMANDOS
// ─────────────────────────────────────────────────────────────────────────────

async function handleFichaje(interaction) {
    if (!await isModeratorOrAdmin(interaction.guild, interaction.user.id)) {
        return interaction.reply({ content: ':x: Solo los moderadores pueden usar este comando.', ephemeral: true });
    }
    await interaction.deferReply();

    const usuario = interaction.options.getUser('usuario');
    const equipo = interaction.options.getString('equipo');
    const gw = interaction.options.getInteger('gw');
    const pais = interaction.options.getString('pais');
    const division = interaction.options.getString('division');

    if (!TEAM_ROLES[equipo]) return interaction.editReply(':x: El equipo especificado no existe.');

    const member = await interaction.guild.members.fetch(usuario.id);

    if (member.roles.cache.has(MISC_ROLES["Sancionado"])) return interaction.editReply(':x: Este jugador está sancionado y no puede ser fichado.');
    if (!member.roles.cache.has(MISC_ROLES["DoubleAuth"])) return interaction.editReply(':x: Este jugador no tiene el rol DoubleAuth.');

    const playerInfo = getPlayerInfo(usuario.id);
    if (playerInfo) return interaction.editReply(`:x: ${usuario} ya tiene un contrato activo en ${playerInfo.team} con ${playerInfo.gw} GW restantes.`);

    const teamPlayers = getTeamPlayers(equipo);
    if (teamPlayers.length >= 12) return interaction.editReply(`:x: ${equipo} ya tiene 12 jugadores.`);

    const divisionLetter = division.split(' ')[1];
    setPlayerInfo(usuario.id, equipo, gw, pais, divisionLetter);

    await member.roles.add([TEAM_ROLES[equipo], DIVISION_ROLES[division]]);
    if (member.roles.cache.has(MISC_ROLES["Agente Libre"])) await member.roles.remove(MISC_ROLES["Agente Libre"]);

    await interaction.editReply(`:white_check_mark: ${usuario} ha sido fichado por ${equipo} con un contrato de ${gw} GW.`);

    const mercadoChannel = interaction.guild.channels.cache.get(CHANNELS.mercado);
    if (mercadoChannel) {
        const teamEmoji = getTeamEmoji(equipo);
        const divisionEmoji = getDivisionEmoji(`División ${divisionLetter}`);
        await mercadoChannel.send(`${teamEmoji} **FICHAJE** ${teamEmoji}\n**User:** ${usuario}\n**Division:** ${divisionEmoji}\n**País:** ${pais}\n**GW:** ${gw}`);
    }

    await updateSquadsheet(interaction.guild, equipo);
}

async function handleRelease(interaction) {
    if (!await isModeratorOrAdmin(interaction.guild, interaction.user.id)) {
        return interaction.reply({ content: ':x: Solo los moderadores pueden usar este comando.', ephemeral: true });
    }
    await interaction.deferReply();

    const usuario = interaction.options.getUser('usuario');
    const razon = interaction.options.getString('razon');
    const playerInfo = getPlayerInfo(usuario.id);

    if (!playerInfo) return interaction.editReply(`:x: ${usuario} no está en ningún equipo.`);
    if (playerInfo.gw > 0) return interaction.editReply(`:x: ${usuario} aún tiene ${playerInfo.gw} GW restantes. Usa \`/forcerelease\`.`);

    const { team: teamName, division, country } = playerInfo;
    removePlayerInfo(usuario.id);

    const member = await interaction.guild.members.fetch(usuario.id);
    const rolesToRemove = [TEAM_ROLES[teamName], DIVISION_ROLES[`División ${division}`], MISC_ROLES["Dueño De Club"], MISC_ROLES["Manager"], MISC_ROLES["Assistant Manager"]].filter(r => member.roles.cache.has(r));
    await member.roles.remove(rolesToRemove);
    await member.roles.add(MISC_ROLES["Agente Libre"]);

    await interaction.editReply(`:white_check_mark: ${usuario} ha sido liberado de ${teamName}.`);

    const mercadoChannel = interaction.guild.channels.cache.get(CHANNELS.mercado);
    if (mercadoChannel) {
        await mercadoChannel.send(`${getTeamEmoji(teamName)} **RELEASE** ${getTeamEmoji(teamName)}\n**User:** ${usuario}\n**Division:** ${getDivisionEmoji(`División ${division}`)}\n**País:** ${country}\n**Razón:** **${razon}**`);
    }

    await updateSquadsheet(interaction.guild, teamName);
}

async function handleForceRelease(interaction) {
    if (!await isModeratorOrAdmin(interaction.guild, interaction.user.id)) {
        return interaction.reply({ content: ':x: Solo los moderadores pueden usar este comando.', ephemeral: true });
    }
    await interaction.deferReply();

    const usuario = interaction.options.getUser('usuario');
    const razon = interaction.options.getString('razon');
    const playerInfo = getPlayerInfo(usuario.id);

    if (!playerInfo) return interaction.editReply(`:x: ${usuario} no está en ningún equipo.`);

    const { team: teamName, division, country } = playerInfo;
    removePlayerInfo(usuario.id);

    const member = await interaction.guild.members.fetch(usuario.id);
    const rolesToRemove = [TEAM_ROLES[teamName], DIVISION_ROLES[`División ${division}`], MISC_ROLES["Dueño De Club"], MISC_ROLES["Manager"], MISC_ROLES["Assistant Manager"]].filter(r => member.roles.cache.has(r));
    await member.roles.remove(rolesToRemove);
    await member.roles.add(MISC_ROLES["Agente Libre"]);

    await interaction.editReply(`:white_check_mark: ${usuario} ha sido liberado de ${teamName}.`);

    const mercadoChannel = interaction.guild.channels.cache.get(CHANNELS.mercado);
    if (mercadoChannel) {
        await mercadoChannel.send(`${getTeamEmoji(teamName)} **FORCE RELEASE** ${getTeamEmoji(teamName)}\n**User:** ${usuario}\n**Division:** ${getDivisionEmoji(`División ${division}`)}\n**País:** ${country}\n**Razón:** **${razon}**`);
    }

    await updateSquadsheet(interaction.guild, teamName);
}

async function handlePlayerRole(interaction) {
    if (!await isModeratorOrAdmin(interaction.guild, interaction.user.id)) {
        return interaction.reply({ content: ':x: Solo los moderadores pueden usar este comando.', ephemeral: true });
    }
    await interaction.deferReply();

    const usuario = interaction.options.getUser('usuario');
    const nuevoRol = interaction.options.getString('nuevo_rol');
    const playerInfo = getPlayerInfo(usuario.id);

    if (!playerInfo) return interaction.editReply(`:x: ${usuario} no está en ningún equipo.`);

    const { role: rolActual, team: teamName, division, country } = playerInfo;
    const rolesHierarchy = ["Jugador", "Assistant Manager", "Manager", "Dueño"];
    const tipo = rolesHierarchy.indexOf(nuevoRol) > rolesHierarchy.indexOf(rolActual) ? "ASCENSO" : "DESCENSO";

    updatePlayerRole(usuario.id, nuevoRol);

    const member = await interaction.guild.members.fetch(usuario.id);
    const rolesToRemove = [MISC_ROLES["Dueño De Club"], MISC_ROLES["Manager"], MISC_ROLES["Assistant Manager"]].filter(r => member.roles.cache.has(r));
    if (rolesToRemove.length > 0) await member.roles.remove(rolesToRemove);

    if (nuevoRol === "Dueño") await member.roles.add(MISC_ROLES["Dueño De Club"]);
    else if (nuevoRol === "Manager") await member.roles.add(MISC_ROLES["Manager"]);
    else if (nuevoRol === "Assistant Manager") await member.roles.add(MISC_ROLES["Assistant Manager"]);

    await interaction.editReply(`:white_check_mark: El rol de ${usuario} en ${teamName} ha sido cambiado a ${nuevoRol}.`);

    const mercadoChannel = interaction.guild.channels.cache.get(CHANNELS.mercado);
    if (mercadoChannel) {
        await mercadoChannel.send(`${getTeamEmoji(teamName)} **${tipo}** ${getTeamEmoji(teamName)}\n**User:** ${usuario}\n**Division:** ${getDivisionEmoji(`División ${division}`)}\n**País:** ${country}\n**Nuevo Rol:** **${nuevoRol}**`);
    }

    await updateSquadsheet(interaction.guild, teamName);
}

async function handlePassGW(interaction) {
    if (!await isModeratorOrAdmin(interaction.guild, interaction.user.id)) {
        return interaction.reply({ content: ':x: Solo los moderadores pueden usar este comando.', ephemeral: true });
    }
    await interaction.deferReply();

    const equipo = interaction.options.getString('equipo');
    if (!TEAM_ROLES[equipo]) return interaction.editReply(':x: El equipo especificado no existe.');

    const players = getTeamPlayers(equipo);
    if (players.length === 0) return interaction.editReply(`:x: ${equipo} no tiene jugadores.`);

    let count = 0;
    for (const player of players) {
        if (player.role !== "Dueño") {
            updatePlayerGW(player.userId, Math.max(0, player.gw - 1));
            count++;
        }
    }

    await interaction.editReply(`:white_check_mark: Se ha pasado de fecha en ${equipo}. Se restó 1 GW a ${count} jugadores.`);
    await updateSquadsheet(interaction.guild, equipo);
}

async function handleLeftRelease(interaction) {
    if (!await isModeratorOrAdmin(interaction.guild, interaction.user.id)) {
        return interaction.reply({ content: ':x: Solo los moderadores pueden usar este comando.', ephemeral: true });
    }
    await interaction.deferReply();

    const userId = interaction.options.getString('user_id');
    const razon = interaction.options.getString('razon');
    const playerInfo = getPlayerInfo(userId);

    if (!playerInfo) return interaction.editReply(`:x: El usuario con ID ${userId} no está en ningún equipo.`);

    const { team: teamName, division, country } = playerInfo;
    removePlayerInfo(userId);

    await interaction.editReply(`:white_check_mark: El usuario <@${userId}> ha sido liberado de ${teamName}.`);

    const mercadoChannel = interaction.guild.channels.cache.get(CHANNELS.mercado);
    if (mercadoChannel) {
        await mercadoChannel.send(`${getTeamEmoji(teamName)} **FORCE RELEASE** ${getTeamEmoji(teamName)}\n**User:** <@${userId}>\n**Division:** ${getDivisionEmoji(`División ${division}`)}\n**País:** ${country}\n**Razón:** **${razon}**`);
    }

    await updateSquadsheet(interaction.guild, teamName);
}

async function handleSancion(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        if (!await isModeratorOrAdmin(interaction.guild, interaction.user.id)) {
            return interaction.editReply(':x: Solo los moderadores pueden usar este comando.');
        }

        const numero = interaction.options.getInteger('numero');
        const usuario = interaction.options.getUser('usuario');
        const razon = interaction.options.getString('razon');

        // Derivar tipo/precio/gw desde la razón
        const reasonData = getSanctionDataByReason(razon);
        if (!reasonData) return interaction.editReply(':x: Razón de sanción no reconocida.');

        const activeSanctions = getUserActiveSanctions(usuario.id);
        const numeroEsperado = activeSanctions.length === 0 ? 1 : Math.max(...activeSanctions.map(s => s.numero)) + 1;

        if (numero !== numeroEsperado) {
            return interaction.editReply(
                `:x: Error: El usuario ${activeSanctions.length === 0 ? 'no tiene sanciones activas' : `tiene ${activeSanctions.length} sanción(es) activa(s)`}.\n` +
                `El número de sanción debe ser: **#${numeroEsperado}**`
            );
        }

        const member = await interaction.guild.members.fetch(usuario.id);
        const sanctionChannel = interaction.guild.channels.cache.get(SANCTION_CHANNEL);
        if (!sanctionChannel) return interaction.editReply(':x: No se encontró el canal de sanciones.');

        const emojiSancion = SANCTION_EMOJIS.sancion;
        const duracionRestante = reasonData.gw !== null ? `${reasonData.gw} GW` : reasonData.duration;

        const sanctionMessage =
            `## ${emojiSancion} SANCIÓN #${numero} ${emojiSancion}\n` +
            `- **Usuario: ${usuario}**\n` +
            `- **Razón: ${razon}**\n` +
            `- **Duración: ${reasonData.duration}**\n` +
            `- **Duración Restante: ${duracionRestante}**\n` +
            `- **Precio: ${reasonData.price} rbx**\n` +
            `- **Estado: Activa**`;

        const sentMessage = await sanctionChannel.send(sanctionMessage);

        // Guardar usando SANCTION_TYPES si existe, sino construir ad-hoc
        const db = loadDatabase();
        if (!db.sanctions) db.sanctions = {};
        if (!db.sanctionCounter) db.sanctionCounter = 0;
        const sanctionId = `sanction_${Date.now()}_${numero}`;
        db.sanctions[sanctionId] = {
            id: sanctionId,
            numero,
            userId: usuario.id,
            tipo: reasonData.tipo,
            razon,
            precio: reasonData.price,
            duracion: reasonData.duration,
            duracion_restante: reasonData.gw !== null ? reasonData.gw : reasonData.duration,
            gw: reasonData.gw,
            estado: "Activa",
            messageId: sentMessage.id,
            timestamp: Date.now()
        };
        db.sanctionCounter = Math.max(db.sanctionCounter, numero);
        fs.writeFileSync(DATABASE_FILE, JSON.stringify(db, null, 4), 'utf-8');

        const logsChannel = interaction.guild.channels.cache.get(SANCTION_LOGS_CHANNEL);
        if (logsChannel) await logsChannel.send(`**ID:** \`${sanctionId}\` **| USUARIO:** ${usuario} **| TIPO:** ${reasonData.tipo} **| RAZÓN:** ${razon} **| DURACIÓN:** ${reasonData.duration} **| PRECIO:** ${reasonData.price}rbx`);

        if (!member.roles.cache.has(SANCIONADO_ROLE)) await member.roles.add(SANCIONADO_ROLE);

        // DM al sancionado (español + inglés)
        try {
            const dmES =
                `🚨 **Has sido sancionado de ATF.**\n\n` +
                `**Razón:** ${razon}\n` +
                `**Tipo:** ${reasonData.tipo}\n` +
                `**Duración:** ${reasonData.duration}\n` +
                `**Precio:** ${reasonData.price} rbx\n\n` +
                `Para apelar, entra al siguiente servidor: https://discord.gg/AGjJSCknc9`;

            const dmEN =
                `🚨 **You have been sanctioned from ATF.**\n\n` +
                `**Reason:** ${razon}\n` +
                `**Type:** ${reasonData.tipo}\n` +
                `**Duration:** ${reasonData.duration}\n` +
                `**Price:** ${reasonData.price} rbx\n\n` +
                `To appeal, join the following server: https://discord.gg/AGjJSCknc9`;

            await usuario.send(`${dmES}\n\n─────────────────────────\n\n${dmEN}`);
        } catch (e) {
            console.warn(`[SANCION] No se pudo enviar DM a ${usuario.tag}: DMs cerrados.`);
        }

        await interaction.editReply(
            `:white_check_mark: Sanción #${numero} aplicada a ${usuario}.\n` +
            `**Tipo:** ${reasonData.tipo}\n` +
            `**Razón:** ${razon}\n` +
            `**Duración:** ${reasonData.duration}\n` +
            `**Precio:** ${reasonData.price} rbx`
        );

    } catch (error) {
        console.error('[SANCION] Error:', error);
        await interaction.editReply(':x: Error al aplicar la sanción.').catch(() => {});
    }
}

async function handleRevoke(interaction) {
    if (!await isModeratorOrAdmin(interaction.guild, interaction.user.id)) {
        return interaction.reply({ content: ':x: Solo los moderadores pueden usar este comando.', ephemeral: true });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const usuario = interaction.options.getUser('usuario');
    const razonRevoke = interaction.options.getString('razon');
    const activeSanctions = getUserActiveSanctions(usuario.id);

    if (activeSanctions.length === 0) return interaction.editReply(`:x: ${usuario} no tiene sanciones activas.`);

    if (activeSanctions.length > 1) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('🚫 Seleccionar Sanción a Revocar')
            .setDescription(`**${usuario} tiene ${activeSanctions.length} sanciones activas**\n\nSelecciona cuál revocar:`);

        const select = new StringSelectMenuBuilder()
            .setCustomId(`revoke_select_${usuario.id}_${interaction.user.id}`)
            .setPlaceholder('Selecciona una sanción')
            .addOptions(activeSanctions.map(s => ({
                label: `#${s.numero} - ${s.tipo}`,
                description: s.razon.substring(0, 50),
                value: s.id
            })));

        if (!global.revokeReasons) global.revokeReasons = {};
        global.revokeReasons[`${usuario.id}_${interaction.user.id}`] = razonRevoke;

        return interaction.editReply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] });
    } else {
        await revokeSanction(interaction, activeSanctions[0], usuario, razonRevoke);
    }
}

async function revokeSanction(interaction, sanction, usuario, razon) {
    try {
        updateSanctionStatus(sanction.id, "Revoked");

        try {
            const sanctionChannel = interaction.guild.channels.cache.get(SANCTION_CHANNEL);
            if (sanctionChannel && sanction.messageId) {
                const message = await sanctionChannel.messages.fetch(sanction.messageId);
                const emojiSancion = SANCTION_EMOJIS.sancion;

                await message.edit(
                    `## ${emojiSancion} SANCIÓN #${sanction.numero} ${emojiSancion}\n` +
                    `- **Usuario: ${usuario}**\n` +
                    `- **Razón: ${sanction.razon}**\n` +
                    `- **Duración: ${sanction.duracion}**\n` +
                    `- **Duración Restante: 0 GW**\n` +
                    `- **Estado: Revoked**`
                );

                await sanctionChannel.send(
                    `## ${emojiSancion} SANCIÓN #${sanction.numero} REVOKED ${emojiSancion}\n` +
                    `- **Usuario: ${usuario}**\n` +
                    `- **Razón: ${razon}**`
                );
            }
        } catch (err) {
            console.error('[REVOKE] Error al actualizar mensaje original:', err);
        }

        const remainingSanctions = getUserActiveSanctions(usuario.id);
        if (remainingSanctions.length === 0) {
            const member = await interaction.guild.members.fetch(usuario.id).catch(() => null);
            if (member && member.roles.cache.has(SANCIONADO_ROLE)) await member.roles.remove(SANCIONADO_ROLE);
        }

        const successMsg =
            `:white_check_mark: Sanción #${sanction.numero} revocada para ${usuario}.\n` +
            `**Razón:** ${razon}\n` +
            `**Sanciones activas restantes:** ${remainingSanctions.length}`;

        if (interaction.isChatInputCommand && interaction.isChatInputCommand()) {
            await interaction.editReply(successMsg);
        } else {
            await interaction.followUp({ content: successMsg, flags: MessageFlags.Ephemeral });
        }
    } catch (error) {
        console.error('[REVOKE] Error en revokeSanction:', error);
        throw error;
    }
}

async function handlePassGWSanciones(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        if (!await isModeratorOrAdmin(interaction.guild, interaction.user.id)) {
            return interaction.editReply(':x: Solo los moderadores pueden usar este comando.');
        }

        const allActiveSanctions = getAllActiveSanctions();
        const gwSanctions = allActiveSanctions.filter(s => s.gw !== null && s.gw > 0);

        if (gwSanctions.length === 0) return interaction.editReply(':x: No hay sanciones activas con GW.');

        let updated = 0, autoRevoked = 0;

        for (const sanction of gwSanctions) {
            const newGW = sanction.gw - 1;
            if (newGW <= 0) {
                const usuario = await interaction.client.users.fetch(sanction.userId);
                await revokeSanction(interaction, sanction, usuario, "Pasaron los GW.");
                autoRevoked++;
            } else {
                updateSanctionGW(sanction.id, newGW);
                const sanctionChannel = interaction.guild.channels.cache.get(SANCTION_CHANNEL);
                if (sanctionChannel && sanction.messageId) {
                    try {
                        const message = await sanctionChannel.messages.fetch(sanction.messageId);
                        const usuario = await interaction.client.users.fetch(sanction.userId);
                        const emojiSancion = SANCTION_EMOJIS.sancion;
                        await message.edit(
                            `## ${emojiSancion} SANCIÓN #${sanction.numero} ${emojiSancion}\n` +
                            `- **Usuario: ${usuario}**\n` +
                            `- **Razón: ${sanction.razon}**\n` +
                            `- **Duración: ${sanction.duracion}**\n` +
                            `- **Duración Restante: ${newGW} GW**\n` +
                            `- **Estado: Activa**`
                        );
                        updated++;
                    } catch (err) {
                        console.error(`[PASSGW] Error al actualizar sanción #${sanction.numero}:`, err);
                    }
                }
            }
        }

        await interaction.editReply(`✅ Sanciones procesadas:\nActualizadas: ${updated}\nAuto-revocadas: ${autoRevoked}`);

    } catch (error) {
        console.error('[PASSGW] Error:', error);
        if (!interaction.replied) await interaction.editReply(':x: Error al procesar sanciones.');
    }
}

async function handleOpen(interaction) {
    if (!await isModeratorOrAdmin(interaction.guild, interaction.user.id)) {
        return interaction.reply({ content: ':x: Solo los moderadores pueden usar este comando.', ephemeral: true });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const canal = interaction.options.getChannel('canal');
    const rol1 = interaction.options.getRole('rol1');
    const rol2 = interaction.options.getRole('rol2');
    const arbitro = interaction.options.getRole('arbitro');

    try {
        await canal.permissionOverwrites.edit(rol1, { ViewChannel: true, SendMessages: true });
        await canal.permissionOverwrites.edit(rol2, { ViewChannel: true, SendMessages: true });
        await canal.permissionOverwrites.edit(arbitro, { ViewChannel: true, SendMessages: true });
        await canal.send(`${rol1} ${rol2} ${arbitro}\n🟢 **¡Matchcall abierto!** Los equipos pueden ingresar al canal.`);
        await interaction.editReply(`:white_check_mark: Canal ${canal} abierto correctamente.`);
    } catch (error) {
        console.error('[OPEN] Error:', error);
        await interaction.editReply(':x: Error al abrir el canal.');
    }
}

async function handleClose(interaction) {
    if (!await isModeratorOrAdmin(interaction.guild, interaction.user.id)) {
        return interaction.reply({ content: ':x: Solo los moderadores pueden usar este comando.', ephemeral: true });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const canal = interaction.options.getChannel('canal');

    try {
        const overwrites = canal.permissionOverwrites.cache.filter(
            ow => ow.id !== interaction.guild.roles.everyone.id && ow.id !== interaction.client.user.id
        );
        for (const [, overwrite] of overwrites) {
            await canal.permissionOverwrites.edit(overwrite.id, { ViewChannel: false, SendMessages: false });
        }
        await canal.send('🔴 **Matchcall cerrado.**');
        await interaction.editReply(`:white_check_mark: Canal ${canal} cerrado correctamente.`);
    } catch (error) {
        console.error('[CLOSE] Error:', error);
        await interaction.editReply(':x: Error al cerrar el canal.');
    }
}

async function handleRenew(interaction) {
    if (!await isModeratorOrAdmin(interaction.guild, interaction.user.id)) {
        return interaction.reply({ content: ':x: Solo los moderadores pueden usar este comando.', ephemeral: true });
    }
    await interaction.deferReply();

    const usuario = interaction.options.getUser('usuario');
    const equipo = interaction.options.getString('equipo');
    const gw = interaction.options.getInteger('gw');
    const playerInfo = getPlayerInfo(usuario.id);

    if (!playerInfo) return interaction.editReply(`:x: ${usuario} no está fichado en ningún equipo.`);
    if (playerInfo.team !== equipo) return interaction.editReply(`:x: ${usuario} no está en **${equipo}** (está en **${playerInfo.team}**).`);

    updatePlayerGW(usuario.id, gw);
    await interaction.editReply(`:white_check_mark: Contrato de ${usuario} en **${equipo}** renovado a **${gw} GW**.`);

    const mercadoChannel = interaction.guild.channels.cache.get(CHANNELS.mercado);
    if (mercadoChannel) {
        await mercadoChannel.send(`${getTeamEmoji(equipo)} **RENOVACION** ${getTeamEmoji(equipo)}\nUser: ${usuario}\nDivision: ${getDivisionEmoji(`División ${playerInfo.division}`)}\nPaís: ${playerInfo.country}\nGW: ${gw}`);
    }

    await updateSquadsheet(interaction.guild, equipo);
}

async function handleReset(interaction) {
    if (!await isAdminOnly(interaction.guild, interaction.user.id)) {
        return interaction.reply({ content: ':x: Solo los administradores pueden usar este comando.', ephemeral: true });
    }
    saveStatus('Reset');
    await interaction.reply({
        content: '🔴 **⚠️ AVISO: El bot ha sido reseteado ⚠️**\n\nTodos los comandos están deshabilitados.\nUsa `/active-reset` para reactivar.'
    });
    try {
        await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
    } catch (e) {}
}

async function handleActiveReset(interaction) {
    if (!await isAdminOnly(interaction.guild, interaction.user.id)) {
        return interaction.reply({ content: ':x: Solo los administradores pueden usar este comando.', ephemeral: true });
    }
    saveStatus('Activo');
    await interaction.reply({
        content: '🟢 **✅ El bot ha sido reactivado ✅**\n\nTodos los comandos han sido habilitados nuevamente.'
    });
    try {
        await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
    } catch (e) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// SANCIONES DE EQUIPO
// ─────────────────────────────────────────────────────────────────────────────
function getTeamSanctions(teamName) {
    const db = loadDatabase();
    if (!db.teamSanctions) return [];
    return Object.values(db.teamSanctions).filter(s => s.team === teamName && s.estado === 'Activa');
}

function createTeamSanction(teamName, razon, messageId) {
    const db = loadDatabase();
    if (!db.teamSanctions) db.teamSanctions = {};
    if (!db.teamSanctionCounter) db.teamSanctionCounter = 0;
    db.teamSanctionCounter++;
    const id = `tsanction_${Date.now()}_${db.teamSanctionCounter}`;
    db.teamSanctions[id] = { id, numero: db.teamSanctionCounter, team: teamName, razon, estado: 'Activa', messageId, timestamp: Date.now() };
    fs.writeFileSync(DATABASE_FILE, JSON.stringify(db, null, 4), 'utf-8');
    return db.teamSanctions[id];
}

async function handleSancionTeam(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        if (!await isModeratorOrAdmin(interaction.guild, interaction.user.id)) {
            return interaction.editReply(':x: Solo los moderadores pueden usar este comando.');
        }

        const equipo = interaction.options.getString('equipo');
        const razon = interaction.options.getString('razon');
        const emojiSancion = SANCTION_EMOJIS.sancion;
        const teamRole = TEAM_ROLES[equipo];
        const sanctionChannel = interaction.guild.channels.cache.get(SANCTION_CHANNEL);

        if (!sanctionChannel) return interaction.editReply(':x: No se encontró el canal de sanciones.');

        const activeSanctions = getTeamSanctions(equipo);
        const numeroSancion = activeSanctions.length + 1;

        const sanctionMessage =
            `## ${emojiSancion} AVISO ${numeroSancion}/2 ${emojiSancion}\n` +
            `- **Equipo: ${teamRole ? `<@&${teamRole}>` : equipo}**\n` +
            `- **Razón: ${razon}**`;

        const sentMessage = await sanctionChannel.send(sanctionMessage);
        const sanction = createTeamSanction(equipo, razon, sentMessage.id);

        const logsChannel = interaction.guild.channels.cache.get(SANCTION_LOGS_CHANNEL);
        const totalSanctions = getTeamSanctions(equipo).length;
        const isDisband = totalSanctions >= 2;

        if (logsChannel) {
            await logsChannel.send(`**ID:** \`${sanction.id}\` **| EQUIPO:** ${teamRole ? `<@&${teamRole}>` : equipo} **| RAZÓN:** ${razon} **| DISBAND:** ${isDisband ? 'Sí' : 'No'}`);
            if (isDisband) await logsChannel.send(`⚠️ **${teamRole ? `<@&${teamRole}>` : equipo} llegó a 2 sanciones. Por reglamento, corresponde DISBAND.**`);
        }

        await interaction.editReply(`:white_check_mark: Sanción ${numeroSancion}/2 aplicada a **${equipo}**.\n**Razón:** ${razon}${isDisband ? '\n\n⚠️ **Este equipo alcanzó las 2 sanciones. Corresponde DISBAND.**' : ''}`);

    } catch (error) {
        console.error('[SANCION-TEAM] Error:', error);
        await interaction.editReply(':x: Error al aplicar la sanción.').catch(() => {});
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: /revoke-team
// ─────────────────────────────────────────────────────────────────────────────
async function handleRevokeTeam(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        if (!await isModeratorOrAdmin(interaction.guild, interaction.user.id)) {
            return interaction.editReply(':x: Solo los moderadores pueden usar este comando.');
        }

        const equipo = interaction.options.getString('equipo');
        const razon = interaction.options.getString('razon');

        const activeSanctions = getTeamSanctions(equipo);

        if (activeSanctions.length === 0) {
            return interaction.editReply(`:x: **${equipo}** no tiene sanciones activas.`);
        }

        const emojiSancion = SANCTION_EMOJIS.sancion;
        const teamRole = TEAM_ROLES[equipo];
        const sanctionChannel = interaction.guild.channels.cache.get(SANCTION_CHANNEL);
        const logsChannel = interaction.guild.channels.cache.get(SANCTION_LOGS_CHANNEL);

        const sanction = activeSanctions[0]; // revocar la más antigua

        // Actualizar estado en DB
        const db = loadDatabase();
        if (db.teamSanctions && db.teamSanctions[sanction.id]) {
            db.teamSanctions[sanction.id].estado = 'Revoked';
            saveDatabase(db);
        }

        // Editar mensaje original en canal de sanciones
        if (sanctionChannel && sanction.messageId) {
            try {
                const msg = await sanctionChannel.messages.fetch(sanction.messageId);
                await msg.edit(
                    `## ${emojiSancion} AVISO ${sanction.numero}/2 ${emojiSancion}\n` +
                    `- **Equipo: ${teamRole ? `<@&${teamRole}>` : equipo}**\n` +
                    `- **Razón: ${sanction.razon}**\n` +
                    `- **Estado: Revoked**`
                );
                await sanctionChannel.send(
                    `## ${emojiSancion} AVISO ${sanction.numero}/2 REVOKED ${emojiSancion}\n` +
                    `- **Equipo: ${teamRole ? `<@&${teamRole}>` : equipo}**\n` +
                    `- **Razón de revocación: ${razon}**`
                );
            } catch (err) {
                console.error('[REVOKE-TEAM] Error al actualizar mensaje:', err);
            }
        }

        if (logsChannel) {
            await logsChannel.send(`**[REVOKE-TEAM] ID:** \`${sanction.id}\` **| EQUIPO:** ${teamRole ? `<@&${teamRole}>` : equipo} **| RAZÓN:** ${razon}`);
        }

        const remaining = getTeamSanctions(equipo).length;
        await interaction.editReply(
            `:white_check_mark: Sanción revocada para **${equipo}**.\n**Razón:** ${razon}\n**Sanciones activas restantes:** ${remaining}`
        );

    } catch (error) {
        console.error('[REVOKE-TEAM] Error:', error);
        await interaction.editReply(':x: Error al revocar la sanción.').catch(() => {});
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: /mute
// ─────────────────────────────────────────────────────────────────────────────
function parseDuration(str) {
    const match = str.trim().match(/^(\d+)(s|m|h|d|w)$/i);
    if (!match) return null;
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
    const ms = value * multipliers[unit];
    const maxMs = 4 * 7 * 24 * 3600000; // 4 weeks
    if (ms < 1000 || ms > maxMs) return null;
    return ms;
}

function formatDurationLabel(str) {
    const match = str.trim().match(/^(\d+)(s|m|h|d|w)$/i);
    if (!match) return str;
    const value = match[1];
    const labels = { s: 'segundo(s)', m: 'minuto(s)', h: 'hora(s)', d: 'día(s)', w: 'semana(s)' };
    const labelsEN = { s: 'second(s)', m: 'minute(s)', h: 'hour(s)', d: 'day(s)', w: 'week(s)' };
    const unit = match[2].toLowerCase();
    return { es: `${value} ${labels[unit]}`, en: `${value} ${labelsEN[unit]}` };
}

async function handleMute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!await isModeratorOrAdmin(interaction.guild, interaction.user.id)) {
        return interaction.editReply(':x: Solo los moderadores pueden usar este comando.');
    }

    const usuario = interaction.options.getUser('usuario');
    const razon = interaction.options.getString('razon');
    const duracionStr = interaction.options.getString('duracion');

    const duracionMs = parseDuration(duracionStr);
    if (!duracionMs) {
        return interaction.editReply(':x: Duración inválida. Usa formato como `10s`, `5m`, `2h`, `3d`, `1w`. El máximo es **4w** (4 semanas).');
    }

    const durLabel = formatDurationLabel(duracionStr);

    try {
        const member = await interaction.guild.members.fetch(usuario.id).catch(() => null);
        if (!member) return interaction.editReply(':x: No se encontró al usuario en el servidor.');

        // Aplicar timeout de Discord
        await member.timeout(duracionMs, razon);

        // DM al usuario (español + inglés)
        try {
            const dmES =
                `🔇 **Fuiste muteado en ATF.**\n\n` +
                `**Razón:** ${razon}\n` +
                `**Duración:** ${durLabel.es}\n\n` +
                `Para apelar, entra al siguiente servidor: https://discord.gg/AGjJSCknc9`;

            const dmEN =
                `🔇 **You have been muted in ATF.**\n\n` +
                `**Reason:** ${razon}\n` +
                `**Duration:** ${durLabel.en}\n\n` +
                `To appeal, join the following server: https://discord.gg/AGjJSCknc9`;

            await usuario.send(`${dmES}\n\n─────────────────────────\n\n${dmEN}`);
        } catch (e) {
            console.warn(`[MUTE] No se pudo enviar DM a ${usuario.tag}: DMs cerrados.`);
        }

        // Log en canal de sanciones
        const logsChannel = interaction.guild.channels.cache.get(SANCTION_LOGS_CHANNEL);
        if (logsChannel) {
            await logsChannel.send(
                `🔇 **[MUTE]** Usuario: ${usuario} | **Razón:** ${razon} | **Duración:** ${durLabel.es} | **Por:** ${interaction.user}`
            );
        }

        await interaction.editReply(
            `:white_check_mark: ${usuario} muteado correctamente.\n` +
            `**Razón:** ${razon}\n` +
            `**Duración:** ${durLabel.es}`
        );

    } catch (error) {
        console.error('[MUTE] Error:', error);
        await interaction.editReply(':x: Error al mutear al usuario. ¿Tengo permisos suficientes?').catch(() => {});
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO: /man-verify
// ─────────────────────────────────────────────────────────────────────────────
async function handleManVerify(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!await isModeratorOrAdmin(interaction.guild, interaction.user.id)) {
        return interaction.editReply(':x: Solo los moderadores pueden usar este comando.');
    }
    const roblox_id = interaction.options.getString('roblox_id').trim();

    const data = loadVerify();

    // Guardar vinculación directamente (mismo formato que processVerification)
    data.links[targetUser.id] = {
        roblox_user,
        roblox_id,
        verified_at: Date.now()
    };
    saveVerify(data);

    // Aplicar en Discord: nickname y rol
    try {
        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) return interaction.editReply(':x: No se encontró al usuario en el servidor.');

        // Cambiar nickname (mismo formato que verify-api.js)
        try {
            let displayName = roblox_user;
            try {
                const res = await fetch(`https://users.roblox.com/v1/users/${roblox_id}`);
                const json = await res.json();
                if (json.displayName) displayName = json.displayName;
            } catch (e) {
                console.warn('[MAN-VERIFY] No se pudo obtener displayName de Roblox:', e.message);
            }
            await member.setNickname(`${displayName} (@${roblox_user})`);
        } catch (e) {
            console.warn(`[MAN-VERIFY] No se pudo cambiar nickname de ${targetUser.id}:`, e.message);
        }

        // Asignar rol verificado
        const roleId = data.config?.roleId;
        if (roleId) {
            try {
                await member.roles.add(roleId);
            } catch (e) {
                console.warn(`[MAN-VERIFY] No se pudo asignar rol a ${targetUser.id}:`, e.message);
            }
        }

        // DM al usuario
        try {
            await member.user.send(
                `✅ **¡Verificación completada!**\n` +
                `Tu cuenta de Roblox **${roblox_user}** ha sido vinculada a tu Discord.\n` +
                `Se te asignó el nickname y el rol correspondiente.`
            );
        } catch (e) {
            // DMs cerrados, no crítico
        }

        console.log(`[MAN-VERIFY] ✅ ${targetUser.id} verificado manualmente como Roblox: ${roblox_user} (${roblox_id})`);

        const embed = new EmbedBuilder()
            .setColor(0x00c851)
            .setTitle('✅ Verificación Manual Completada')
            .addFields(
                { name: 'Usuario de Discord', value: `<@${targetUser.id}>`, inline: true },
                { name: 'Usuario de Roblox', value: `**${roblox_user}**`, inline: true },
                { name: 'ID de Roblox', value: `\`${roblox_id}\``, inline: true }
            )
            .setFooter({ text: `Verificado manualmente por ${interaction.user.tag}` })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error('[MAN-VERIFY] Error:', error);
        await interaction.editReply(':x: Error al verificar manualmente al usuario.').catch(() => {});
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// BOOSTS
// ─────────────────────────────────────────────────────────────────────────────
function getBoosts() {
    const db = loadDatabase();
    return db.boosts || {};
}

function setBoost(userId, amount) {
    const db = loadDatabase();
    if (!db.boosts) db.boosts = {};
    if (amount <= 0) delete db.boosts[userId];
    else db.boosts[userId] = amount;
    fs.writeFileSync(DATABASE_FILE, JSON.stringify(db, null, 4), 'utf-8');
}

async function handleBoostAdd(interaction) {
    if (!await isModeratorOrAdmin(interaction.guild, interaction.user.id)) {
        return interaction.reply({ content: ':x: Solo los moderadores pueden usar este comando.', ephemeral: true });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const usuario = interaction.options.getUser('usuario');
    const cantidad = interaction.options.getInteger('cantidad');
    const boosts = getBoosts();
    const nuevo = (boosts[usuario.id] || 0) + cantidad;
    setBoost(usuario.id, nuevo);

    await interaction.editReply(`:white_check_mark: Se añadieron **${cantidad} boost(s)** a ${usuario}. Total: **${nuevo} boost(s)**.`);
}

async function handleBoostRemove(interaction) {
    if (!await isModeratorOrAdmin(interaction.guild, interaction.user.id)) {
        return interaction.reply({ content: ':x: Solo los moderadores pueden usar este comando.', ephemeral: true });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const usuario = interaction.options.getUser('usuario');
    const cantidad = interaction.options.getInteger('cantidad');
    const boosts = getBoosts();
    const actual = boosts[usuario.id] || 0;

    if (actual === 0) return interaction.editReply(`:x: ${usuario} no tiene boosts registrados.`);

    const nuevo = Math.max(0, actual - cantidad);
    setBoost(usuario.id, nuevo);

    await interaction.editReply(`:white_check_mark: Se eliminaron **${Math.min(cantidad, actual)} boost(s)** de ${usuario}. Total: **${nuevo} boost(s)**.`);
}

async function handleBoostView(interaction) {
    if (!await isModeratorOrAdmin(interaction.guild, interaction.user.id)) {
        return interaction.reply({ content: ':x: Solo los moderadores pueden usar este comando.', ephemeral: true });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const boosts = getBoosts();
    const entries = Object.entries(boosts).filter(([, v]) => v > 0);

    if (entries.length === 0) return interaction.editReply(':x: No hay usuarios con boosts registrados.');

    const lines = entries.map(([userId, amount]) => `• <@${userId}>: **${amount} boost(s)**`);
    await interaction.editReply(`## 🚀 Lista de Boosts\n${lines.join('\n')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// FORCES
// ─────────────────────────────────────────────────────────────────────────────
const MAX_FORCES = 7;
const FORCES_PER_PAGE = 20;

function getForces() {
    const db = loadDatabase();
    return db.forces || {};
}

function setForce(userId, amount) {
    const db = loadDatabase();
    if (!db.forces) db.forces = {};
    if (amount <= 0) delete db.forces[userId];
    else db.forces[userId] = amount;
    fs.writeFileSync(DATABASE_FILE, JSON.stringify(db, null, 4), 'utf-8');
}

function resetAllForces() {
    const db = loadDatabase();
    db.forces = {};
    fs.writeFileSync(DATABASE_FILE, JSON.stringify(db, null, 4), 'utf-8');
}

function buildForcesEmbed(entries, page, totalPages) {
    const start = page * FORCES_PER_PAGE;
    const slice = entries.slice(start, start + FORCES_PER_PAGE);
    const lines = slice.map(([userId, amount]) => `• <@${userId}>: **${amount}/${MAX_FORCES}**`);
    return new EmbedBuilder()
        .setColor('#FF4500')
        .setTitle('⚡ Lista de Forces')
        .setDescription(lines.join('\n'))
        .setFooter({ text: `Página ${page + 1} de ${totalPages} • Total: ${entries.length} usuarios` });
}

function buildForcesButtons(page, totalPages) {
    if (totalPages <= 1) return [];
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`forces_prev_${page}`)
            .setLabel('◀ Anterior')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`forces_next_${page}`)
            .setLabel('Siguiente ▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages - 1)
    );
    return [row];
}

async function handleForceReleaseAdd(interaction) {
    if (!await isModeratorOrAdmin(interaction.guild, interaction.user.id)) {
        return interaction.reply({ content: ':x: Solo los moderadores pueden usar este comando.', ephemeral: true });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const usuario = interaction.options.getUser('usuario');
    const forces = getForces();
    const actual = forces[usuario.id] || 0;

    if (actual >= MAX_FORCES) {
        return interaction.editReply(`:x: ${usuario} ya tiene el máximo de **${MAX_FORCES} forces**. No se puede añadir más.`);
    }

    const nuevo = actual + 1;
    setForce(usuario.id, nuevo);
    await interaction.editReply(`:white_check_mark: Se añadió **+1 force** a ${usuario}. Total: **${nuevo}/${MAX_FORCES}**.`);
}

async function handleForceReleaseView(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const forces = getForces();
    const entries = Object.entries(forces).sort((a, b) => b[1] - a[1]);

    if (entries.length === 0) {
        return interaction.editReply(':x: No hay usuarios con forces registrados.');
    }

    const totalPages = Math.ceil(entries.length / FORCES_PER_PAGE);
    const embed = buildForcesEmbed(entries, 0, totalPages);
    const components = buildForcesButtons(0, totalPages);
    await interaction.editReply({ embeds: [embed], components });
}

async function handleForceReleaseReset(interaction) {
    if (!await isAdminOnly(interaction.guild, interaction.user.id)) {
        return interaction.reply({ content: ':x: Solo los administradores pueden usar este comando.', ephemeral: true });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    resetAllForces();
    await interaction.editReply(':white_check_mark: Todos los forces han sido reseteados a **0**.');
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG MESSAGES
// ─────────────────────────────────────────────────────────────────────────────
async function handleConfigMessages(interaction) {
    if (!await isAdminOnly(interaction.guild, interaction.user.id)) {
        return interaction.reply({ content: ':x: Solo los administradores pueden usar este comando.', ephemeral: true });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const canal = interaction.options.getChannel('canal');
    const cooldown = interaction.options.getInteger('cooldown');
    const cooldownMs = cooldown * 60 * 1000;

    const data = loadMessages();
    data.config = { channelId: canal.id, cooldownMs };
    saveMessages(data);
    startConfigMessagesInterval(interaction.guild);

    const variablesList = [
        '`{players_actuales}` — Jugadores fichados',
        '`{sancionados}` — Jugadores sancionados',
        '`{miembros}` — Miembros del servidor',
        '`{team_[nombre]}` — Nombre de equipo',
        '`{team_[nombre]_division}` — División de equipo',
        '`{team_[nombre]_owner}` — Dueño del equipo',
        '`{team_[nombre]_manager}` — Manager del equipo',
        '`{team_[nombre]_assist}` — Assistant Manager del equipo',
    ].join('\n');

    const currentMessages = data.messages && data.messages.length > 0
        ? data.messages.map((m, i) => `**${i + 1}.** ${m.substring(0, 80)}${m.length > 80 ? '…' : ''}`).join('\n')
        : '*No hay mensajes configurados aún.*';

    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('⚙️ Configuración de Mensajes Automáticos')
        .setDescription(`**Canal:** ${canal}\n**Cooldown:** ${cooldown} minuto(s)\n\n**Variables:**\n${variablesList}\n\n**Mensajes actuales:**\n${currentMessages}`)
        .setFooter({ text: 'Puedes añadir mensajes con el botón de abajo.' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`config_msg_add_${canal.id}_${cooldownMs}`).setLabel('➕ Añadir Mensaje').setStyle(ButtonStyle.Primary)
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
}

async function handleConfigMsgAddButton(interaction) {
    const modal = new ModalBuilder()
        .setCustomId(`config_msg_submit_${Date.now()}`)
        .setTitle('Añadir Mensaje Automático');

    modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
            .setCustomId('mensaje')
            .setLabel('Escribe el mensaje (puedes usar variables)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Ej: 🏆 Jugadores fichados: {players_actuales}')
            .setRequired(true)
            .setMaxLength(2000)
    ));

    await interaction.showModal(modal);
}

async function handleConfigMsgSubmit(interaction) {
    const mensaje = interaction.fields.getTextInputValue('mensaje');
    const data = loadMessages();
    if (!data.messages) data.messages = [];
    data.messages.push(mensaje);
    saveMessages(data);

    let preview = mensaje;
    try { preview = await resolveMessageVariables(mensaje, interaction.guild); } catch (e) {}

    await interaction.reply({
        content: `:white_check_mark: Mensaje **#${data.messages.length}** guardado.\n\n**Preview:**\n${preview}`,
        flags: MessageFlags.Ephemeral
    });

    if (data.config) startConfigMessagesInterval(interaction.guild);
}

// ─────────────────────────────────────────────────────────────────────────────
// GOLEADORES Y ASISTENCIAS
// ─────────────────────────────────────────────────────────────────────────────
async function handleGoleadores(interaction) {
    await interaction.deferReply();
    await sendGoleadoresEmbed(interaction, 'all');
}

async function sendGoleadoresEmbed(interaction, divFilter) {
    const tabla = getGoleadoresTable();

    // Filtrar por división si aplica
    const filtered = divFilter === 'all'
        ? tabla
        : tabla.filter(e => TEAM_DIVISIONS[e.equipo] === divFilter);

    const medallas = ['🥇', '🥈', '🥉'];
    const top = filtered.slice(0, 20);

    const divLabels = { all: 'Todas las divisiones', A: 'División A', B: 'División B', C: 'División C' };
    const divColors = { all: '#f1c40f', A: '#e74c3c', B: '#3498db', C: '#2ecc71' };

    const embed = new EmbedBuilder()
        .setColor(divColors[divFilter])
        .setTitle('⚽ Tabla de Goleadores')
        .setFooter({ text: `${divLabels[divFilter]} • Top ${top.length} goleadores de la temporada` });

    if (top.length === 0) {
        embed.setDescription('No hay goles registrados para esta división aún.');
    } else {
        const lines = top.map((entry, i) => {
            const emoji = i < 3 ? medallas[i] : `**${i + 1}.**`;
            const teamEmoji = getTeamEmoji(entry.equipo);
            return `${emoji} ${teamEmoji} <@${entry.jugadorId}> — **${entry.goles} ⚽**`;
        });
        embed.setDescription(lines.join('\n'));
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('goleadores_all')
            .setLabel('🌐 Todas')
            .setStyle(divFilter === 'all' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('goleadores_A')
            .setLabel('🔴 División A')
            .setStyle(divFilter === 'A' ? ButtonStyle.Danger : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('goleadores_B')
            .setLabel('🔵 División B')
            .setStyle(divFilter === 'B' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('goleadores_C')
            .setLabel('🟢 División C')
            .setStyle(divFilter === 'C' ? ButtonStyle.Success : ButtonStyle.Secondary)
    );

    if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [embed], components: [row] });
    } else {
        await interaction.update({ embeds: [embed], components: [row] });
    }
}

async function handleAsistencias(interaction) {
    await interaction.deferReply();
    await sendAsistenciasEmbed(interaction, 'all');
}

async function sendAsistenciasEmbed(interaction, divFilter) {
    const tabla = getAsistenciasTable();

    const filtered = divFilter === 'all'
        ? tabla
        : tabla.filter(e => TEAM_DIVISIONS[e.equipo] === divFilter);

    const medallas = ['🥇', '🥈', '🥉'];
    const top = filtered.slice(0, 20);

    const divLabels = { all: 'Todas las divisiones', A: 'División A', B: 'División B', C: 'División C' };
    const divColors = { all: '#3498db', A: '#e74c3c', B: '#3498db', C: '#2ecc71' };

    const embed = new EmbedBuilder()
        .setColor(divColors[divFilter])
        .setTitle('🍷 Tabla de Asistencias')
        .setFooter({ text: `${divLabels[divFilter]} • Top ${top.length} asistidores de la temporada` });

    if (top.length === 0) {
        embed.setDescription('No hay asistencias registradas para esta división aún.');
    } else {
        const lines = top.map((entry, i) => {
            const emoji = i < 3 ? medallas[i] : `**${i + 1}.**`;
            const teamEmoji = getTeamEmoji(entry.equipo);
            return `${emoji} ${teamEmoji} <@${entry.jugadorId}> — **${entry.asistencias} 🍷**`;
        });
        embed.setDescription(lines.join('\n'));
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('asistencias_all')
            .setLabel('🌐 Todas')
            .setStyle(divFilter === 'all' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('asistencias_A')
            .setLabel('🔴 División A')
            .setStyle(divFilter === 'A' ? ButtonStyle.Danger : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('asistencias_B')
            .setLabel('🔵 División B')
            .setStyle(divFilter === 'B' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('asistencias_C')
            .setLabel('🟢 División C')
            .setStyle(divFilter === 'C' ? ButtonStyle.Success : ButtonStyle.Secondary)
    );

    if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [embed], components: [row] });
    } else {
        await interaction.update({ embeds: [embed], components: [row] });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECK LINEUP
// ─────────────────────────────────────────────────────────────────────────────
const LINEUPS_FILE = path.join(__dirname, 'lineups.json');

function loadLineups() {
    if (fs.existsSync(LINEUPS_FILE)) {
        try { return JSON.parse(fs.readFileSync(LINEUPS_FILE, 'utf-8')); } catch (e) {}
    }
    return { lineups: [] };
}

function saveLineup(equipo, fecha, jugadorIds) {
    const data = loadLineups();
    data.lineups.push({
        id: `lineup_${Date.now()}`,
        timestamp: Date.now(),
        equipo,
        fecha,
        jugadores: jugadorIds
    });
    fs.writeFileSync(LINEUPS_FILE, JSON.stringify(data, null, 4), 'utf-8');
}

function getPlayersWhoPlayedInDate(fecha) {
    const data = loadLineups();
    const map = new Map();
    for (const lineup of data.lineups) {
        if (lineup.fecha !== fecha) continue;
        for (const jugadorId of lineup.jugadores) {
            if (!map.has(jugadorId)) {
                map.set(jugadorId, lineup.equipo);
            }
        }
    }
    return map;
}

async function handleCheckLineup(interaction) {
    const ARBITRO_ROLE_ID = '1414386378317500416';
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const isArbitro = member?.roles.cache.has(ARBITRO_ROLE_ID);

    if (!isArbitro && !await isModeratorOrAdmin(interaction.guild, interaction.user.id)) {
        return interaction.reply({ content: ':x: Solo los moderadores y árbitros pueden usar este comando.', ephemeral: true });
    }
    
    await interaction.deferReply();

    const equipo = interaction.options.getString('equipo');
    const fecha = interaction.options.getString('fecha');

    const jugadoresUsers = [];
    for (let i = 1; i <= 7; i++) {
        const u = interaction.options.getUser(`jug${i}`);
        if (u) jugadoresUsers.push(u);
    }

    const teamRoleId = TEAM_ROLES[equipo];
    const doubleAuthRoleId = MISC_ROLES["DoubleAuth"];
    const sancionadoRoleId = MISC_ROLES["Sancionado"];

    const yaJugaron = getPlayersWhoPlayedInDate(fecha);

    const teamEmoji = getTeamEmoji(equipo);
    const jugadoresInfo = [];
    let hayErrores = false;

    for (const usuario of jugadoresUsers) {
        const member = await interaction.guild.members.fetch({ user: usuario.id, force: true }).catch(() => null);
        const playerErrors = [];

        if (!member) {
            jugadoresInfo.push({ usuario, errores: ['❌ No encontrado en el servidor'] });
            hayErrores = true;
            continue;
        }

        if (!member.roles.cache.has(doubleAuthRoleId)) {
            playerErrors.push('❌ No tiene **DoubleAuth**');
        }

        if (member.roles.cache.has(sancionadoRoleId)) {
            playerErrors.push('❌ Está **Sancionado**');
        }

        if (yaJugaron.has(usuario.id)) {
            const equipoAnterior = yaJugaron.get(usuario.id);
            playerErrors.push(`❌ Ya jugó en **${fecha}** con **${equipoAnterior}**`);
        }

        if (!member.roles.cache.has(teamRoleId)) {
            playerErrors.push(`❌ No tiene el rol de **${equipo}**`);
        }

        if (playerErrors.length > 0) hayErrores = true;
        jugadoresInfo.push({ usuario, errores: playerErrors });
    }

    if (!hayErrores) {
        const jugadorIds = jugadoresUsers.map(u => u.id);
        saveLineup(equipo, fecha, jugadorIds);
    }

    const embed = new EmbedBuilder()
        .setColor(hayErrores ? '#ff4444' : '#00c851')
        .setTitle(`${teamEmoji} Check Lineup — ${equipo}`)
        .setDescription(
            `**Fecha/Ronda:** \`${fecha}\`\n**Jugadores revisados:** ${jugadoresUsers.length}\n\n` +
            (hayErrores ? '⚠️ **Se encontraron errores en la alineación:**' : '✅ **¡Todos los jugadores cumplen las condiciones!**')
        );

    for (const info of jugadoresInfo) {
        const estado = info.errores.length === 0 ? '✅ Apto' : info.errores.join('\n');
        embed.addFields({ name: `👤 ${info.usuario.tag}`, value: estado, inline: false });
    }

    if (!hayErrores) {
        embed.addFields({ name: '📋 Lineup registrado', value: 'La alineación fue guardada en `lineups.json`.', inline: false });
    }

    embed.setFooter({ text: `Revisión solicitada por ${interaction.user.tag}` });
    embed.setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES FILE
// ─────────────────────────────────────────────────────────────────────────────
const FIXTURES_FILE = path.join(__dirname, 'fixtures.json');
const STAFF_CHAT_ID = '1414386380682821646';

function loadFixtures() {
    if (fs.existsSync(FIXTURES_FILE)) {
        try { return JSON.parse(fs.readFileSync(FIXTURES_FILE, 'utf-8')); } catch (e) {}
    }
    return { fixtures: [] };
}

function saveFixtures(data) {
    fs.writeFileSync(FIXTURES_FILE, JSON.stringify(data, null, 4), 'utf-8');
}

// Parsea un timestamp Unix de un string tipo <t:1771810200:F>
function parseHammertimeUnix(horaStr) {
    const match = horaStr.match(/<t:(\d+)(?::[A-Za-z])?>/);
    return match ? parseInt(match[1]) : null;
}

// Guarda un fixture en fixtures.json
function saveFixtureData(session) {
    const data = loadFixtures();
    const id = `fixture_${Date.now()}`;
    const enfrentamientosData = session.enfrentamientos.map((e, i) => ({
        id: `${id}_e${i + 1}`,
        equipoLocal: e.equipoLocal,
        equipoVisitante: e.equipoVisitante,
        hora: e.hora,
        unixTimestamp: parseHammertimeUnix(e.hora),
        reminded: false,
        pospuesto: false
    }));

    data.fixtures.push({
        id,
        competicion: session.competicion,
        fecha: session.fecha,
        timestamp: Date.now(),
        canalId: session.canalId,
        enfrentamientos: enfrentamientosData
    });

    saveFixtures(data);
    console.log(`[FIXTURES] Fixture guardado: ${session.competicion} | ${session.fecha} con ${enfrentamientosData.length} enfrentamientos`);
    return id;
}

// Scheduler: cada 60 segundos revisa si hay partidos en los próximos 30 min
function startFixtureReminderScheduler(clientInstance) {
    setInterval(async () => {
        try {
            const data = loadFixtures();
            const now = Math.floor(Date.now() / 1000); // Unix en segundos
            const THIRTY_MIN = 30 * 60;
            let modified = false;

            for (const fixture of data.fixtures) {
                for (const enf of (fixture.enfrentamientos || [])) {
                    if (enf.reminded || enf.pospuesto) continue;
                    if (!enf.unixTimestamp) continue;

                    const diff = enf.unixTimestamp - now;
                    // Avisar cuando falten entre 28 y 32 minutos (ventana de 4 min para evitar doble aviso)
                    if (diff > 0 && diff <= THIRTY_MIN && diff >= (THIRTY_MIN - 4 * 60)) {
                        enf.reminded = true;
                        modified = true;

                        const guild = clientInstance.guilds.cache.first();
                        if (!guild) continue;
                        const staffChannel = guild.channels.cache.get(STAFF_CHAT_ID);
                        if (!staffChannel) continue;

                        const emojiLocal = getTeamEmoji(enf.equipoLocal);
                        const emojiVis = getTeamEmoji(enf.equipoVisitante);
                        const roleLocal = TEAM_ROLES[enf.equipoLocal];
                        const roleVis = TEAM_ROLES[enf.equipoVisitante];

                        await staffChannel.send(
                            `## ⏰ ¡Ya es hora de abrir matchcall!\n` +
                            `> ${emojiLocal} <@&${roleLocal}> **VS** <@&${roleVis}> ${emojiVis}\n` +
                            `> 📅 **${fixture.competicion.toUpperCase()} | ${fixture.fecha.toUpperCase()}**\n` +
                            `> 🕐 ${enf.hora}\n` +
                            `-# El partido comienza en aproximadamente 30 minutos.`
                        );
                        console.log(`[SCHEDULER] Aviso enviado: ${enf.equipoLocal} vs ${enf.equipoVisitante}`);
                    }
                }
            }

            if (modified) saveFixtures(data);
        } catch (err) {
            console.error('[SCHEDULER] Error en scheduler de fixtures:', err);
        }
    }, 60 * 1000); // cada 60 segundos

    console.log('[SCHEDULER] Scheduler de recordatorios de fixtures iniciado.');
}

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURE COMMAND
// ─────────────────────────────────────────────────────────────────────────────
const fixtureSessions = new Map();

async function handleFixture(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!await isModeratorOrAdmin(interaction.guild, interaction.user.id)) {
        return interaction.editReply(':x: Solo los moderadores pueden usar este comando.');
    }

    const competicion = interaction.options.getString('competicion');
    const fecha = interaction.options.getString('fecha');
    const totalEnfrentamientos = interaction.options.getInteger('enfrentamientos');
    const canal = interaction.options.getChannel('canal');

    const sessionId = `fixture_${interaction.user.id}_${Date.now()}`;

    fixtureSessions.set(sessionId, {
        competicion,
        fecha,
        totalEnfrentamientos,
        canalId: canal.id,
        currentEnfrentamiento: 1,
        enfrentamientos: [],
        userId: interaction.user.id
    });

    await askFixtureEnfrentamiento(interaction, sessionId);
}

async function askFixtureEnfrentamiento(interaction, sessionId) {
    const session = fixtureSessions.get(sessionId);
    if (!session) return interaction.editReply({ content: 'Sesión expirada.', embeds: [], components: [] });

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`📅 Fixture — Enfrentamiento ${session.currentEnfrentamiento} de ${session.totalEnfrentamientos}`)
        .setDescription(
            `**Competición:** ${session.competicion}\n` +
            `**Fecha:** ${session.fecha}\n\n` +
            `Ingrese los datos del **enfrentamiento #${session.currentEnfrentamiento}**`
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`fixture_enfrentamiento_${sessionId}`)
            .setLabel(`Ingresar Enfrentamiento #${session.currentEnfrentamiento}`)
            .setStyle(ButtonStyle.Primary)
    );

    if (interaction.isChatInputCommand ? interaction.isChatInputCommand() : false) {
        await interaction.editReply({ embeds: [embed], components: [row] });
    } else {
        await updateOrFollowUp(interaction, { embeds: [embed], components: [row] });
    }
}

async function showFixtureEnfrentamientoModal(interaction, sessionId) {
    const session = fixtureSessions.get(sessionId);
    if (!session) return interaction.reply({ content: 'Sesión expirada.', flags: MessageFlags.Ephemeral });

    const modal = new ModalBuilder()
        .setCustomId(`fixture_enfrentamiento_submit_${sessionId}`)
        .setTitle(`Enfrentamiento #${session.currentEnfrentamiento}`);

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('equipo_local')
                .setLabel('Equipo Local (nombre del equipo)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ej: CJA, SiuFC, Kunts FC...')
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('equipo_visitante')
                .setLabel('Equipo Visitante (nombre del equipo)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ej: Birdcam CF, Zinrack FC...')
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('hora')
                .setLabel('Hora (formato Hammertime, ej: <t:123456:F>)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('<t:1771810200:F>')
                .setRequired(true)
        )
    );

    await interaction.showModal(modal);
}

async function handleFixtureEnfrentamientoModal(interaction) {
    const sessionId = interaction.customId.slice('fixture_enfrentamiento_submit_'.length);
    const session = fixtureSessions.get(sessionId);
    if (!session) return interaction.reply({ content: 'Sesión expirada.', flags: MessageFlags.Ephemeral });

    const equipoLocalRaw = interaction.fields.getTextInputValue('equipo_local').trim();
    const equipoVisitanteRaw = interaction.fields.getTextInputValue('equipo_visitante').trim();
    const hora = interaction.fields.getTextInputValue('hora').trim();

    const equipoLocal = findTeamName(equipoLocalRaw);
    const equipoVisitante = findTeamName(equipoVisitanteRaw);

    if (!equipoLocal) {
        if (!interaction.replied && !interaction.deferred) await interaction.deferUpdate();
        return interaction.followUp({ content: `:x: Equipo local no encontrado: **${equipoLocalRaw}**. Revisa el nombre.`, flags: MessageFlags.Ephemeral });
    }
    if (!equipoVisitante) {
        if (!interaction.replied && !interaction.deferred) await interaction.deferUpdate();
        return interaction.followUp({ content: `:x: Equipo visitante no encontrado: **${equipoVisitanteRaw}**. Revisa el nombre.`, flags: MessageFlags.Ephemeral });
    }

    // Validar que el timestamp sea parseable
    const unix = parseHammertimeUnix(hora);
    if (!unix) {
        if (!interaction.replied && !interaction.deferred) await interaction.deferUpdate();
        return interaction.followUp({ content: `:x: Hora inválida. Usa el formato Hammertime: \`<t:UNIX:F>\``, flags: MessageFlags.Ephemeral });
    }

    session.enfrentamientos.push({ equipoLocal, equipoVisitante, hora });
    session.currentEnfrentamiento++;
    fixtureSessions.set(sessionId, session);

    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();

    if (session.currentEnfrentamiento <= session.totalEnfrentamientos) {
        return askFixtureEnfrentamiento(interaction, sessionId);
    } else {
        return showFixturePreview(interaction, sessionId);
    }
}

function generateFixtureMessage(session) {
    const emojiComp = getDivisionEmoji(session.competicion);
    const competicionDisplay = session.competicion.toUpperCase();
    const fechaDisplay = session.fecha.toUpperCase();

    let msg = `** ${emojiComp} ${competicionDisplay} | ${fechaDisplay} ${emojiComp}  **\n`;
    msg += `**●─────────────────────●**\n\n`;

    for (const e of session.enfrentamientos) {
        const emojiLocal = getTeamEmoji(e.equipoLocal);
        const emojiVis = getTeamEmoji(e.equipoVisitante);
        const roleLocal = TEAM_ROLES[e.equipoLocal];
        const roleVis = TEAM_ROLES[e.equipoVisitante];

        msg += `**${emojiComp} | ${emojiLocal} <@&${roleLocal}> VS <@&${roleVis}> ${emojiVis}** **[Local ${emojiLocal}]**\n`;
        msg += `🕐 **${e.hora}**\n\n`;
    }

    msg += `**Si necesitas cambiar el horario, abre ticket en <#1414386379106025605> para solicitarlo.**\n\n`;
    msg += `||@everyone||`;

    return msg;
}

async function showFixturePreview(interaction, sessionId) {
    const session = fixtureSessions.get(sessionId);
    const preview = generateFixtureMessage(session);

    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('✅ Preview del Fixture')
        .setDescription('**Revisa el fixture antes de publicar:**\n\n' + preview.substring(0, 3900));

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`fixture_publicar_${sessionId}`)
            .setLabel('✅ Publicar Fixture')
            .setStyle(ButtonStyle.Success)
    );

    await updateOrFollowUp(interaction, { embeds: [embed], components: [row] });
}

async function publicarFixture(interaction, sessionId) {
    const session = fixtureSessions.get(sessionId);
    if (!session) return interaction.reply({ content: 'Sesión expirada.', flags: MessageFlags.Ephemeral });

    const canal = interaction.guild.channels.cache.get(session.canalId);
    if (!canal) {
        return interaction.update({ content: ':x: No se encontró el canal.', embeds: [], components: [] });
    }

    const mensaje = generateFixtureMessage(session);

    try {
        await canal.send(mensaje);
        // Guardar en fixtures.json para el scheduler y pospone
        saveFixtureData(session);
        await updateOrFollowUp(interaction, { content: `:white_check_mark: ¡Fixture publicado en ${canal}!`, embeds: [], components: [] });
        fixtureSessions.delete(sessionId);
    } catch (error) {
        console.error('[FIXTURE] Error al publicar:', error);
        await updateOrFollowUp(interaction, { content: ':x: Error al publicar el fixture.', embeds: [], components: [] });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// POSPONE COMMAND
// ─────────────────────────────────────────────────────────────────────────────

// Autocomplete: lista todos los enfrentamientos activos (no pospuestos) del fixtures.json
async function handlePosponeAutocomplete(interaction) {
    try {
        const focused = interaction.options.getFocused().toLowerCase();
        const data = loadFixtures();
        const opciones = [];

        for (const fixture of data.fixtures) {
            for (const enf of (fixture.enfrentamientos || [])) {
                if (enf.pospuesto) continue;
                const label = `${fixture.competicion} | ${fixture.fecha} — ${enf.equipoLocal} vs ${enf.equipoVisitante}`;
                if (label.toLowerCase().includes(focused) || focused === '') {
                    opciones.push({ name: label.substring(0, 100), value: enf.id });
                }
                if (opciones.length >= 25) break;
            }
            if (opciones.length >= 25) break;
        }

        await interaction.respond(opciones);
    } catch (err) {
        console.error('[POSPONE AUTOCOMPLETE] Error:', err);
        await interaction.respond([]).catch(() => {});
    }
}

async function handlePospone(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!await isModeratorOrAdmin(interaction.guild, interaction.user.id)) {
        return interaction.editReply(':x: Solo los moderadores pueden usar este comando.');
    }

    const enfrentamientoId = interaction.options.getString('enfrentamiento');
    const nuevaHora = interaction.options.getString('nueva_hora');
    const canal = interaction.options.getChannel('canal');

    // Buscar el enfrentamiento en fixtures.json
    const data = loadFixtures();
    let enfEncontrado = null;
    let fixtureEncontrado = null;

    for (const fixture of data.fixtures) {
        for (const enf of (fixture.enfrentamientos || [])) {
            if (enf.id === enfrentamientoId) {
                enfEncontrado = enf;
                fixtureEncontrado = fixture;
                break;
            }
        }
        if (enfEncontrado) break;
    }

    if (!enfEncontrado) {
        return interaction.editReply(':x: No se encontró el enfrentamiento. Puede que ya haya sido pospuesto o no exista.');
    }

    // Validar la nueva hora
    const nuevoUnix = parseHammertimeUnix(nuevaHora);
    if (!nuevoUnix) {
        return interaction.editReply(':x: Hora inválida. Usa el formato Hammertime: `<t:UNIX:F>`');
    }

    // Marcar como pospuesto y actualizar hora
    enfEncontrado.pospuesto = true;
    enfEncontrado.horaPospuesta = nuevaHora;
    enfEncontrado.unixTimestampPospuesto = nuevoUnix;
    saveFixtures(data);

    // Construir y enviar el mensaje
    const roleLocal = TEAM_ROLES[enfEncontrado.equipoLocal];
    const roleVis = TEAM_ROLES[enfEncontrado.equipoVisitante];

    const msg = `**<@&${roleLocal}> VS <@&${roleVis}> se pasa para el ${nuevaHora}**`;

    try {
        await canal.send(msg);
        await interaction.editReply(
            `:white_check_mark: Pospone publicado en ${canal}.\n` +
            `**${enfEncontrado.equipoLocal} vs ${enfEncontrado.equipoVisitante}** → Nueva hora: ${nuevaHora}`
        );
        console.log(`[POSPONE] ${enfEncontrado.equipoLocal} vs ${enfEncontrado.equipoVisitante} pospuesto a ${nuevaHora}`);
    } catch (error) {
        console.error('[POSPONE] Error:', error);
        await interaction.editReply(':x: Error al publicar el pospone.');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO SANCIÓN DE EQUIPO POR FFT
// ─────────────────────────────────────────────────────────────────────────────
async function autoSancionarEquipoFFT(interaction, equipoFFT) {
    const sanctionChannel = interaction.guild.channels.cache.get(SANCTION_CHANNEL);
    const logsChannel = interaction.guild.channels.cache.get(SANCTION_LOGS_CHANNEL);
    const emojiSancion = SANCTION_EMOJIS.sancion;
    const teamRole = TEAM_ROLES[equipoFFT];

    const activeSanctions = getTeamSanctions(equipoFFT);
    const numeroSancion = activeSanctions.length + 1;
    const razonFFT = 'FFT';

    const sanctionMessage =
        `## ${emojiSancion} AVISO ${numeroSancion}/2 ${emojiSancion}\n` +
        `- **Equipo: ${teamRole ? `<@&${teamRole}>` : equipoFFT}**\n` +
        `- **Razón: ${razonFFT}**`;

    let sentMessage = null;
    if (sanctionChannel) {
        sentMessage = await sanctionChannel.send(sanctionMessage);
    }

    const sanction = createTeamSanction(equipoFFT, razonFFT, sentMessage ? sentMessage.id : null);
    const totalSanctions = getTeamSanctions(equipoFFT).length;
    const isDisband = totalSanctions >= 2;

    if (logsChannel) {
        await logsChannel.send(`**[AUTO-FFT] ID:** \`${sanction.id}\` **| EQUIPO:** ${teamRole ? `<@&${teamRole}>` : equipoFFT} **| RAZÓN:** ${razonFFT} **| DISBAND:** ${isDisband ? 'Sí' : 'No'}`);
        if (isDisband) {
            await logsChannel.send(`⚠️ **${teamRole ? `<@&${teamRole}>` : equipoFFT} llegó a 2 sanciones por FFT. Por reglamento, corresponde DISBAND.**`);
        }
    }

    console.log(`[AUTO-SANCION-TEAM-FFT] Sanción ${numeroSancion}/2 aplicada a equipo ${equipoFFT}`);

    // Si es la segunda sanción, sancionar al dueño del equipo con "Mala administración del club" - 1 Season
    if (isDisband) {
        const players = getTeamPlayers(equipoFFT);
        const dueno = players.find(p => p.role === 'Dueño');

        if (dueno) {
            try {
                const member = await interaction.guild.members.fetch(dueno.userId).catch(() => null);
                if (member) {
                    const activeDuenoSanctions = getUserActiveSanctions(dueno.userId);
                    const numeroDueno = activeDuenoSanctions.length === 0 ? 1 : Math.max(...activeDuenoSanctions.map(x => x.numero)) + 1;
                    const tipoDueno = '1 Season';
                    const razonDueno = 'Mala administración del club';
                    const sanctionDataDueno = SANCTION_TYPES[tipoDueno];
                    const duracionRestanteDueno = sanctionDataDueno.gw !== null ? `${sanctionDataDueno.gw} GW` : sanctionDataDueno.duration;

                    const duenoSanctionMsg =
                        `## ${emojiSancion} SANCIÓN #${numeroDueno} ${emojiSancion}\n` +
                        `- **Usuario: <@${dueno.userId}>**\n` +
                        `- **Razón: ${razonDueno}**\n` +
                        `- **Duración: ${sanctionDataDueno.duration}**\n` +
                        `- **Duración Restante: ${duracionRestanteDueno}**\n` +
                        `- **Estado: Activa**\n` +
                        `-# *(Sanción automática por DISBAND/FFT de ${equipoFFT})*`;

                    let sentDuenoMsg = null;
                    if (sanctionChannel) {
                        sentDuenoMsg = await sanctionChannel.send(duenoSanctionMsg);
                    }

                    createSanction(dueno.userId, numeroDueno, tipoDueno, razonDueno, sentDuenoMsg ? sentDuenoMsg.id : null);

                    if (!member.roles.cache.has(SANCIONADO_ROLE)) {
                        await member.roles.add(SANCIONADO_ROLE);
                    }

                    if (logsChannel) {
                        await logsChannel.send(`**[AUTO-DISBAND-FFT] DUEÑO SANCIONADO:** <@${dueno.userId}> **| EQUIPO:** ${equipoFFT} **| RAZÓN:** ${razonDueno} **| DURACIÓN:** ${tipoDueno}`);
                    }

                    console.log(`[AUTO-SANCION-DUENO-FFT] Dueño <@${dueno.userId}> de ${equipoFFT} sancionado por Mala administración del club`);
                }
            } catch (err) {
                console.error(`[AUTO-SANCION-DUENO-FFT] Error al sancionar dueño de ${equipoFFT}:`, err);
            }
        } else {
            if (logsChannel) {
                await logsChannel.send(`⚠️ **[AUTO-FFT]** No se encontró dueño registrado en **${equipoFFT}** para aplicar sanción personal por DISBAND.`);
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ATF-TV COMMAND
// ─────────────────────────────────────────────────────────────────────────────
const atfTvSessions = new Map();

async function handleAtfTv(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!await isModeratorOrAdmin(interaction.guild, interaction.user.id)) {
        return interaction.editReply(':x: Solo los moderadores pueden usar este comando.');
    }

    const equipoLocal = interaction.options.getString('equipo_local');
    const equipoVisitante = interaction.options.getString('equipo_visitante');
    const competicion = interaction.options.getString('competicion');
    const fecha = interaction.options.getString('fecha');
    const canal = interaction.options.getChannel('canal');
    const stream = interaction.options.getString('stream');
    const miniatura = interaction.options.getAttachment('miniatura') || null;
    const linkJuego = interaction.options.getString('link_juego') || null;

    const sessionId = `atftv_${interaction.user.id}_${Date.now()}`;

    atfTvSessions.set(sessionId, {
        equipoLocal,
        equipoVisitante,
        competicion,
        fecha,
        canalId: canal.id,
        stream,
        miniaturaUrl: miniatura ? miniatura.url : null,
        linkJuego,
        userId: interaction.user.id
    });

    const emojiLocal = getTeamEmoji(equipoLocal);
    const emojiVis = getTeamEmoji(equipoVisitante);
    const emojiComp = getDivisionEmoji(competicion);

    const previewLines = [
        `# ${emojiLocal} ${equipoLocal} VS ${equipoVisitante} ${emojiVis} | ${emojiComp} ${competicion} ${fecha}`,
        `- **Link: ${stream}**`,
        linkJuego ? `- **Partido: ${linkJuego}**` : null
    ].filter(Boolean).join('\n');

    const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('📺 Preview ATF TV')
        .setDescription('**Revisa el anuncio antes de publicar:**\n\n' + previewLines)
        .setFooter({ text: `Se publicará en: #${canal.name}` });

    if (miniatura) embed.setImage(miniatura.url);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`atftv_publicar_${sessionId}`)
            .setLabel('✅ Publicar')
            .setStyle(ButtonStyle.Success)
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
}

async function publicarAtfTv(interaction, sessionId) {
    const session = atfTvSessions.get(sessionId);
    if (!session) {
        return interaction.reply({ content: 'Sesión expirada.', flags: MessageFlags.Ephemeral });
    }

    const canal = interaction.guild.channels.cache.get(session.canalId);
    if (!canal) {
        return interaction.update({ content: ':x: No se encontró el canal.', embeds: [], components: [] });
    }

    const emojiLocal = getTeamEmoji(session.equipoLocal);
    const emojiVis = getTeamEmoji(session.equipoVisitante);
    const emojiComp = getDivisionEmoji(session.competicion);

    const lines = [
        `# ${emojiLocal} ${session.equipoLocal} VS ${session.equipoVisitante} ${emojiVis} | ${emojiComp} ${session.competicion} ${session.fecha}`,
        `- **Link: ${session.stream}**`,
        session.linkJuego ? `- **Partido: ${session.linkJuego}**` : null
    ].filter(Boolean).join('\n');

    try {
        const sendPayload = { content: lines };
        if (session.miniaturaUrl) sendPayload.files = [session.miniaturaUrl];
        await canal.send(sendPayload);
        await updateOrFollowUp(interaction, { content: `:white_check_mark: ¡Anuncio ATF TV publicado en ${canal}!`, embeds: [], components: [] });
        atfTvSessions.delete(sessionId);
    } catch (error) {
        console.error('[ATF-TV] Error al publicar:', error);
        await updateOrFollowUp(interaction, { content: ':x: Error al publicar el anuncio.', embeds: [], components: [] });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PREDICCIONES SYSTEM
// ─────────────────────────────────────────────────────────────────────────────
const PREDICCIONES_FILE = path.join(__dirname, 'predicciones.json');
const prediccionesSessions = new Map(); // mantenido para compatibilidad con sesiones activas

function loadPredicciones() {
    if (fs.existsSync(PREDICCIONES_FILE)) {
        try { return JSON.parse(fs.readFileSync(PREDICCIONES_FILE, 'utf-8')); } catch (e) {}
    }
    return { matches: {} };
}

function savePredicciones(data) {
    fs.writeFileSync(PREDICCIONES_FILE, JSON.stringify(data, null, 4), 'utf-8');
}

function createPrediccionMatch(matchId, competicion, fecha, equipoLocal, equipoVisitante, messageId, channelId) {
    const data = loadPredicciones();
    data.matches[matchId] = {
        id: matchId,
        competicion,
        fecha,
        equipoLocal,
        equipoVisitante,
        messageId,
        channelId,
        votes: {},    // { userId: 'local' | 'empate' | 'visitante' }
        resultado: null,
        timestamp: Date.now()
    };
    savePredicciones(data);
}

function getPrediccionMatch(matchId) {
    const data = loadPredicciones();
    return data.matches[matchId] || null;
}

function setPrediccionVote(matchId, userId, opcion) {
    const data = loadPredicciones();
    if (!data.matches[matchId]) return false;
    if (data.matches[matchId].votes[userId]) return false; // ya votó
    data.matches[matchId].votes[userId] = opcion;
    savePredicciones(data);
    return true;
}

function resolvePrediccionMatch(matchId, resultado) {
    const data = loadPredicciones();
    if (!data.matches[matchId]) return null;
    const match = data.matches[matchId];
    match.resultado = resultado;
    const ganadores = Object.entries(match.votes)
        .filter(([, opcion]) => opcion === resultado)
        .map(([userId]) => userId);
    delete data.matches[matchId];
    savePredicciones(data);
    return { match, ganadores };
}

function getAllActivePredicciones() {
    const data = loadPredicciones();
    return Object.values(data.matches).filter(m => m.resultado === null);
}





// ── /predicciones command ─────────────────────────────────────────────────────
async function handlePredicciones(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!await isModeratorOrAdmin(interaction.guild, interaction.user.id)) {
        return interaction.editReply(':x: Solo los moderadores pueden usar este comando.');
    }

    const competicion = interaction.options.getString('competicion');
    const fecha = interaction.options.getString('fecha');
    const totalEnfrentamientos = interaction.options.getInteger('enfrentamientos');
    const canal = interaction.options.getChannel('canal');

    const sessionId = `pred_${interaction.user.id}_${Date.now()}`;

    prediccionesSessions.set(sessionId, {
        competicion,
        fecha,
        totalEnfrentamientos,
        canalId: canal.id,
        currentEnfrentamiento: 1,
        enfrentamientos: [],
        userId: interaction.user.id
    });

    await askPrediccionEnfrentamiento(interaction, sessionId);
}

async function askPrediccionEnfrentamiento(interaction, sessionId) {
    const session = prediccionesSessions.get(sessionId);
    if (!session) return interaction.editReply({ content: 'Sesión expirada.', embeds: [], components: [] });

    const embed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle(`🔮 Predicciones — Enfrentamiento ${session.currentEnfrentamiento} de ${session.totalEnfrentamientos}`)
        .setDescription(
            `**Competición:** ${session.competicion}\n` +
            `**Fecha:** ${session.fecha}\n\n` +
            `Ingrese los equipos del **enfrentamiento #${session.currentEnfrentamiento}**`
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`pred_enfrentamiento_${sessionId}`)
            .setLabel(`Ingresar Enfrentamiento #${session.currentEnfrentamiento}`)
            .setStyle(ButtonStyle.Primary)
    );

    if (interaction.isChatInputCommand ? interaction.isChatInputCommand() : false) {
        await interaction.editReply({ embeds: [embed], components: [row] });
    } else {
        await updateOrFollowUp(interaction, { embeds: [embed], components: [row] });
    }
}

async function showPrediccionEnfrentamientoModal(interaction, sessionId) {
    const session = prediccionesSessions.get(sessionId);
    if (!session) return interaction.reply({ content: 'Sesión expirada.', flags: MessageFlags.Ephemeral });

    const modal = new ModalBuilder()
        .setCustomId(`pred_enfrentamiento_submit_${sessionId}`)
        .setTitle(`Enfrentamiento #${session.currentEnfrentamiento}`);

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('equipo_local')
                .setLabel('Equipo Local')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ej: CJA, SiuFC, Kunts FC...')
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('equipo_visitante')
                .setLabel('Equipo Visitante')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ej: Birdcam CF, Zinrack FC...')
                .setRequired(true)
        )
    );

    await interaction.showModal(modal);
}

async function handlePrediccionEnfrentamientoModal(interaction) {
    const sessionId = interaction.customId.slice('pred_enfrentamiento_submit_'.length);
    const session = prediccionesSessions.get(sessionId);
    if (!session) return interaction.reply({ content: 'Sesión expirada.', flags: MessageFlags.Ephemeral });

    const equipoLocalRaw = interaction.fields.getTextInputValue('equipo_local').trim();
    const equipoVisitanteRaw = interaction.fields.getTextInputValue('equipo_visitante').trim();

    const equipoLocal = findTeamName(equipoLocalRaw);
    const equipoVisitante = findTeamName(equipoVisitanteRaw);

    if (!equipoLocal) {
        if (!interaction.replied && !interaction.deferred) await interaction.deferUpdate();
        return interaction.followUp({ content: `:x: Equipo local no encontrado: **${equipoLocalRaw}**.`, flags: MessageFlags.Ephemeral });
    }
    if (!equipoVisitante) {
        if (!interaction.replied && !interaction.deferred) await interaction.deferUpdate();
        return interaction.followUp({ content: `:x: Equipo visitante no encontrado: **${equipoVisitanteRaw}**.`, flags: MessageFlags.Ephemeral });
    }

    session.enfrentamientos.push({ equipoLocal, equipoVisitante });
    session.currentEnfrentamiento++;
    prediccionesSessions.set(sessionId, session);

    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();

    if (session.currentEnfrentamiento <= session.totalEnfrentamientos) {
        return askPrediccionEnfrentamiento(interaction, sessionId);
    } else {
        return showPrediccionPreview(interaction, sessionId);
    }
}

async function showPrediccionPreview(interaction, sessionId) {
    const session = prediccionesSessions.get(sessionId);

    const emojiComp = getDivisionEmoji(session.competicion);
    const lines = session.enfrentamientos.map((e, i) => {
        const emojiL = getTeamEmoji(e.equipoLocal);
        const emojiV = getTeamEmoji(e.equipoVisitante);
        return `${i + 1}. **${emojiL} ${e.equipoLocal}** VS **${e.equipoVisitante} ${emojiV}**`;
    }).join('\n');

    const embed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle('✅ Preview de Predicciones')
        .setDescription(
            `**${emojiComp} ${session.competicion.toUpperCase()} | ${session.fecha.toUpperCase()} ${emojiComp}**\n\n` +
            lines + '\n\nRevisa y publica.'
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`pred_publicar_${sessionId}`)
            .setLabel('✅ Publicar Predicciones')
            .setStyle(ButtonStyle.Success)
    );

    await updateOrFollowUp(interaction, { embeds: [embed], components: [row] });
}

async function publicarPredicciones(interaction, sessionId) {
    const session = prediccionesSessions.get(sessionId);
    if (!session) return interaction.reply({ content: 'Sesión expirada.', flags: MessageFlags.Ephemeral });

    const canal = interaction.guild.channels.cache.get(session.canalId);
    if (!canal) {
        return interaction.update({ content: ':x: No se encontró el canal.', embeds: [], components: [] });
    }

    const emojiComp = getDivisionEmoji(session.competicion);
    const competicionDisplay = session.competicion.toUpperCase();
    const fechaDisplay = session.fecha.toUpperCase();

    try {
        await canal.send(`## ${emojiComp} __${competicionDisplay} | ${fechaDisplay}__ ${emojiComp}`);

        for (const e of session.enfrentamientos) {
            const matchId = `pred_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            const emojiLocal = getTeamEmoji(e.equipoLocal);
            const emojiVis = getTeamEmoji(e.equipoVisitante);

            const content = `**${emojiLocal} ${e.equipoLocal} VS ${e.equipoVisitante} ${emojiVis}**`;

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`pred_vote_${matchId}_local`)
                    .setLabel(e.equipoLocal)
                    .setEmoji(emojiLocal.match(/\d{17,20}/)?.[0] ? { id: emojiLocal.match(/\d{17,20}/)[0] } : { name: '🏠' })
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`pred_vote_${matchId}_empate`)
                    .setLabel('Empate')
                    .setEmoji({ name: '⚔' })
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`pred_vote_${matchId}_visitante`)
                    .setLabel(e.equipoVisitante)
                    .setEmoji(emojiVis.match(/\d{17,20}/)?.[0] ? { id: emojiVis.match(/\d{17,20}/)[0] } : { name: '✈️' })
                    .setStyle(ButtonStyle.Danger)
            );

            const msg = await canal.send({ content, components: [row] });

            createPrediccionMatch(matchId, session.competicion, session.fecha, e.equipoLocal, e.equipoVisitante, msg.id, canal.id);

            await new Promise(r => setTimeout(r, 300));
        }

        await updateOrFollowUp(interaction, { content: `:white_check_mark: ¡Predicciones publicadas en ${canal}!`, embeds: [], components: [] });
        prediccionesSessions.delete(sessionId);
    } catch (error) {
        console.error('[PREDICCIONES] Error al publicar:', error);
        await updateOrFollowUp(interaction, { content: ':x: Error al publicar las predicciones.', embeds: [], components: [] });
    }
}

// ── Scheduler de predicciones automáticas ─────────────────────────────────────
// Canal fijo donde se publican las predicciones automáticas
const PREDICCIONES_AUTO_CHANNEL = '1414386379730718764';

function startPrediccionesAutoScheduler(clientInstance) {
    const PRED_SENT_FILE = path.join(__dirname, 'predicciones_sent.json');

    function loadSent() {
        if (fs.existsSync(PRED_SENT_FILE)) {
            try { return JSON.parse(fs.readFileSync(PRED_SENT_FILE, 'utf-8')); } catch (e) {}
        }
        return {};
    }

    function markSent(fixtureId) {
        const data = loadSent();
        data[fixtureId] = true;
        fs.writeFileSync(PRED_SENT_FILE, JSON.stringify(data, null, 4), 'utf-8');
    }

    setInterval(async () => {
        try {
            const data = loadFixtures();
            const sent = loadSent();
            const now = Math.floor(Date.now() / 1000);
            const TWENTY_FOUR_HOURS = 24 * 60 * 60;
            // Ventana de 10 minutos centrada en las 24h para evitar dobles envíos
            const WINDOW_MIN = TWENTY_FOUR_HOURS - 5 * 60;
            const WINDOW_MAX = TWENTY_FOUR_HOURS + 5 * 60;

            for (const fixture of data.fixtures) {
                if (sent[fixture.id]) continue;

                const enfrentamientos = fixture.enfrentamientos || [];
                if (enfrentamientos.length === 0) continue;

                // Tomar el timestamp del primer partido (el más temprano)
                const timestamps = enfrentamientos
                    .map(e => e.unixTimestamp)
                    .filter(t => t && t > 0);

                if (timestamps.length === 0) continue;

                const primerPartido = Math.min(...timestamps);
                const diff = primerPartido - now;

                // Publicar si el primer partido es en ~24h
                if (diff >= WINDOW_MIN && diff <= WINDOW_MAX) {
                    markSent(fixture.id);

                    const guild = clientInstance.guilds.cache.first();
                    if (!guild) continue;

                    const canal = guild.channels.cache.get(PREDICCIONES_AUTO_CHANNEL);
                    if (!canal) {
                        console.warn('[PRED-AUTO] Canal de predicciones no encontrado:', PREDICCIONES_AUTO_CHANNEL);
                        continue;
                    }

                    const emojiComp = getDivisionEmoji(fixture.competicion);
                    const competicionDisplay = fixture.competicion.toUpperCase();
                    const fechaDisplay = fixture.fecha.toUpperCase();

                    // Cabecera
                    await canal.send(`## ${emojiComp} __${competicionDisplay} | ${fechaDisplay}__ ${emojiComp}`);

                    // Un mensaje con botones por cada enfrentamiento
                    for (const enf of enfrentamientos) {
                        const matchId = `pred_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                        const emojiLocal = getTeamEmoji(enf.equipoLocal);
                        const emojiVis = getTeamEmoji(enf.equipoVisitante);

                        const content = `**${emojiLocal} ${enf.equipoLocal} VS ${enf.equipoVisitante} ${emojiVis}**`;

                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(`pred_vote_${matchId}_local`)
                                .setLabel(enf.equipoLocal)
                                .setEmoji(emojiLocal.match(/\d{17,20}/)?.[0] ? { id: emojiLocal.match(/\d{17,20}/)[0] } : { name: '🏠' })
                                .setStyle(ButtonStyle.Primary),
                            new ButtonBuilder()
                                .setCustomId(`pred_vote_${matchId}_empate`)
                                .setLabel('Empate')
                                .setEmoji({ name: '⚔' })
                                .setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder()
                                .setCustomId(`pred_vote_${matchId}_visitante`)
                                .setLabel(enf.equipoVisitante)
                                .setEmoji(emojiVis.match(/\d{17,20}/)?.[0] ? { id: emojiVis.match(/\d{17,20}/)[0] } : { name: '✈️' })
                                .setStyle(ButtonStyle.Danger)
                        );

                        const msg = await canal.send({ content, components: [row] });

                        createPrediccionMatch(
                            matchId,
                            fixture.competicion,
                            fixture.fecha,
                            enf.equipoLocal,
                            enf.equipoVisitante,
                            msg.id,
                            canal.id
                        );

                        await new Promise(r => setTimeout(r, 300));
                    }

                    console.log(`[PRED-AUTO] Predicciones enviadas para fixture ${fixture.id} (${fixture.competicion} | ${fixture.fecha})`);
                }
            }
        } catch (err) {
            console.error('[PRED-AUTO] Error en scheduler de predicciones:', err);
        }
    }, 60 * 1000); // revisa cada 60 segundos

    console.log('[PRED-AUTO] Scheduler de predicciones automáticas iniciado.');
}

// ── Botón de voto ─────────────────────────────────────────────────────────────
async function handlePrediccionVote(interaction) {
    try {
        // customId: pred_vote_{matchId}_{opcion}
        const parts = interaction.customId.split('_');
        // pred_vote_pred_TIMESTAMP_RAND_opcion
        // mejor: separar desde el final
        const opcion = parts[parts.length - 1]; // local | empate | visitante
        const matchId = parts.slice(2, parts.length - 1).join('_');

        const match = getPrediccionMatch(matchId);
        if (!match) {
            return interaction.reply({ content: ':x: Esta predicción ya no está disponible.', flags: MessageFlags.Ephemeral });
        }

        if (match.votes[interaction.user.id]) {
            const yaVoto = match.votes[interaction.user.id];
            const opciones = { local: match.equipoLocal, empate: 'Empate', visitante: match.equipoVisitante };
            return interaction.reply({
                content: `❌ Ya enviaste tu predicción: **${opciones[yaVoto]}**. No se puede cambiar.`,
                flags: MessageFlags.Ephemeral
            });
        }

        const guardado = setPrediccionVote(matchId, interaction.user.id, opcion);
        if (!guardado) {
            return interaction.reply({ content: ':x: No se pudo guardar tu predicción.', flags: MessageFlags.Ephemeral });
        }

        const opciones = { local: match.equipoLocal, empate: 'Empate', visitante: match.equipoVisitante };
        const emojis = {
            local: getTeamEmoji(match.equipoLocal),
            empate: '⚔',
            visitante: getTeamEmoji(match.equipoVisitante)
        };

        await interaction.reply({
            content: `✅ **¡Tu predicción fue guardada!**\n${emojis[opcion]} Elegiste: **${opciones[opcion]}** en el partido **${match.equipoLocal} vs ${match.equipoVisitante}**`,
            flags: MessageFlags.Ephemeral
        });

        console.log(`[PREDICCIONES] ${interaction.user.tag} votó ${opcion} en ${match.equipoLocal} vs ${match.equipoVisitante}`);
    } catch (error) {
        console.error('[PREDICCIONES VOTE] Error:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: ':x: Error al procesar tu voto.', flags: MessageFlags.Ephemeral });
        }
    }
}

// ── Autocomplete para /predicciones-result ────────────────────────────────────
async function handlePrediccionesResultAutocomplete(interaction) {
    try {
        const focused = interaction.options.getFocused().toLowerCase();
        const activas = getAllActivePredicciones();
        const opciones = activas
            .filter(m => {
                const label = `${m.competicion} | ${m.fecha} — ${m.equipoLocal} vs ${m.equipoVisitante}`;
                return label.toLowerCase().includes(focused) || focused === '';
            })
            .slice(0, 25)
            .map(m => ({
                name: `${m.competicion} | ${m.fecha} — ${m.equipoLocal} vs ${m.equipoVisitante}`.substring(0, 100),
                value: m.id
            }));

        await interaction.respond(opciones);
    } catch (err) {
        console.error('[PREDICCIONES AUTOCOMPLETE] Error:', err);
        await interaction.respond([]).catch(() => {});
    }
}

// ── /predicciones-result command ──────────────────────────────────────────────
async function handlePrediccionesResult(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!await isModeratorOrAdmin(interaction.guild, interaction.user.id)) {
        return interaction.editReply(':x: Solo los moderadores pueden usar este comando.');
    }

    const matchId = interaction.options.getString('prediccion');
    const resultado = interaction.options.getString('resultado');

    const match = getPrediccionMatch(matchId);
    if (!match) {
        return interaction.editReply(':x: No se encontró la predicción. Puede que ya haya sido resuelta.');
    }

    const resolved = resolvePrediccionMatch(matchId, resultado);
    if (!resolved) {
        return interaction.editReply(':x: Error al resolver la predicción.');
    }

    const { match: matchData, ganadores } = resolved;
    const opciones = { local: matchData.equipoLocal, empate: 'Empate', visitante: matchData.equipoVisitante };
    const totalVotos = Object.keys(matchData.votes).length;

    // Notificar a los ganadores por MD
    let notificados = 0;
    let errores = 0;
    for (const userId of ganadores) {
        try {
            const user = await interaction.client.users.fetch(userId);
            await user.send(
                `## 🎉 ¡Acertaste tu predicción!\n` +
                `🏆 **Partido:** ${matchData.equipoLocal} vs ${matchData.equipoVisitante}\n` +
                `📅 **${matchData.competicion} | ${matchData.fecha}**\n` +
                `✅ Elegiste: **${opciones[resultado]}** — ¡y acertaste!`
            );
            notificados++;
        } catch (e) {
            errores++;
            console.warn(`[PREDICCIONES RESULT] No se pudo enviar MD a ${userId}:`, e.message);
        }
    }

    // Editar el mensaje original para indicar que ya terminó
    try {
        const canal = interaction.guild.channels.cache.get(matchData.channelId);
        if (canal && matchData.messageId) {
            const msg = await canal.messages.fetch(matchData.messageId);
            await msg.edit({
                content: msg.content + `\n\n> **✅ Resultado: ${opciones[resultado]}** | ${ganadores.length}/${totalVotos} acertaron`,
                components: []
            });
        }
    } catch (e) {
        console.warn('[PREDICCIONES RESULT] No se pudo editar el mensaje:', e.message);
    }

    await interaction.editReply(
        `:white_check_mark: Predicción resuelta.\n` +
        `**Partido:** ${matchData.equipoLocal} vs ${matchData.equipoVisitante}\n` +
        `**Resultado:** ${opciones[resultado]}\n` +
        `**Votos totales:** ${totalVotos}\n` +
        `**Acertaron:** ${ganadores.length}\n` +
        `**Notificados por MD:** ${notificados}${errores > 0 ? ` (${errores} sin MD habilitado)` : ''}`
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL ERROR HANDLERS
// ─────────────────────────────────────────────────────────────────────────────
process.on('unhandledRejection', (error) => {
    if (error && error.code === 10062) {
        console.warn('[WARN] Interacción expirada (10062) — ignorada.');
        return;
    }
    console.error('[UNHANDLED REJECTION]', error);
});

client.on('error', (error) => {
    if (error && error.code === 10062) {
        console.warn('[WARN] Interacción expirada en cliente (10062) — ignorada.');
        return;
    }
    console.error('[CLIENT ERROR]', error);
});

const token = process.env.DISCORD_TOKEN || process.argv[2];
if (!token) {
    console.error('Error: No se proporcionó un token de Discord.');
    process.exit(1);
}

const VERIFY_FILE = path.join(__dirname, 'verify.json');

function loadVerify() {
    if (fs.existsSync(VERIFY_FILE)) {
        try { return JSON.parse(fs.readFileSync(VERIFY_FILE, 'utf-8')); } catch (e) {}
    }
    return { config: null, codes: {}, links: {} };
}

function saveVerify(data) {
    fs.writeFileSync(VERIFY_FILE, JSON.stringify(data, null, 4), 'utf-8');
}

// Genera código único tipo "ABC-123"
function generateVerifyCode() {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const numbers = '0123456789';
    const l = () => letters[Math.floor(Math.random() * letters.length)];
    const n = () => numbers[Math.floor(Math.random() * numbers.length)];
    return `${l()}${l()}${l()}-${n()}${n()}${n()}`;
}

// Limpia códigos expirados
function cleanExpiredCodes() {
    const data = loadVerify();
    const now = Date.now();
    let changed = false;
    for (const [code, entry] of Object.entries(data.codes)) {
        if (entry.expires < now) {
            delete data.codes[code];
            changed = true;
        }
    }
    if (changed) saveVerify(data);
}

// ─────────────────────────────────────────────────────────────────────────────
// /setup-verify
// ─────────────────────────────────────────────────────────────────────────────
async function handleSetupVerify(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!await isAdminOnly(interaction.guild, interaction.user.id)) {
        return interaction.editReply(':x: Solo los administradores pueden usar este comando.');
    }

    const canal = interaction.options.getChannel('canal');
    const mensaje = interaction.options.getString('mensaje');
    const rol = interaction.options.getRole('rol');

    // Guardar config
    const data = loadVerify();
    data.config = {
        channelId: canal.id,
        roleId: rol.id,
        message: mensaje
    };
    saveVerify(data);

    // Crear embed + botón
    const mensajeFormateado = mensaje.replace(/\//g, '\n');

    const embed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('🔓 Verify ATF')
        .setDescription(mensajeFormateado)  // <-- usar la versión formateada
        .setFooter({ text: 'ATF Staffs | We will only collect your Roblox username.' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('verify_now')
            .setLabel('Verify Now')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅')
    );

    try {
        await canal.send({ embeds: [embed], components: [row] });
        await interaction.editReply(`✅ Panel de verificación enviado a ${canal}.`);
    } catch (e) {
        console.error('[VERIFY] Error al enviar panel:', e);
        await interaction.editReply(':x: No se pudo enviar el mensaje al canal. ¿Tengo permisos?');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Botón "Verify Now"
// ─────────────────────────────────────────────────────────────────────────────
async function handleVerifyButton(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const data = loadVerify();
    if (!data.config) {
        return interaction.editReply(':x: El sistema de verificación no está configurado aún.');
    }

    // Verificar si ya está vinculado
    const userId = interaction.user.id;
    if (data.links[userId]) {
        const robloxUser = data.links[userId].roblox_user;
        const roleId = data.config?.roleId;
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        
        // Comprobar si tiene el rol
        if (member && roleId && !member.roles.cache.has(roleId)) {
            // No tiene el rol, borrar vinculación y dejar que se vuelva a verificar
            delete data.links[userId];
            saveVerify(data);
            // Continúa el flujo normal (no hace return aquí)
        } else {
            return interaction.editReply(`✅ Ya estás verificado como **${robloxUser}** en Roblox.`);
        }
    }

    // Limpiar códigos viejos y ver si tiene uno pendiente
    cleanExpiredCodes();
    const existingEntry = Object.entries(data.codes).find(([, v]) => v.discord_id === userId);
    
    let code;
    if (existingEntry) {
        code = existingEntry[0];
        // Renovar expiración
        data.codes[code].expires = Date.now() + 10 * 60 * 1000;
        saveVerify(data);
    } else {
        // Generar código nuevo
        let attempts = 0;
        do {
            code = generateVerifyCode();
            attempts++;
        } while (data.codes[code] && attempts < 10);

        data.codes[code] = {
            discord_id: userId,
            expires: Date.now() + 10 * 60 * 1000
        };
        saveVerify(data);
    }

    const embed = new EmbedBuilder()
        .setColor(0x00b4d8)
        .setTitle('🔑 Tu Código de Verificación')
        .setDescription(
            `**Tu código es:**\n` +
            `# \`${code}\`\n\n` +
            `1. Ve al juego en Roblox (https://www.roblox.com/es/games/80977335715556/Verify-ATF)\n` +
            `2. Escribe el código \`${code}\` en la zona de verificacion\n` +
            `3. El bot te asignará el rol automáticamente\n\n` +
            `⏰ Este código expira en **10 minutos**`
        )
        .setFooter({ text: 'No compartas este código con nadie.' });

    await interaction.editReply({ embeds: [embed] });
    console.log(`[VERIFY] Código generado para ${interaction.user.tag}: ${code}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint interno: el API llama esto cuando Roblox confirma el código
// El bot exporta una función que el API server puede llamar
// ─────────────────────────────────────────────────────────────────────────────
async function processVerification({ code, roblox_user, roblox_id }) {
    const data = loadVerify();

    // Validar código
    const entry = data.codes[code];
    if (!entry) return { success: false, error: 'Código inválido o expirado' };
    if (entry.expires < Date.now()) {
        delete data.codes[code];
        saveVerify(data);
        return { success: false, error: 'Código expirado' };
    }

    const discordId = entry.discord_id;

    // Guardar vinculación
    data.links[discordId] = {
        roblox_user,
        roblox_id,
        verified_at: Date.now()
    };
    delete data.codes[code];
    saveVerify(data);

    // Aplicar en Discord
    try {
        const guild = client.guilds.cache.first(); // Cambia si tienes múltiples servidores
        if (!guild) return { success: false, error: 'Servidor no encontrado' };

        const member = await guild.members.fetch(discordId).catch(() => null);
        if (!member) return { success: false, error: 'Usuario no encontrado en el servidor' };

        // Cambiar nickname
        try {
            let displayName = roblox_user; // fallback al username
        try {
            const res = await fetch(`https://users.roblox.com/v1/users/${roblox_id}`);
            const json = await res.json();
            if (json.displayName) displayName = json.displayName;
            } catch (e) {
            console.warn('[VERIFY] No se pudo obtener displayName de Roblox:', e.message);
            }
        await member.setNickname(`${displayName} (@${roblox_user})`);
        } catch (e) {
            console.warn(`[VERIFY] No se pudo cambiar nickname de ${discordId}:`, e.message);
        }

        // Asignar rol
        const roleId = data.config?.roleId;
        if (roleId) {
            try {
                await member.roles.add(roleId);
            } catch (e) {
                console.warn(`[VERIFY] No se pudo asignar rol a ${discordId}:`, e.message);
            }
        }

        // Notificar al usuario por DM
        try {
            await member.user.send(
                `✅ **¡Verificación completada!**\n` +
                `Tu cuenta de Roblox **${roblox_user}** ha sido vinculada a tu Discord.\n` +
                `Se te asignó el nickname y el rol correspondiente.`
            );
        } catch (e) {
            // DMs cerrados, no es crítico
        }

        console.log(`[VERIFY] ✅ ${discordId} verificado como Roblox: ${roblox_user} (${roblox_id})`);
        return { success: true, discord_id: discordId, roblox_user, roblox_id };

    } catch (e) {
        console.error('[VERIFY] Error al aplicar verificación:', e);
        return { success: false, error: e.message };
    }
}

// Exportar para que el API server pueda usar
global._verifyBot = { processVerification };

// Limpiar códigos expirados cada 5 minutos
setInterval(cleanExpiredCodes, 5 * 60 * 1000);

client.login(token)
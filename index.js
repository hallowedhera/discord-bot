const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./bot.db", (err) => {
  if (err) console.error(err);
  else console.log("📦 SQLite connected");
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS role_messages (
      guild_id TEXT,
      message_id TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 0,
      last_daily INTEGER DEFAULT 0
    )
  `);
});

const http = require("http");
const axios = require("axios");
const Parser = require("rss-parser");

const {
  Client,
  GatewayIntentBits,
  Partials
} = require("discord.js");

// =======================
// KEEP ALIVE SERVER
// =======================
const PORT = process.env.PORT || 10000;

http.createServer((req, res) => {
  res.write("Bot is alive");
  res.end();
}).listen(PORT, () => {
  console.log("HTTP server running on port", PORT);
});

console.log("SCRIPT STARTED");

process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);

// =======================
// CLIENT
// =======================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User,
    Partials.GuildMember
  ]
});

client.on("error", console.error);
client.on("warn", console.warn);

// =======================
// CONFIG
// =======================
const LEVEL_CHANNEL_ID = "1395485196266111017";
const ALERT_CHANNEL_ID = process.env.ALERT_CHANNEL_ID;

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_USERNAME = process.env.TWITCH_USERNAME;

const YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;
const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME;

const parser = new Parser();

// =======================
// XP SYSTEM
// =======================
function getLevel(xp) {
  return Math.floor(0.1 * Math.sqrt(xp));
}

function addXP(userId) {
  const gain = Math.floor(Math.random() * 6) + 5;

  db.get("SELECT * FROM users WHERE user_id=?", [userId], (err, row) => {
    if (err) return console.error(err);

    if (!row) {
      db.run("INSERT INTO users VALUES (?, ?, ?, ?)", [userId, gain, 0, 0]);
      return;
    }

    const newXP = row.xp + gain;
    const newLevel = getLevel(newXP);

    db.run(
      "UPDATE users SET xp=?, level=? WHERE user_id=?",
      [newXP, newLevel, userId]
    );

    if (newLevel > row.level) {
      const channel = client.channels.cache.get(LEVEL_CHANNEL_ID);
      if (channel) {
        channel.send(`🏆 <@${userId}> leveled up to **Level ${newLevel}** 💜`);
      }
    }
  });
}

// =======================
// DAILY XP
// =======================
function claimDaily(userId, cb) {
  const now = Date.now();

  db.get("SELECT * FROM users WHERE user_id=?", [userId], (err, row) => {
    if (err) return cb(false);

    if (!row) {
      db.run("INSERT INTO users VALUES (?, ?, ?, ?)", [userId, 50, 0, now]);
      return cb(true);
    }

    if (now - row.last_daily < 86400000) return cb(false);

    db.run(
      "UPDATE users SET xp = xp + 50, last_daily=? WHERE user_id=?",
      [now, userId]
    );

    cb(true);
  });
}

// =======================
// ROLE SYSTEM
// =======================
const reactionRoles = {
  "💻": "PC",
  "🎮": "Console",
  "🔪": "DBD",
  "💥": "Shooters",
  "🍄": "Minecraft",
  "🔴": "Pokemon",
  "🕯️": "Spooky Time",
  "♀️": "She/Her",
  "♂️": "He/Him",
  "🫧": "They/Them",
  "💌": "DM'S Open",
  "🔞": "18+",
  "🧸": "Under 18",
  "🎬": "Movie Night",
  "🤝": "Partner Servers",
  "🎉": "Server Events"
};

const panels = [
  { title: "Platforms ♡", description: "💻 PC\n🎮 Console" },
  { title: "Games ♡", description: "🔪 DBD\n💥 Shooters\n🍄 Minecraft\n🔴 Pokemon\n🕯️ Spooky" },
  { title: "Identity ♡", description: "♀️ She/Her\n♂️ He/Him\n🫧 They/Them\n💌 DM Open\n🔞 18+\n🧸 Under 18" },
  { title: "Server ♡", description: "🎬 Movie Night\n🤝 Partners\n🎉 Events" }
];

// =======================
// PERSONALITY SYSTEM
// =======================
const moods = ["cute", "chaotic", "calm"];
let currentMood = "cute";

setInterval(() => {
  currentMood = moods[Math.floor(Math.random() * moods.length)];
}, 1000 * 60 * 6);

const responses = {
  cute: {
    hello: ["hi hi 💜", "heyyy :3 💜"],
    mention: ["you called? 💜"],
    default: ["hmm 👀💜"]
  },
  chaotic: {
    hello: ["YO 💜💥"],
    mention: ["WHAT?? 💥"],
    default: ["WAIT WHAT 💀💜"]
  },
  calm: {
    hello: ["hey 💜"],
    mention: ["yes? 💜"],
    default: ["i see 💜"]
  }
};

const cooldown = new Map();

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// =======================
// SOCIAL TRACKING
// =======================
const seenYouTube = new Set();
const seenTwitch = new Set();
const seenTikTok = new Set();

// =======================
// ALERTS
// =======================
function sendAlert(msg) {
  if (!ALERT_CHANNEL_ID) return;
  client.channels.fetch(ALERT_CHANNEL_ID)
    .then(c => c.send(msg))
    .catch(() => {});
}

// =======================
// YOUTUBE
// =======================
async function checkYouTube() {
  try {
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`;
    const feed = await parser.parseURL(url);

    const latest = feed.items[0];
    if (!latest || seenYouTube.has(latest.id)) return;

    seenYouTube.add(latest.id);

    sendAlert(`📺 **New YouTube Upload!**\n${latest.title}\n${latest.link}`);
  } catch (e) {}
}

// =======================
// TWITCH
// =======================
async function checkTwitch() {
  try {
    const token = await axios.post(
      `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`
    );

    const access = token.data.access_token;

    const res = await axios.get(
      `https://api.twitch.tv/helix/streams?user_login=${TWITCH_USERNAME}`,
      {
        headers: {
          "Client-ID": TWITCH_CLIENT_ID,
          Authorization: `Bearer ${access}`
        }
      }
    );

    const live = res.data.data.length > 0;

    if (live && !seenTwitch.has("live")) {
      seenTwitch.add("live");
      sendAlert(`🔴 **LIVE NOW ON TWITCH!** ${TWITCH_USERNAME}`);
    }

    if (!live) seenTwitch.delete("live");
  } catch (e) {}
}

// =======================
// TIKTOK (BEST EFFORT)
// =======================
async function checkTikTok() {
  try {
    const res = await axios.get(`https://www.tiktok.com/@${TIKTOK_USERNAME}`);
    const match = res.data.match(/video\/(\d+)/);

    if (!match) return;

    const id = match[1];

    if (seenTikTok.has(id)) return;

    seenTikTok.add(id);

    sendAlert(`🎵 **New TikTok Posted!** https://tiktok.com/@${TIKTOK_USERNAME}`);
  } catch (e) {}
}

// =======================
// RUN LOOPS
// =======================
setInterval(checkYouTube, 60000);
setInterval(checkTwitch, 90000);
setInterval(checkTikTok, 120000);

// =======================
// MESSAGE SYSTEM
// =======================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  addXP(message.author.id);

  const content = message.content.toLowerCase();

  if (content === "!roles") {
    let text = "🎭 **React Roles Panel**\n\n";
    panels.forEach(p => {
      text += `**${p.title}**\n${p.description}\n\n`;
    });
    return message.channel.send(text);
  }

  if (content === "!hello") {
    return message.reply(pick(responses[currentMood].hello));
  }

  const now = Date.now();
  const last = cooldown.get(message.author.id) || 0;
  if (now - last < 8000) return;
  cooldown.set(message.author.id, now);

  if (message.mentions.has(client.user)) {
    return message.reply(pick(responses[currentMood].mention));
  }

  if (Math.random() < 0.04) {
    return message.reply(pick(responses[currentMood].default));
  }
});

// =======================
// READY
// =======================
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);

  client.user.setPresence({
    status: "online",
    activities: [{ name: "💜 Always On ✨", type: 0 }]
  });
});

// =======================
// LOGIN
// =======================
client.login(process.env.DISCORD_TOKEN);
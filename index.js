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
const Canvas = require("canvas");

const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder
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
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// =======================
// CONFIG
// =======================
const ALERT_CHANNEL_ID = process.env.ALERT_CHANNEL_ID;
const LEVEL_CHANNEL_ID = "1395485196266111017";

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_USERNAME = process.env.TWITCH_USERNAME;

const YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;
const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME;

const parser = new Parser();

// =======================
// MEMORY
// =======================
let twitchToken = null;
let isLive = false;

const seenVideos = new Set();
const seenTikToks = new Set();

// =======================
// XP SYSTEM
// =======================
function getLevel(xp) {
  return Math.floor(0.1 * Math.sqrt(xp));
}

function addXP(userId, message) {
  const gain = Math.floor(Math.random() * 6) + 5;

  db.get("SELECT * FROM users WHERE user_id=?", [userId], (err, row) => {
    if (!row) {
      db.run("INSERT INTO users VALUES (?, ?, ?, ?)", [userId, gain, 0, 0]);
      return;
    }

    const newXP = row.xp + gain;
    const newLevel = getLevel(newXP);

    db.run("UPDATE users SET xp=?, level=? WHERE user_id=?", [newXP, newLevel, userId]);

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
    if (!row) {
      db.run("INSERT INTO users VALUES (?, ?, ?, ?)", [userId, 50, 0, now]);
      return cb(true);
    }

    if (now - row.last_daily < 86400000) return cb(false);

    db.run("UPDATE users SET xp = xp + 50, last_daily=? WHERE user_id=?", [now, userId]);
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
  { title: "Platforms ♡", description: "💻 PC\n🎮 Console", emojis: ["💻", "🎮"] },
  { title: "Games ♡", description: "🔪 DBD\n💥 Shooters\n🍄 Minecraft\n🔴 Pokemon\n🕯️ Spooky", emojis: ["🔪", "💥", "🍄", "🔴", "🕯️"] },
  { title: "Identity ♡", description: "♀️ She/Her\n♂️ He/Him\n🫧 They/Them\n💌 DM Open\n🔞 18+\n🧸 Under 18", emojis: ["♀️", "♂️", "🫧", "💌", "🔞", "🧸"] },
  { title: "Server ♡", description: "🎬 Movie Night\n🤝 Partners\n🎉 Events", emojis: ["🎬", "🤝", "🎉"] }
];

let roleMessageIDs = [];

// =======================
// SLASH COMMANDS
// =======================
const commands = [
  new SlashCommandBuilder().setName("help").setDescription("Help menu"),
  new SlashCommandBuilder().setName("rank").setDescription("Your rank"),
  new SlashCommandBuilder().setName("leaderboard").setDescription("Top users"),
  new SlashCommandBuilder().setName("daily").setDescription("Claim XP"),
  new SlashCommandBuilder().setName("socials").setDescription("Social links"),
  new SlashCommandBuilder().setName("schedule").setDescription("Stream schedule"),
  new SlashCommandBuilder().setName("live").setDescription("Check stream status"),
  new SlashCommandBuilder().setName("clip").setDescription("Post a clip link")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log("Slash commands registered");
  } catch (err) {
    console.error(err);
  }
})();

// =======================
// CHAT XP HOOK
// =======================
client.on("messageCreate", (message) => {
  if (message.author.bot) return;
  addXP(message.author.id, message);
});

// =======================
// 💬 PERSONALITY CHAT SYSTEM
// =======================

const userMemory = new Map();

const bot = {
  name: "Hera",
  moods: ["cute", "chaotic", "calm"],
  mood: "cute"
};

setInterval(() => {
  bot.mood = bot.moods[Math.floor(Math.random() * bot.moods.length)];
}, 1000 * 60 * 8);

const personality = {
  cute: {
    hello: ["hi hi 💜", "heyyy :3 💜", "hello there 💜"],
    howareyou: ["i’m gooddd 💜", "just vibing 💜"],
    mention: ["hi hi 💜 i’m here!", "you called? 💜"],
    default: ["hmm 👀💜", "tell me more :3"]
  },
  chaotic: {
    hello: ["YO 💜💥", "HELLO??? 💜"],
    howareyou: ["I AM ALIVE 💥💜", "ENERGY MAXED"],
    mention: ["WHAT DO YOU NEED 💜", "I HEARD MY NAME 💥"],
    default: ["WAIT WHAT 💀💜", "EXPLAIN??"]
  },
  calm: {
    hello: ["hey 💜", "hi 💜"],
    howareyou: ["i’m alright 💜", "calm today"],
    mention: ["yes? 💜", "i’m here"],
    default: ["i see 💜", "interesting"]
  }
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();
  const mood = bot.mood;

  if (message.mentions.has(client.user)) {
    return message.reply(pick(personality[mood].mention));
  }

  if (content.includes("hello")) return message.reply(pick(personality[mood].hello));
  if (content.includes("how are you")) return message.reply(pick(personality[mood].howareyou));

  if (Math.random() < 0.03) {
    return message.reply(pick(personality[mood].default));
  }
});

// =======================
// 🔥 ALWAYS-ON SERVER ACTIVITY (NEW)
// =======================

const checkIns = [
  "💜 just checking in… how’s everyone doing?",
  "👀 still alive in here?",
  "💬 someone say something interesting",
  "✨ vibes check: good or chaotic?",
  "💜 I’m here if anyone needs me"
];

const ambientMessages = [
  "💜 the server feels kinda quiet...",
  "👀 I’m watching over things",
  "✨ hope everyone is having a good day",
  "💬 talk to meeeee",
  "🔥 wake up chat energy"
];

// periodic check-ins
setInterval(() => {
  const channel = client.channels.cache.get(ALERT_CHANNEL_ID);
  if (!channel) return;

  if (Math.random() < 0.6) {
    channel.send(pick(checkIns));
  }
}, 1000 * 60 * 18);

// ambient random messages
setInterval(() => {
  const channel = client.channels.cache.get(ALERT_CHANNEL_ID);
  if (!channel) return;

  if (Math.random() < 0.35) {
    channel.send(pick(ambientMessages));
  }
}, 1000 * 60 * 25);

// =======================
// SLASH HANDLER
// =======================
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  if (i.commandName === "daily") {
    claimDaily(i.user.id, (ok) =>
      i.reply(ok ? "💜 +50 XP claimed!" : "⏳ Already claimed today!")
    );
  }

  if (i.commandName === "leaderboard") {
    db.all("SELECT * FROM users ORDER BY xp DESC LIMIT 10", [], (err, rows) => {
      i.reply(
        "🏆 **Leaderboard**\n\n" +
        rows.map((u, i) => `#${i + 1} <@${u.user_id}> XP: ${u.xp}`).join("\n")
      );
    });
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
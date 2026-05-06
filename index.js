

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
  CREATE TABLE IF NOT EXISTS seen_social (
    platform TEXT,
    post_id TEXT
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
  EmbedBuilder,
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
  {
    title: "Platforms ♡",
    roles: {
      "💻": "PC",
      "🎮": "Console"
    }
  },
  {
    title: "Games ♡",
    roles: {
      "🔪": "DBD",
      "💥": "Shooters",
      "🍄": "Minecraft",
      "🔴": "Pokemon",
      "🕯️": "Spooky Time"
    }
  },
  {
    title: "Identity ♡",
    roles: {
      "♀️": "She/Her",
      "♂️": "He/Him",
      "🫧": "They/Them",
      "💌": "DM'S Open",
      "🔞": "18+",
      "🧸": "Under 18"
    }
  },
  {
    title: "Server ♡",
    roles: {
      "🎬": "Movie Night",
      "🤝": "Partner Servers",
      "🎉": "Server Events"
    }
  }
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
setInterval(checkTwitch, 90000);
setInterval(checkTikTok, 120000);

// =======================
// MESSAGE SYSTEM
// =======================
client.on("messageCreate", async (message) => {
    console.log("MESSAGE RECEIVED:", message.content);
  if (message.author.bot) return;

  addXP(message.author.id);

  const content = message.content.toLowerCase();


// =======================
// ✅ REACTION ROLE SYSTEM
// =======================

if (content === "!roles") {
  try {
    let text = "🎭 **React Roles Panel**\n\n";
    const reactions = [];

    for (const panel of panels) {
      text += `**${panel.title}**\n`;

      for (const [emoji, role] of Object.entries(panel.roles)) {
        text += `${emoji} → ${role}\n`;
        reactions.push(emoji);
      }

      text += `\n`;
    }

    const msg = await message.channel.send(text);

    db.run("DELETE FROM role_messages WHERE guild_id=?", [
      message.guild.id
    ]);

    db.run("INSERT INTO role_messages VALUES (?, ?)", [
      message.guild.id,
      msg.id
    ]);

    // small delay prevents Discord reaction spam issues
    for (const emoji of reactions) {
      try {
        await msg.react(emoji);
        await new Promise(r => setTimeout(r, 400));
      } catch {}
    }

  } catch (err) {
    console.error(err);
  }

  return;
}
  if (content === "!hello") {
    return message.reply(pick(responses[currentMood].hello));
  }
  if (content === "!rank") {
  db.get(
    "SELECT * FROM users WHERE user_id=?",
    [message.author.id],
    async (err, row) => {
      if (err) return console.error(err);

      const xp = row?.xp || 0;
      const level = row?.level || 0;
      const nextLevelXP = Math.floor(Math.pow((level + 1) / 0.1, 2));

      const embed = new EmbedBuilder()
        .setColor(0xff66cc)
        .setTitle(`💜 ${message.author.username}'s Rank`)
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: "📊 Level", value: `${level}`, inline: true },
          { name: "✨ XP", value: `${xp}`, inline: true },
          { name: "🎯 Next Level", value: `${nextLevelXP}`, inline: true }
        );

      message.reply({ embeds: [embed] });
    }
  );
  return;
}

if (content === "!leaderboard") {
  db.all(
    "SELECT user_id, xp, level FROM users ORDER BY xp DESC LIMIT 10",
    async (err, rows) => {
      if (err) return console.error(err);

      const description = await Promise.all(
        rows.map(async (u, i) => {
          let userTag = u.user_id;

          try {
            const user = await client.users.fetch(u.user_id);
            userTag = user.username;
          } catch {}

          return `**${i + 1}. ${userTag}** — Level ${u.level} | XP ${u.xp}`;
        })
      );

      const embed = new EmbedBuilder()
        .setColor(0x00ccff)
        .setTitle("🏆 XP Leaderboard")
        .setDescription(description.join("\n"));

      message.channel.send({ embeds: [embed] });
    }
  );
  return;
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
if (ALERT_CHANNEL_ID) {
  setInterval(() => {
    sendAlert("💜 just checking in... I'm still here!");
  }, 1000 * 60 * 30);
}
// =======================
// LOGIN
// =======================
client.login(process.env.DISCORD_TOKEN);

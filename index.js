const http = require("http");
const axios = require("axios");
const Parser = require("rss-parser");

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

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_USERNAME = process.env.TWITCH_USERNAME;

const YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;
const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME;

const parser = new Parser();

// =======================
// MEMORY (NO DB)
// =======================
let twitchToken = null;
let isLive = false;

const seenVideos = new Set();
const seenTikToks = new Set();

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
    description: "💻 PC\n🎮 Console",
    emojis: ["💻", "🎮"]
  },
  {
    title: "Games ♡",
    description: "🔪 DBD\n💥 Shooters\n🍄 Minecraft\n🔴 Pokemon\n🕯️ Spooky",
    emojis: ["🔪", "💥", "🍄", "🔴", "🕯️"]
  },
  {
    title: "Identity ♡",
    description: "♀️ She/Her\n♂️ He/Him\n🫧 They/Them\n💌 DM Open\n🔞 18+\n🧸 Under 18",
    emojis: ["♀️", "♂️", "🫧", "💌", "🔞", "🧸"]
  },
  {
    title: "Server ♡",
    description: "🎬 Movie Night\n🤝 Partners\n🎉 Events",
    emojis: ["🎬", "🤝", "🎉"]
  }
];

let roleMessageIDs = [];

// =======================
// SLASH COMMANDS
// =======================
const commands = [
  new SlashCommandBuilder().setName("help").setDescription("Help menu"),
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
// TWITCH
// =======================
async function getTwitchToken() {
  const res = await axios.post("https://id.twitch.tv/oauth2/token", null, {
    params: {
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      grant_type: "client_credentials"
    }
  });

  twitchToken = res.data.access_token;
}

async function checkTwitch() {
  if (!twitchToken) await getTwitchToken();

  const res = await axios.get("https://api.twitch.tv/helix/streams", {
    headers: {
      "Client-ID": TWITCH_CLIENT_ID,
      Authorization: `Bearer ${twitchToken}`
    },
    params: { user_login: TWITCH_USERNAME }
  });

  const channel = client.channels.cache.get(ALERT_CHANNEL_ID);
  if (!channel) return;

  const stream = res.data.data[0];

  if (stream && !isLive) {
    isLive = true;

    channel.send({
      content: "@everyone",
      allowedMentions: { parse: ["everyone"] },
      embeds: [{
        title: "🔴 LIVE NOW",
        description: `${stream.title}\n🎮 ${stream.game_name}\n👀 ${stream.viewer_count}`,
        url: `https://twitch.tv/${TWITCH_USERNAME}`,
        color: 0x9146FF
      }]
    });

  } else if (!stream) {
    isLive = false;
  }
}

// =======================
// YOUTUBE (FIXED)
// =======================
async function checkYouTube() {
  try {
    const channel = client.channels.cache.get(ALERT_CHANNEL_ID);
    if (!channel) return;

    const feed = await parser.parseURL(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`
    );

    const latest = feed.items?.[0];
    if (!latest) return;

    if (seenVideos.has(latest.id)) return;
    seenVideos.add(latest.id);

    channel.send(`🎥 New YouTube Video!\n${latest.link}`);

  } catch (e) {
    console.log("YouTube error:", e.message);
  }
}

// =======================
// TIKTOK
// =======================
async function checkTikTok() {
  try {
    const channel = client.channels.cache.get(ALERT_CHANNEL_ID);
    if (!channel) return;

    const feed = await parser.parseURL(
      `https://rsshub.app/tiktok/user/${TIKTOK_USERNAME}`
    );

    const latest = feed.items?.[0];
    if (!latest) return;

    if (seenTikToks.has(latest.link)) return;
    seenTikToks.add(latest.link);

    channel.send(`🎵 New TikTok!\n${latest.link}`);

  } catch (e) {
    console.log("TikTok error:", e.message);
  }
}

// =======================
// CHAT SYSTEM
// =======================
const replies = {
  hello: ["hey 💜", "hi hi 💜", "yo 💜"],
  howareyou: ["good 💜", "doing great", "chilling"],
  default: ["hmm 👀", "interesting", "tell me more 💜"]
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();

  if (message.mentions.has(client.user)) {
    return message.reply("hey 💜");
  }

  if (content === "!ping") return message.reply("🏓 pong!");

  if (content === "!roll")
    return message.reply(`🎲 ${Math.floor(Math.random() * 6) + 1}`);

  if (content.startsWith("!8ball"))
    return message.reply(pick(["yes 💜", "no ❌", "maybe 👀"]));

  if (content.includes("hello")) return message.reply(pick(replies.hello));
  if (content.includes("how are you")) return message.reply(pick(replies.howareyou));

  if (Math.random() < 0.05) {
    return message.reply(pick(replies.default));
  }
});

// =======================
// REACTION ROLES
// =======================
client.on("messageCreate", async (message) => {
  if (message.content !== "!roles") return;

  roleMessageIDs = [];

  for (const panel of panels) {
    const msg = await message.channel.send(
      `**${panel.title}**\n\n${panel.description}`
    );

    roleMessageIDs.push(msg.id);

    for (const e of panel.emojis) {
      await msg.react(e);
    }
  }
});

client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;

  if (reaction.partial) await reaction.fetch();
  if (!roleMessageIDs.includes(reaction.message.id)) return;

  const roleName = reactionRoles[reaction.emoji.name];
  if (!roleName) return;

  const member = await reaction.message.guild.members.fetch(user.id);
  const role = reaction.message.guild.roles.cache.find(r => r.name === roleName);

  if (role) member.roles.add(role);
});

client.on("messageReactionRemove", async (reaction, user) => {
  if (user.bot) return;

  if (reaction.partial) await reaction.fetch();
  if (!roleMessageIDs.includes(reaction.message.id)) return;

  const roleName = reactionRoles[reaction.emoji.name];
  if (!roleName) return;

  const member = await reaction.message.guild.members.fetch(user.id);
  const role = reaction.message.guild.roles.cache.find(r => r.name === roleName);

  if (role) member.roles.remove(role);
});

// =======================
// READY
// =======================
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);

  setInterval(checkTwitch, 60000);
  setInterval(checkYouTube, 120000);
  setInterval(checkTikTok, 180000);

  setInterval(() => {
    const channel = client.channels.cache.get(ALERT_CHANNEL_ID);
    if (!channel) return;

    const msgs = ["💜 hey chat", "🎮 anyone here?", "🔥 what’s up?"];
    channel.send(pick(msgs));
  }, 2700000);
});

// =======================
// LOGIN
// =======================
client.login(process.env.DISCORD_TOKEN);
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
// DISCORD CLIENT
// =======================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
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

let twitchToken = null;
let isLive = false;
let lastVideo = null;
let lastTikTok = null;

// =======================
// SIMPLE MEMORY (NO DB)
// =======================
const userContext = {}; // stores last message per user

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
    console.log("Slash commands registered.");
  } catch (err) {
    console.error(err);
  }
})();

// =======================
// TWITCH TOKEN
// =======================
async function getTwitchToken() {
  const res = await axios.post(`https://id.twitch.tv/oauth2/token`, null, {
    params: {
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      grant_type: "client_credentials"
    }
  });

  twitchToken = res.data.access_token;
}

// =======================
// TWITCH CHECK
// =======================
async function checkTwitch() {
  if (!twitchToken) await getTwitchToken();

  const res = await axios.get("https://api.twitch.tv/helix/streams", {
    headers: {
      "Client-ID": TWITCH_CLIENT_ID,
      Authorization: `Bearer ${twitchToken}`
    },
    params: {
      user_login: TWITCH_USERNAME
    }
  });

  const channel = client.channels.cache.get(ALERT_CHANNEL_ID);
  if (!channel) return;

  const stream = res.data.data[0];

  if (stream) {
    if (!isLive) {
      isLive = true;

      // LIVE ALERT + @everyone
      channel.send({
        content: "@everyone",
        allowedMentions: { parse: ["everyone"] },
        embeds: [{
          title: "🔴 LIVE NOW",
          description: `${stream.title}\n🎮 ${stream.game_name}\n👀 ${stream.viewer_count}`,
          url: `https://twitch.tv/${TWITCH_USERNAME}`,
          color: 0x9146FF,
          image: {
            url: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${TWITCH_USERNAME}-1280x720.jpg`
          }
        }]
      });
    }
  } else {
    isLive = false;
  }
}

// =======================
// STREAM ALERTS
// =======================
async function checkYouTube() {
  const feed = await parser.parseURL(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`
  );

  const latest = feed.items[0];
  const channel = client.channels.cache.get(ALERT_CHANNEL_ID);
  if (!channel) return;

  if (lastVideo !== latest.id) {
    lastVideo = latest.id;
    channel.send(`🎥 New YouTube Video!\n${latest.link}`);
  }
}

async function checkTikTok() {
  const feed = await parser.parseURL(
    `https://rsshub.app/tiktok/user/${TIKTOK_USERNAME}`
  );

  const latest = feed.items[0];
  const channel = client.channels.cache.get(ALERT_CHANNEL_ID);
  if (!channel) return;

  if (lastTikTok !== latest.link) {
    lastTikTok = latest.link;
    channel.send(`🎵 New TikTok!\n${latest.link}`);
  }
}

// =======================
// SMART CHAT SYSTEM (IMPROVED)
// =======================
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const responses = {
  hello: ["hey 💜", "hi hi 💜", "hello there", "yo 💜"],
  howareyou: ["I'm good 💜", "doing fine 💜", "chilling rn 💜"],
  default: [
    "hmm 👀",
    "interesting 💜",
    "tell me more",
    "I see 💜"
  ]
};

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();
  const userId = message.author.id;

  // ======================
  // CONTEXT MEMORY
  // ======================
  userContext[userId] = content;

  // ======================
  // MENTION BOT
  // ======================
  if (message.mentions.has(client.user)) {
    return message.reply("hey 💜 I’m here!");
  }

  // ======================
  // FUN COMMANDS
  // ======================
  if (content === "!ping") return message.reply("🏓 pong!");

  if (content === "!roll") {
    return message.reply(`🎲 ${Math.floor(Math.random() * 6) + 1}`);
  }

  if (content.startsWith("!8ball")) {
    const answers = ["yes 💜", "no ❌", "maybe 👀", "absolutely ✨"];
    return message.reply(pick(answers));
  }

  // ======================
  // SMARTER CHAT (LESS REPETITIVE)
  // ======================
  if (content.includes("hello") || content.includes("hi")) {
    return message.reply(pick(responses.hello));
  }

  if (content.includes("how are you")) {
    return message.reply(pick(responses.howareyou));
  }

  if (content.includes("what can you do")) {
    return message.reply("💜 I run the server, chat, and post stream updates!");
  }

  // fallback
  if (Math.random() < 0.08) {
    return message.reply(pick(responses.default));
  }
});

// =======================
// SLASH COMMANDS
// =======================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "help") {
    return interaction.reply("💜 Help: /socials /schedule /live");
  }

  if (interaction.commandName === "socials") {
    return interaction.reply(
      `Twitch: https://twitch.tv/${TWITCH_USERNAME}`
    );
  }

  if (interaction.commandName === "schedule") {
    return interaction.reply("📅 Streams after work + weekends 💜");
  }

  if (interaction.commandName === "live") {
    return interaction.reply(
      isLive
        ? "🔴 YES - live right now!"
        : "⚫ offline right now"
    );
  }

  if (interaction.commandName === "clip") {
    return interaction.reply("🎬 Drop your clip link in chat!");
  }
});

// =======================
// READY + AUTO EVENTS
// =======================
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);

  setInterval(checkTwitch, 60000);
  setInterval(checkYouTube, 120000);
  setInterval(checkTikTok, 180000);

  // auto engagement
  setInterval(() => {
    const channel = client.channels.cache.get(ALERT_CHANNEL_ID);
    if (!channel) return;

    const prompts = [
      "💜 what are you all doing?",
      "🎮 anyone gaming?",
      "💬 say hi if you're here",
      "🔥 what should I stream next?"
    ];

    channel.send(pick(prompts));
  }, 1000 * 60 * 45);
});

// =======================
// LOGIN
// =======================
console.log("TOKEN EXISTS:", !!process.env.DISCORD_TOKEN);
client.login(process.env.DISCORD_TOKEN);
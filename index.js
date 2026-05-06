const http = require("http");
const axios = require("axios");
const Parser = require("rss-parser");

// =======================
// SIMPLE KEEP-ALIVE SERVER
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
// DISCORD SETUP
// =======================
const {
  Client,
  GatewayIntentBits,
  Partials
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// =======================
// ALERT CONFIG
// =======================
const ALERT_CHANNEL_ID = process.env.ALERT_CHANNEL_ID;

// Twitch
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_USERNAME = process.env.TWITCH_USERNAME;

// YouTube
const YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;

// TikTok
const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME;

const parser = new Parser();

let twitchToken = null;
let isLive = false;
let lastVideo = null;
let lastTikTok = null;

// =======================
// HELPERS
// =======================
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const personality = {
  hello: ["hey hey 💜", "hi hi 💜", "hello 💜", "yo 💜"],
  howareyou: ["I’m good 💜 just vibing", "doing great 💜", "pretty chill rn 💜"],
  thanks: ["anytime 💜", "no problem 💜", "of course 💜"]
};

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

  const res = await axios.get(`https://api.twitch.tv/helix/streams`, {
    headers: {
      "Client-ID": TWITCH_CLIENT_ID,
      "Authorization": `Bearer ${twitchToken}`
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

      channel.send({
        content: "@everyone",
        allowedMentions: { parse: ["everyone"] },
        embeds: [{
          title: "🔴 Hera is LIVE on Twitch!",
          description: `${stream.title}\n\n🎮 ${stream.game_name}\n👀 ${stream.viewer_count} viewers`,
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
// YOUTUBE CHECK
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
    channel.send(`🎥 **New YouTube Video!**\n${latest.link}`);
  }
}

// =======================
// TIKTOK CHECK
// =======================
async function checkTikTok() {
  const feed = await parser.parseURL(
    `https://rsshub.app/tiktok/user/${TIKTOK_USERNAME}`
  );

  const latest = feed.items[0];
  const channel = client.channels.cache.get(ALERT_CHANNEL_ID);

  if (!channel) return;

  if (lastTikTok !== latest.link) {
    lastTikTok = latest.link;
    channel.send(`🎵 **New TikTok!**\n${latest.link}`);
  }
}

// =======================
// ROLE MAP
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

// =======================
// CHAT SYSTEM + PERSONALITY + FUN COMMANDS
// =======================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();

  // mention reply
  if (message.mentions.has(client.user)) {
    return message.reply("hey 💜 I’m here!");
  }

  // help system
  if (content === "help" || content === "!help") {
    return message.reply(
      "💜 **Hera Help Menu**\n\n" +
      "• !roles → pick roles\n" +
      "• !ping → test bot\n" +
      "• !roll → roll a dice\n" +
      "• !8ball → ask a question\n\n" +
      "💬 You can also just talk to me!"
    );
  }

  // fun commands
  if (content === "!ping") return message.reply("🏓 pong!");

  if (content === "!roll") {
    return message.reply(`🎲 ${Math.floor(Math.random() * 6) + 1}`);
  }

  if (content.startsWith("!8ball")) {
    const answers = ["yes 💜", "no ❌", "maybe 👀", "absolutely ✨", "not sure"];
    return message.reply(`🎱 ${pick(answers)}`);
  }

  // personality replies
  if (content.includes("hello") || content.includes("hi")) {
    return message.reply(pick(personality.hello));
  }

  if (content.includes("how are you")) {
    return message.reply(pick(personality.howareyou));
  }

  if (content.includes("thanks")) {
    return message.reply(pick(personality.thanks));
  }

  if (content.includes("what can you do")) {
    return message.reply("💜 I help with roles, chat, fun commands & stream alerts!");
  }
});

// =======================
// AUTO ENGAGEMENT
// =======================
const engagementMessages = [
  "💜 what are you all up to?",
  "🎮 anyone playing anything?",
  "💬 say hi if you're here",
  "🔥 what games today?",
  "👀 lurking or chatting?"
];

// =======================
// READY
// =======================
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);

  client.user.setPresence({
    status: 'online',
    activities: [{ name: 'your server 💜' }]
  });

  setInterval(checkTwitch, 60000);
  setInterval(checkYouTube, 120000);
  setInterval(checkTikTok, 180000);

  // auto engagement
  setInterval(() => {
    const channel = client.channels.cache.get(ALERT_CHANNEL_ID);
    if (!channel) return;

    channel.send(pick(engagementMessages));
  }, 1000 * 60 * 45);
});

// =======================
// LOGIN
// =======================
console.log("TOKEN EXISTS:", !!process.env.DISCORD_TOKEN);
client.login(process.env.DISCORD_TOKEN);
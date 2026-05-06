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

  if (res.data.data.length > 0) {
    if (!isLive) {
      isLive = true;

      channel.send({
        embeds: [{
          title: "🔴 Hera is LIVE!",
          description: "Come hang out 💜",
          url: `https://twitch.tv/${TWITCH_USERNAME}`,
          color: 0x9146FF
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
// TIKTOK CHECK (RSS)
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
// PANELS
// =======================
const panels = [
  {
    title: "Platforms ♡",
    description: "💻 PC\n🎮 Console",
    emojis: ["💻", "🎮"]
  },
  {
    title: "Games ♡",
    description:
      "🔪 Dead by Daylight\n" +
      "💥 Shooters\n" +
      "🍄 Minecraft\n" +
      "🔴 Pokemon\n" +
      "🕯️ Spooky Time",
    emojis: ["🔪", "💥", "🍄", "🔴", "🕯️"]
  },
  {
    title: "Identity & Age ♡",
    description:
      "♀️ She/Her\n" +
      "♂️ He/Him\n" +
      "🫧 They/Them\n" +
      "💌 DM's Open\n\n" +
      "🔞 18+\n" +
      "🧸 Under 18",
    emojis: ["♀️", "♂️", "🫧", "💌", "🔞", "🧸"]
  },
  {
    title: "Server ♡",
    description:
      "🎬 Movie Night\n" +
      "🤝 Partner Servers\n" +
      "🎉 Server Events",
    emojis: ["🎬", "🤝", "🎉"]
  }
];

let roleMessageIDs = [];

// =======================
// READY
// =======================
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);

  client.user.setPresence({
    status: 'online',
    activities: [{ name: 'your server 💜' }]
  });

  // Start loops AFTER bot is ready
  setInterval(checkTwitch, 60000);
  setInterval(checkYouTube, 120000);
  setInterval(checkTikTok, 180000);
});

// =======================
// SEND ROLE MENU
// =======================
client.on('messageCreate', async (message) => {
  if (message.content !== '!roles') return;

  roleMessageIDs = [];

  await message.channel.send(
    "**Hera's Hollow Role Menu**\n" +
    "React to the panels below to select your roles.\n" +
    "You can change them at any time."
  );

  for (const panel of panels) {
    const msg = await message.channel.send(
      `**${panel.title}**\n\n${panel.description}`
    );

    roleMessageIDs.push(msg.id);

    for (const emoji of panel.emojis) {
      await msg.react(emoji);
    }
  }
});

// =======================
// ADD ROLE
// =======================
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;

  if (reaction.partial) await reaction.fetch();
  if (reaction.message.partial) await reaction.message.fetch();

  if (!reaction.message.guild) return;
  if (!roleMessageIDs.includes(reaction.message.id)) return;

  const roleName = reactionRoles[reaction.emoji.name];
  if (!roleName) return;

  const guild = reaction.message.guild;
  const member = await guild.members.fetch(user.id);
  const role = guild.roles.cache.find(r => r.name === roleName);

  if (!role) return;

  if (roleName === "18+") {
    const under18 = guild.roles.cache.find(r => r.name === "Under 18");
    if (under18) await member.roles.remove(under18);
  }

  if (roleName === "Under 18") {
    const adult = guild.roles.cache.find(r => r.name === "18+");
    if (adult) await member.roles.remove(adult);
  }

  await member.roles.add(role);
});

// =======================
// REMOVE ROLE
// =======================
client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;

  if (reaction.partial) await reaction.fetch();
  if (reaction.message.partial) await reaction.message.fetch();

  if (!reaction.message.guild) return;
  if (!roleMessageIDs.includes(reaction.message.id)) return;

  const roleName = reactionRoles[reaction.emoji.name];
  if (!roleName) return;

  const guild = reaction.message.guild;
  const member = await guild.members.fetch(user.id);
  const role = guild.roles.cache.find(r => r.name === roleName);

  if (!role) return;

  await member.roles.remove(role);
});

// =======================
// LOGIN
// =======================
console.log("TOKEN EXISTS:", !!process.env.DISCORD_TOKEN);
client.login(process.env.DISCORD_TOKEN);
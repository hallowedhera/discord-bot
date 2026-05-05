
const http = require("http");

http.createServer((req, res) => {
  res.write("OK");
  res.end();
}).listen(process.env.PORT, () => {
  console.log("HTTP server running on port", process.env.PORT);
});

console.log("SCRIPT STARTED");
process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);



const server = http.createServer((req, res) => {
  res.write("OK");
  res.end();
});

server.listen(process.env.PORT, () => {
  console.log("PORT OPEN:", process.env.PORT);
});

http.createServer((req, res) => {
  res.write("Bot is alive");
  res.end();
}).listen(process.env.PORT);

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
// PANELS (UPDATED STRUCTURE)
// =======================
const panels = [
  {
    title: "Platforms ♡",
    description:
      "💻 PC\n" +
      "🎮 Console",
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

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// =======================
// SEND ROLE MENU
// =======================
client.on('messageCreate', async (message) => {
  if (message.content !== '!roles') return;

  await message.channel.send(
    "**Hera's Hollow Role Menu**\n" +
    "React to the panels below to select your roles.\n" +
    "You can change them at any time."
  );

  for (const panel of panels) {
    const msg = await message.channel.send(
      `**${panel.title}**\n\n${panel.description}`
    );

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

  const roleName = reactionRoles[reaction.emoji.name];
  if (!roleName) return;

  const guild = reaction.message.guild;
  const member = await guild.members.fetch(user.id);

  const role = guild.roles.cache.find(r => r.name === roleName);
  if (!role) return;

  // AGE LOCK
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
console.log("TOKEN EXISTS:", !!process.env.DISCORD_TOKEN);
console.log("TOKEN LENGTH:", process.env.DISCORD_TOKEN?.length);
console.log("TOKEN START:", process.env.DISCORD_TOKEN?.slice(0, 10));

client.login(process.env.DISCORD_TOKEN);

client.on('messageCreate', message => {
  console.log("message seen:", message.content);
});
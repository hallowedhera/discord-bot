const TOKEN = process.env.DISCORD_TOKEN;
const GENERAL_CHANNEL_ID = process.env.GENERAL_CHANNEL_ID;
const ALERT_CHANNEL_ID = process.env.ALERT_CHANNEL_ID;
const LEVEL_CHANNEL_ID = process.env.LEVEL_CHANNEL_ID;
const LEAVE_CHANNEL_ID = process.env.LEAVE_CHANNEL_ID;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_USERNAME = process.env.TWITCH_USERNAME;
const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME;
const MONGO_URI = process.env.MONGO_URI;
const ENHANCEMENTS_CHANNEL_ID = process.env.ENHANCEMENTS_CHANNEL_ID;
const DISBOARD_BOT_ID = '302050872383242240'; // Official Disboard Bot Client ID
const TWO_HOURS = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

let activeBumpTimeout = null;

// 1. IMPORT ALL TOOLS (This MUST be the very first thing)
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const axios = require("axios");
const cron = require('node-cron');
const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    EmbedBuilder, 
    ActivityType 
} = require("discord.js");

// 2. CONFIG & PORT
const PORT = process.env.PORT || 10000;

// 3. START KEEP-ALIVE SERVER
const app = express();
app.get("/", (req, res) => res.send("Bot is active."));
app.listen(PORT, () => console.log(`🌿 Forest Monitoring active on port ${PORT}`));

// 4. INITIALIZE DATABASE
mongoose.connect(MONGO_URI)
    .then(() => console.log("✨ Connected to the Fairy Cloud (MongoDB)!"))
    .catch(err => {
        console.error("❌ MongoDB Connection Error:", err.message);
        console.log("⚠️ Continuing without DB - leveling/economy will fail.");
    });

const userSchema = new mongoose.Schema({
    userId: String,
    guildId: String,
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    balance: { type: Number, default: 0 },
    lastDaily: { type: Number, default: 0 }
});
const roleMessageSchema = new mongoose.Schema({
    messageId: String,
    guildId: String
});
const RoleMessage = mongoose.model("RoleMessage", roleMessageSchema);
const User = mongoose.model("User", userSchema);

// 5. CREATE THE BOT CLIENT
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers 
    ],
    partials: [Partials.Message, Partials.Reaction, Partials.User, Partials.Channel]
});

// =======================
// ALERTS
// =======================
async function sendAlert(msg) {
  try {
    if (!ALERT_CHANNEL_ID) return;
    const channel = await client.channels.fetch(ALERT_CHANNEL_ID);
    if (!channel) return;
    channel.send(msg);
  } catch (e) {
    console.log("Alert error:", e.message);
  }
}

const seenTwitchLive = new Set();
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
    const isLive = res.data.data.length > 0;
    if (isLive && !seenTwitchLive.has(TWITCH_USERNAME)) {
      seenTwitchLive.add(TWITCH_USERNAME);
      sendAlert(`🔴 **LIVE NOW ON TWITCH**\nhttps://twitch.tv/${TWITCH_USERNAME}`);
    }
    if (!isLive) {
      seenTwitchLive.delete(TWITCH_USERNAME);
    }
  } catch (e) {
    console.log("Twitch error:", e.message);
  }
}
setInterval(checkTwitch, 90000);

const seenTikTokVideo = new Set();
async function checkTikTok() {
  try {
    const res = await axios.get(`https://www.tiktok.com/@${TIKTOK_USERNAME}?lang=en`);
    const match = res.data.match(/video\/(\d{15,})/g);
    if (!match) return;
    const latest = match[0];
    if (seenTikTokVideo.has(latest)) return;
    seenTikTokVideo.add(latest);
    sendAlert(`🎵 **New TikTok Posted!**\nhttps://tiktok.com/@${TIKTOK_USERNAME}`);
  } catch (e) {
    console.log("TikTok error:", e.message);
  }
}
setInterval(checkTikTok, 120000);

// =======================
// PERSONALITY SYSTEM
// =======================
const moods = ["cute", "chaotic", "calm"];
let currentMood = "cute";

const responses = {
    cute: {
        hello: ["hi hi 💜", "heyyy :3 💜", "helloooo! ✨"],
        mention: ["you called? 💜", "yes, bestie? ✨"],
        default: ["hmm 👀💜", "pog! 🎀"]
    },
    chaotic: {
        hello: ["YO 💜💥", "LETS GOOO 💀"],
        mention: ["WHAT?? 💥", "STOP PINGING ME lol"],
        default: ["WAIT WHAT 💀💜", "LMAO NO WAY"]
    },
    calm: {
        hello: ["hey 💜", "hello."],
        mention: ["yes? 💜", "i am here."],
        default: ["i see 💜", "noted."]
    }
};

setInterval(() => {
    currentMood = moods[Math.floor(Math.random() * moods.length)];
}, 1000 * 60 * 6);

// =======================
// ROLE CONFIG
// =======================
const reactionRolesMap = {
    "💻": "PC", "🎮": "Console", "🔪": "DBD", "💥": "Shooters",
    "🍄": "Minecraft", "🔴": "Pokemon", "🕯️": "Spooky Time",
    "♀️": "She/Her", "♂️": "He/Him", "🫧": "They/Them",
    "💌": "DM'S Open", "🔞": "18+", "🧸": "Under 18",
    "🎬": "Movie Night", "🤝": "Partner Servers", "🎉": "Server Events"
};

const panels = [
    { title: "Platforms ♡", roles: { "💻": "PC", "🎮": "Console" } },
    { title: "Games ♡", roles: { "🔪": "DBD", "💥": "Shooters", "🍄": "Minecraft", "🔴": "Pokemon", "🕯️": "Spooky Time" } },
    { title: "Identity ♡", roles: { "♀️": "She/Her", "♂️": "He/Him", "🫧": "They/Them", "💌": "DM'S Open", "🔞": "18+", "🧸": "Under 18" } },
    { title: "Server ♡", roles: { "🎬": "Movie Night", "🤝": "Partner Servers", "🎉": "Server Events" } }
];

const shopItems = [
    { name: "VIP Role", price: 5000, description: "Claim the prestigious VIP role!" },
    { name: "XP Booster", price: 1500, description: "Get a temporary boost to your level!" },
    { name: "Chaos King", price: 10000, description: "A special title for the most chaotic members." }
];

// =======================
// HELPERS
// =======================
const getLevel = (xp) => Math.floor(0.1 * Math.sqrt(xp));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// =======================
// EVENT HANDLERS: WELCOME & LEAVE
// =======================
client.on("guildMemberAdd", async (member) => {
    console.log(`New member joined: ${member.user.tag}`);
    try {
        const role = member.guild.roles.cache.find(r => r.name === "Minions");
        if (role) await member.roles.add(role);

        console.log(`Attempting to send welcome to: ${WELCOME_CHANNEL_ID}`);
        const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
        if (!channel) {
            console.log("❌ Error: Could not find welcome channel in cache!");
            return;
        }

        const welcomeEmbed = new EmbedBuilder()
            .setColor(0xffc1e3)
            .setTitle("✨ A new member has joined! 🧚‍♀️")
            .setDescription(`hi hi <@${member.id}>! 🎀\nWelcome to the magic of **${member.guild.name}**! 🫧`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: `Magical Member #${member.guild.memberCount} 🪄` });

        await channel.send({ content: `Welcome ✨ <@${member.id}>!`, embeds: [welcomeEmbed] });
        console.log("✅ Fairy welcome message sent successfully!");
    } catch (e) {
        console.error("Welcome System Error:", e.message);
    }
});

client.on("guildMemberRemove", async (member) => {
    try {
        const leaveChannelId = process.env.LEAVE_CHANNEL_ID;
        if (!leaveChannelId) {
            return console.log("❌ Error: LEAVE_CHANNEL_ID is not defined in Render!");
        }

        const channel = await member.guild.channels.fetch(leaveChannelId).catch(() => null);
        if (!channel) {
            return console.log(`❌ Error: Could not find channel with ID ${leaveChannelId}`);
        }

        const leaveEmbed = new EmbedBuilder()
            .setColor(0xff0000) 
            .setTitle("Member Left")
            .setThumbnail(member.user.displayAvatarURL())
            .setDescription(`**${member.user.tag}** has left the server.`)
            .addFields(
                { name: "ID", value: `\`${member.id}\``, inline: true },
                { name: "New Total", value: `${member.guild.memberCount}`, inline: true }
            )
            .setTimestamp();

        await channel.send({ embeds: [leaveEmbed] });
        console.log(`✅ Leave log sent for ${member.user.tag}`);
    } catch (e) {
        console.error("Leave Log Error:", e.message);
    }
});

client.once("ready", () => {
    client.user.setPresence({
        status: "online",
        activities: [{ name: "💜 Always On ✨", type: ActivityType.Playing }]
    });

    let lastHeartbeat = 0;
    setInterval(() => {
        const now = Date.now();
        if (now - lastHeartbeat < 6900000) return; 

        const channel = client.channels.cache.get(GENERAL_CHANNEL_ID);
        if (channel) {
            channel.send("💜 I’m still online!").catch(() => {});
            lastHeartbeat = now;
        }
    }, 1000 * 60 * 640);

    const randomGems = [
        "💜 Remember to drink some water today! ✨",
        "Hope everyone is having a lovely day so far! 🎀",
        "Just a reminder that you're all amazing! 💜",
        "Sending good vibes to the chat! ✨",
        "What's the best thing that happened to you today? 👀"
    ];

    setInterval(() => {
        const channel = client.channels.cache.get(GENERAL_CHANNEL_ID);
        if (channel) {
            const quote = randomGems[Math.floor(Math.random() * randomGems.length)];
            channel.send(quote);
        }
    }, 1000 * 60 * 60 * 12);

    cron.schedule('0 9 * * *', () => {
        const channel = client.channels.cache.get(GENERAL_CHANNEL_ID);
        if (channel) {
            channel.send("☀️ **Good Morning Everyone!** 💜\nI hope you all slept well. What are you all up to today? ✨");
        }
    }, {
        scheduled: true,
        timezone: "America/New_York"
    });

    console.log("⏰ Schedules and presence initialized!");
});

// =======================
// MAIN MESSAGE HANDLER
// =======================
client.on("messageCreate", async (message) => {
    // 1. Ignore bot messages (except Disboard) and make sure it's in a server
    if (!message.guild) return;
    if (message.author.bot && message.author.id !== DISBOARD_BOT_ID) return;

    const content = message.content.toLowerCase();
    const args = message.content.split(" ");

    // --- DISBOARD BUMP LOGIC (Only runs if sender is Disboard) ---
    if (message.author.id === DISBOARD_BOT_ID) {
        if (message.interaction && message.interaction.commandName === 'bump') {
            if (message.embeds[0]?.description?.includes('Bump done')) {
                console.log('Successful bump detected! Starting 2-hour timer...');

                if (activeBumpTimeout) clearTimeout(activeBumpTimeout);

                activeBumpTimeout = setTimeout(async () => {
                    try {
                        const channel = await client.channels.fetch(ENHANCEMENTS_CHANNEL_ID);
                        if (channel) {
                            await channel.send('🔔 **The server is ready to be bumped!** Type `/bump` to help us grow! @Hera @Ban Hammer Abuser 🛠 ');
                            console.log('Bump reminder sent to enhancements channel.');
                        }
                    } catch (error) {
                        console.error('Error sending bump reminder:', error);
                    }
                }, TWO_HOURS);
            }
        }
        return; // Stop processing further commands for the Disboard bot
    }

    // --- REGULAR USERS XP LOGIC ---
    let userData = await User.findOne({ userId: message.author.id, guildId: message.guild.id });
    if (!userData) {
        userData = new User({ userId: message.author.id, guildId: message.guild.id });
    }

    // Add passive XP on message
    userData.xp += 10; 

    // Level formula
    const nextLevelXP = Math.floor(100 * Math.pow(userData.level, 1.5) + (userData.level * 50) + 100);

    if (userData.xp >= nextLevelXP) {
        userData.xp -= nextLevelXP;
        userData.level++;
        
        try {
            const levelChannel = await message.guild.channels.fetch(LEVEL_CHANNEL_ID);
            if (levelChannel) {
                await levelChannel.send(`✨ **Level Up!** <@${message.author.id}> reached level **${userData.level}** (˶ᵔ ᵕ ᵔ˶)`);
            } else {
                await message.reply(`🎉 **Level Up!** You've reached level **${userData.level}**!`);
            }
        } catch (error) {
            console.error("Failed to find level channel:", error.message);
            await message.reply(`🎉 **Level Up!** You've reached level **${userData.level}**!`);
        }
    }
    await userData.save();

    // --- COMMANDS ---

    // 2. HELP COMMAND
    if (content === "!help") {
        const embed = new EmbedBuilder()
            .setColor(0xff66cc)
            .setTitle("💜 Hera Bot Commands")
            .setDescription("Everything I can do ✨")
            .addFields(
                { name: "🎭 Reaction Roles", value: "`!roles`" },
                { name: "📊 Leveling", value: "`!rank` | `!leaderboard` | `!daily`" },
                { name: "💰 Economy", value: "`!bal` | `!work` | `!slots`" },
                { name: "💬 Fun", value: "`!hello` | `!pingpong`" }
            )
            .setFooter({ text: "💜 built for activity + community" });

        return message.channel.send({ embeds: [embed] });
    }

    // 3. ADMIN ROLES COMMAND
    if (content === "!roles" && message.member.permissions.has("Administrator")) {
        for (const panel of panels) {
            let text = `**${panel.title}**\n`;
            const emojisToReact = [];
            Object.entries(panel.roles).forEach(([emoji, name]) => {
                text += `${emoji} → ${name}\n`;
                emojisToReact.push(emoji);
            });

            const sentMsg = await message.channel.send(text);
            await RoleMessage.findOneAndUpdate(
                { messageId: sentMsg.id }, 
                { guildId: message.guild.id }, 
                { upsert: true }
            );

            for (const emoji of emojisToReact) {
                await sentMsg.react(emoji).catch(() => {});
                await new Promise(r => setTimeout(r, 450)); 
            }
        }
        return;
    }

    // 4. XP & ECONOMY COMMANDS
    if (content === "!rank") {
        const nextXP = Math.floor(Math.pow((userData.level + 1) / 0.1, 2));
        const embed = new EmbedBuilder()
            .setColor(0xffc1e3)
            .setTitle(`✨ ${message.author.username}'s Rank`)
            .setThumbnail(message.author.displayAvatarURL())
            .addFields(
                { name: "📊 Level", value: `${userData.level}`, inline: true },
                { name: "✨ XP", value: `${userData.xp}`, inline: true },
                { name: "🎯 Next Level", value: `${nextXP} XP`, inline: true }
            );
        return message.reply({ embeds: [embed] });
    }

    if (content === "!daily") {
        const now = Date.now();
        if (now - userData.lastDaily < 86400000) {
            const remaining = Math.ceil((86400000 - (now - userData.lastDaily)) / 3600000);
            return message.reply(`Slow down! Try again in ${remaining} hours. 🎀`);
        }
        userData.xp += 50;
        userData.lastDaily = now;
        await userData.save();
        return message.reply("✨ You claimed your daily **50 XP**! 🪄");
    }

    if (content === "!leaderboard") {
        const topUsers = await User.find().sort({ xp: -1 }).limit(10);
        const list = await Promise.all(topUsers.map(async (r, i) => {
            const u = await client.users.fetch(r.userId).catch(() => ({ username: "Unknown" }));
            return `**${i + 1}.** ${u.username} • Lvl ${r.level} (${r.xp} XP)`;
        }));
        const embed = new EmbedBuilder()
            .setColor(0xffc1e3)
            .setTitle("🏆 Fairy Leaderboard")
            .setDescription(list.join("\n") || "No magic here yet!");
        return message.channel.send({ embeds: [embed] });
    }

    if (content === "!bal" || content === "!balance") {
        return message.reply(`💰 **${message.author.username}**, you have **$${userData.balance || 0}** in your pouch!`);
    }

    if (content === "!work") {
        const payout = Math.floor(Math.random() * 50) + 20;
        userData.balance += payout;
        await userData.save();
        return message.reply(`🛠️ You worked a fairy shift and earned **$${payout}**!`);
    }

    if (args[0] === "!slots") {
        const bet = parseInt(args[1]);
        if (!bet || bet <= 0) return message.reply("How much do you want to bet? usage: `!slots 50` 💜");
        if (userData.balance < bet) return message.reply("You're broke! Work a bit more first. 💸");

        const icons = ["🍒", "💎", "⭐", "🍎"];
        const [r1, r2, r3] = [0, 0, 0].map(() => icons[Math.floor(Math.random() * icons.length)]);

        if (r1 === r2 && r2 === r3) {
            userData.balance += (bet * 5);
            await userData.save();
            return message.reply(`[ ${r1} | ${r2} | ${r3} ]\n**JACKPOT!** You won **$${bet * 5}**! 🎉`);
        } else {
            userData.balance -= bet;
            await userData.save();
            return message.reply(`[ ${r1} | ${r2} | ${r3} ]\nYou lost **$${bet}**. 🪄`);
        }
    }

    // 5. FUN & PERSONALITY
    if (content === "!pingpong") {
        let score = 0;
        await message.channel.send("🏓 **Game on!** I'll start...\n**PING!**");
        const filter = m => m.author.id === message.author.id && ["ping", "pong"].includes(m.content.toLowerCase());
        const collector = message.channel.createMessageCollector({ filter, time: 10000 });

        collector.on('collect', async m => {
            score++;
            const response = m.content.toLowerCase() === "ping" ? "**PONG!**" : "**PING!**";
            await m.channel.send(`${response} (Score: ${score})`);
            collector.resetTimer(); 
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time') message.channel.send(`⏱️ **Time's up!** Score: **${score}** 💜`);
        });
        return;
    }

    if (message.mentions.has(client.user)) return message.reply(pick(responses[currentMood].mention));
    if (content.includes("hello") || content.includes("hi bot")) return message.reply(pick(responses[currentMood].hello));
    
    // Passive responses
    if (Math.random() < 0.05) return message.reply(pick(responses[currentMood].default));
});

// =======================
// REACTION LOGIC
// =======================
async function toggleRole(reaction, user, add = true) {
    if (user.bot || !reaction.message.guild) return;
    if (reaction.partial) await reaction.fetch().catch(() => {});

    const row = await RoleMessage.findOne({ messageId: reaction.message.id });
    if (!row) return;

    const roleName = reactionRolesMap[reaction.emoji.name];
    if (!roleName) return;

    const role = reaction.message.guild.roles.cache.find(r => r.name === roleName);
    const member = await reaction.message.guild.members.fetch(user.id).catch(() => {});

    if (role && member) {
        if (add) {
            await member.roles.add(role).catch(e => console.error(`Add role error: ${e}`));
        } else {
            await member.roles.remove(role).catch(e => console.error(`Remove role error: ${e}`));
        }
    }
}

client.on("messageReactionAdd", (r, u) => toggleRole(r, u, true));
client.on("messageReactionRemove", (r, u) => toggleRole(r, u, false));

// =======================
// ERROR HANDLING
// =======================
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);
console.log("STARTING HERA BOT...");

client.login(process.env.DISCORD_TOKEN);
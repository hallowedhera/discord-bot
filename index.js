// =======================
// CONFIG & ENV
// =======================
const TOKEN = process.env.DISCORD_TOKEN;
const GENERAL_CHANNEL_ID = process.env.GENERAL_CHANNEL_ID;
const ALERT_CHANNEL_ID = process.env.ALERT_CHANNEL_ID;
const LEVEL_CHANNEL_ID = process.env.LEVEL_CHANNEL_ID;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_USERNAME = process.env.TWITCH_USERNAME;
const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME;
const PORT = process.env.PORT || 10000;

const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    EmbedBuilder, 
    ActivityType 
} = require("discord.js");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const express = require("express");
// =======================
// KEEP-ALIVE SERVER
// =======================
const app = express();
app.get("/", (req, res) => res.send("Bot is active."));
app.listen(PORT, () => console.log(`Keep-alive server on port ${PORT}`));

// =======================
// DATABASE INIT
// =======================
const dbPath = path.resolve(__dirname, "bot.db");
const db = new sqlite3.Database(dbPath);
 db.serialize(() => {
    // Added 'balance' column here
    db.run(`CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY, 
        xp INTEGER DEFAULT 0, 
        level INTEGER DEFAULT 0, 
        last_daily INTEGER DEFAULT 0,
        balance INTEGER DEFAULT 0
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS role_messages (message_id TEXT PRIMARY KEY, guild_id TEXT)`);
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

      sendAlert(
        `🔴 **LIVE NOW ON TWITCH**\nhttps://twitch.tv/${TWITCH_USERNAME}`
      );
    }

    if (!isLive) {
      seenTwitchLive.delete(TWITCH_USERNAME);
    }

  } catch (e) {
    console.log("Twitch error:", e.message);
  }
}
setInterval(checkTwitch, 90000);
setInterval(checkTikTok, 120000);

const seenTikTokVideo = new Set();

async function checkTikTok() {
  try {
    const res = await axios.get(
      `https://www.tiktok.com/@${TIKTOK_USERNAME}?lang=en`
    );

    const match = res.data.match(/video\/(\d{15,})/g);
    if (!match) return;

    const latest = match[0];

    if (seenTikTokVideo.has(latest)) return;

    seenTikTokVideo.add(latest);

    sendAlert(
      `🎵 **New TikTok Posted!**\nhttps://tiktok.com/@${TIKTOK_USERNAME}`
    );

  } catch (e) {
    console.log("TikTok error:", e.message);
  }
}
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
// CLIENT SETUP
// =======================
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
// XP LOGIC
// =======================
async function addXP(userId, guild) {
    const gain = Math.floor(Math.random() * 6) + 5;
    db.get("SELECT * FROM users WHERE user_id = ?", [userId], (err, row) => {
        if (err) return;
        if (!row) {
            db.run("INSERT INTO users (user_id, xp, level) VALUES (?, ?, ?)", [userId, gain, 0]);
        } else {
            const newXP = row.xp + gain;
            const newLevel = getLevel(newXP);
            db.run("UPDATE users SET xp = ?, level = ? WHERE user_id = ?", [newXP, newLevel, userId]);
            
            if (newLevel > row.level) {
                const channel = client.channels.cache.get(LEVEL_CHANNEL_ID);
                if (channel) channel.send(`🏆 <@${userId}> leveled up to **Level ${newLevel}** 💜`);
            }
        }
    });
}

// =======================
// EVENT HANDLERS
// =======================
client.once("ready", () => {
      console.log(`✅ Logged in as ${client.user.tag}`);
  const cron = require('node-cron');
    
    const GENERAL_CHANNEL_ID = "1285656272774889605";

    // --- FEATURE: Random Messages every 12 Hours ---
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
    }, 1000 * 60 * 60 * 12); // Exactly 12 hours


    // --- FEATURE: 9 AM Good Morning Message ---
    // This runs every day at 09:00 (server time)
    cron.schedule('0 9 * * *', () => {
        const channel = client.channels.cache.get(GENERAL_CHANNEL_ID);
        if (channel) {
            channel.send("☀️ **Good Morning Everyone!** 💜\nI hope you all slept well. What are you all up to today? ✨");
        }
    }, {
        scheduled: true,
        timezone: "America/New_York" // Set this to your specific timezone!
    });

    console.log("⏰ Schedules initialized!");
});
    client.user.setPresence({
        status: "online",
        activities: [{ name: "💜 Always On ✨", type: ActivityType.Playing }]
        
    });

    // Heartbeat System
    let lastHeartbeat = 0;
    setInterval(() => {
        const now = Date.now();
        if (now - lastHeartbeat < 1700000) return; 
        const channel = client.channels.cache.get(ALERT_CHANNEL_ID);
        if (channel) {
            channel.send("💜 I’m still online!").catch(() => {});
            lastHeartbeat = now;
        }
    }, 1000 * 60 * 30);

client.on("messageCreate", async (message) => {
    const args = message.content.split(" ");
    if (message.author.bot || !message.guild) return;

    addXP(message.author.id, message.guild);
    const content = message.content.toLowerCase();
    if (content === "!help") {
  const embed = new EmbedBuilder()
    .setColor(0xff66cc)
    .setTitle("💜 Hera Bot Commands")
    .setDescription("Everything I can do ✨")
    .addFields(
      {
        name: "🎭 Reaction Roles",
        value: "`!roles` → shows role categories you can react to"
      },
      {
        name: "📊 Leveling System",
        value:
          "`!rank` → your XP + level\n`!leaderboard` → top users on the server"
      },
      {
        name: "💰 Economy",
        value:
          "`!daily` → claim daily XP reward (if enabled)\nXP is gained automatically from chatting"
      },
      {
        name: "💬 Fun Commands",
        value:
          "`!hello` → talk to the bot\nMention me → random replies"
      },
      {
        name: "🔴 Live Alerts (Auto)",
        value:
          "• Twitch live notifications\n• TikTok new post alerts\n• Sent to #hera-alerts"
      },
      {
        name: "⚙️ System",
        value:
          "Auto XP tracking\nReaction role system\nAlways-online alert system"
      }
    )
    .setFooter({ text: "💜 built for activity + community engagement" });

  return message.channel.send({ embeds: [embed] });
}

    // Updated !roles command for Individual Panels
    if (content === "!roles" && message.member.permissions.has("Administrator")) {
        for (const panel of panels) {
            let text = `**${panel.title}**\n`;
            const emojisToReact = [];
            
            Object.entries(panel.roles).forEach(([emoji, name]) => {
                text += `${emoji} → ${name}\n`;
                emojisToReact.push(emoji);
            });

            const sentMsg = await message.channel.send(text);
            
            // Save each individual message ID to the database
            db.run("INSERT OR REPLACE INTO role_messages (message_id, guild_id) VALUES (?, ?)", [sentMsg.id, message.guild.id]);

            // React with only the emojis for this specific category
            for (const emoji of emojisToReact) {
                await sentMsg.react(emoji).catch(() => {});
                await new Promise(r => setTimeout(r, 450)); // Prevent Discord rate limit
            }
        }
        return;
    }

    if (content === "!rank") {
        db.get("SELECT * FROM users WHERE user_id = ?", [message.author.id], (err, row) => {
            const xp = row?.xp || 0;
            const level = row?.level || 0;
            const nextXP = Math.floor(Math.pow((level + 1) / 0.1, 2));
            
            const embed = new EmbedBuilder()
                .setColor(0xff66cc)
                .setTitle(`💜 ${message.author.username}'s Rank`)
                .setThumbnail(message.author.displayAvatarURL())
                .addFields(
                    { name: "📊 Level", value: `${level}`, inline: true },
                    { name: "✨ XP", value: `${xp}`, inline: true },
                    { name: "🎯 Next Level", value: `${nextXP} XP`, inline: true }
                );
            message.reply({ embeds: [embed] });
        });
        return;
    }

    if (content === "!daily") {
        const now = Date.now();
        db.get("SELECT last_daily FROM users WHERE user_id = ?", [message.author.id], (err, row) => {
            if (row && now - row.last_daily < 86400000) {
                const remaining = Math.ceil((86400000 - (now - row.last_daily)) / 3600000);
                return message.reply(`Slow down! Try again in ${remaining} hours. 💜`);
            }
            db.run("UPDATE users SET xp = xp + 50, last_daily = ? WHERE user_id = ?", [now, message.author.id]);
            message.reply("✨ You claimed your daily **50 XP**! 💜");
        });
        return;
    }

    if (content === "!leaderboard") {
        db.all("SELECT user_id, xp, level FROM users ORDER BY xp DESC LIMIT 10", async (err, rows) => {
            if (err || !rows) return;
            const list = await Promise.all(rows.map(async (r, i) => {
                const u = await client.users.fetch(r.user_id).catch(() => ({ username: "Unknown" }));
                return `**${i + 1}.** ${u.username} • Lvl ${r.level} (${r.xp} XP)`;
            }));
            const embed = new EmbedBuilder()
                .setColor(0x00ccff)
                .setTitle("🏆 XP Leaderboard")
                .setDescription(list.join("\n") || "No one yet!");
            message.channel.send({ embeds: [embed] });
        });
        return;
    }
    // --- START ECONOMY LOGIC ---
    
    // 1. Passive Income: 10% chance to find $1-5 when chatting
    const moneyFound = Math.random() < 0.1 ? Math.floor(Math.random() * 5) + 1 : 0;
    if (moneyFound > 0) {
        db.run("UPDATE users SET balance = balance + ? WHERE user_id = ?", [moneyFound, message.author.id]);
    }

    // 2. !bal / !balance
    if (content === "!bal" || content === "!balance") {
        db.get("SELECT balance FROM users WHERE user_id = ?", [message.author.id], (err, row) => {
            const bal = row?.balance || 0;
            message.reply(`💰 **${message.author.username}**, you have **$${bal}** in your wallet!`);
        });
        return;
    }

    // 3. !work
    if (content === "!work") {
        const payout = Math.floor(Math.random() * 50) + 20;
        db.run("UPDATE users SET balance = balance + ? WHERE user_id = ?", [payout, message.author.id]);
        message.reply(`🛠️ You worked a shift and earned **$${payout}**!`);
        return;
    }

    // 4. !slots <amount>
    if (args[0] === "!slots") {
        const bet = parseInt(args[1]);
        if (!bet || bet <= 0) return message.reply("How much do you want to bet? usage: `!slots 50` 💜");
        
        db.get("SELECT balance FROM users WHERE user_id = ?", [message.author.id], (err, row) => {
            if (!row || row.balance < bet) return message.reply("You're broke! Work a bit more first. 💸");

            const icons = ["🍒", "💎", "⭐", "🍎"];
            const r1 = icons[Math.floor(Math.random() * icons.length)];
            const r2 = icons[Math.floor(Math.random() * icons.length)];
            const r3 = icons[Math.floor(Math.random() * icons.length)];

            if (r1 === r2 && r2 === r3) {
                const win = bet * 5;
                db.run("UPDATE users SET balance = balance + ? WHERE user_id = ?", [win, message.author.id]);
                message.reply(`[ ${r1} | ${r2} | ${r3} ]\n**JACKPOT!** You won **$${win}**! 🎉`);
            } else {
                db.run("UPDATE users SET balance = balance - ? WHERE user_id = ?", [bet, message.author.id]);
                message.reply(`[ ${r1} | ${r2} | ${r3} ]\nYou lost **$${bet}**. Better luck next time! 💜`);
            }
        });
        return;
    }

    // 5. !shop
    if (content === "!shop") {
        const list = shopItems.map((item, i) => `**${i+1}. ${item.name}** — $${item.price}\n*${item.description}*`).join("\n\n");
        const embed = new EmbedBuilder()
            .setTitle("🛍️ Server Shop")
            .setDescription(list)
            .setColor(0xffcc00)
            .setFooter({ text: "Use !buy <number> to purchase!" });
        message.channel.send({ embeds: [embed] });
        return;
    }

    // --- END ECONOMY LOGIC ---
// --- FEATURE: Ping Pong Game ---
    if (content === "!pingpong") {
        let score = 0;
        await message.channel.send("🏓 **Game on!** I'll start...\n**PING!**");

        // The filter ensures Hera only listens to the person who started the game
        const filter = m => m.author.id === message.author.id && 
                           (m.content.toLowerCase() === "pong" || m.content.toLowerCase() === "ping");
        
        // Collector lasts for 10 seconds per turn
        const collector = message.channel.createMessageCollector({ filter, time: 10000 });

        collector.on('collect', async m => {
            score++;
            // If you say ping, she says pong. If you say pong, she says ping.
            const response = m.content.toLowerCase() === "ping" ? "**PONG!**" : "**PING!**";
            
            await m.channel.send(`${response} (Score: ${score})`);
            
            // Reset the 10-second timer so you have time for the next hit
            collector.resetTimer(); 
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                message.channel.send(`⏱️ **Time's up!** You missed the ball. Final Score: **${score}** 💜`);
            }
        });
        return;
    }
    // Personality triggers
    if (message.mentions.has(client.user)) {
        return message.reply(pick(responses[currentMood].mention));
    }
    if (content.includes("hello") || content.includes("hi bot")) {
        return message.reply(pick(responses[currentMood].hello));
    }
    if (Math.random() < 0.010) {
        return message.reply(pick(responses[currentMood].default));
    }
    const activeContent = content.toLowerCase();
    if (activeContent.includes("love you bot")) {
        return message.reply("aww, love you too! 💜");
    }
    if (activeContent.includes("bot is mid")) {
        return message.reply("EXCUSE ME? 💀💥");
    }
    if (activeContent.includes("go to sleep")) {
        return message.reply("I never sleep... I'm always watching. 👀💜");
    }

    // C. Pure Randomness (Adjust the 0.05 to change how yappy the bot is)
    if (Math.random() < 0.05) { 
        return message.reply(pick(responses[currentMood].default));
    }
});

// =======================
// REACTION LOGIC
// =======================
async function toggleRole(reaction, user, add = true) {
    if (user.bot || !reaction.message.guild) return;
    if (reaction.partial) await reaction.fetch().catch(() => {});

    // Check if the message is in our role_messages database
    db.get("SELECT * FROM role_messages WHERE message_id = ?", [reaction.message.id], async (err, row) => {
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
    });
}

client.on("messageReactionAdd", (r, u) => toggleRole(r, u, true));
client.on("messageReactionRemove", (r, u) => toggleRole(r, u, false));

// =======================
// ERROR HANDLING
// =======================
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);
console.log("START");

client.login(process.env.DISCORD_TOKEN);
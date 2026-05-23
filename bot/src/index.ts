import express from "express";
import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  type Interaction,
  type Message,
  type GuildMember,
  type VoiceState,
  type TextChannel,
  type GuildBasedChannel,
  type ChatInputCommandInteraction,
} from "discord.js";
import {
  pool,
  getUser,
  addPoints,
  getGuildConfig,
  setGuildConfig,
  initSchema,
  addToVault,
  getVault,
  withdrawFromVault,
  markFridayDraw,
  getBlackMarket,
  openBlackMarket,
  isBlackMarketOpen,
  computeTitle,
  formatTitle,
  isVerified,
  markVerified,
  createGiveaway,
  addGiveawayEntry,
  getDueGiveaways,
  endGiveaway,
} from "./lib/db.js";
import { chatAI, translateToArabic, generateImage } from "./lib/ai.js";
import { initLavalink, initOnReady, getPlayer, searchAndQueue, formatDuration } from "./lib/music.js";
import { sendLog, maskedActor } from "./lib/log.js";
import {
  buildMainPanel,
  buildChannelsPanel,
  buildRolesPanel,
  buildProtectionPanel,
  buildEconomyPanel,
  buildWelcomePanel,
  type PanelConfig,
} from "./lib/panel.js";
import {
  ATHKAR,
  HEKAM,
  STEAL_FAIL_LINES,
  STEAL_SUCCESS_LINES,
  SHIELD_BLOCK_LINES,
  pick,
} from "./lib/messages.js";
import { registerCommands } from "./register-commands.js";

const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!TOKEN) {
  console.error("[FATAL] DISCORD_BOT_TOKEN is required — ضع التوكن في ملف .env");
  process.exit(1);
}

// ==================== Global Error Handlers ====================
// منع البوت من الانطفاء بسبب أخطاء غير متوقعة
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught Exception — خطأ غير متوقع:", err?.message ?? err);
  console.error(err?.stack ?? "");
  // لا نخرج — البوت يستمر في العمل
});

process.on("unhandledRejection", (reason: unknown) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error("[WARN] Unhandled Promise Rejection:", msg);
});

// إعادة الاتصال تلقائياً عند انقطاع الشبكة
process.on("SIGTERM", () => {
  console.log("[INFO] SIGTERM received — إيقاف مدار");
  process.exit(0);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Channel, Partials.Message],
});

// ─── Discord client-level error recovery ─────────────────────────
client.on("error", (err) => {
  console.error("[Discord] Client Error:", err?.message ?? err);
});
client.on("warn", (info) => {
  console.warn("[Discord] Warning:", info);
});
client.on("shardDisconnect", (event, id) => {
  console.warn(`[Discord] Shard ${id} disconnected — code: ${event.code}`);
});
client.on("shardReconnecting", (id) => {
  console.log(`[Discord] Shard ${id} reconnecting...`);
});
client.on("shardResume", (id, replayed) => {
  console.log(`[Discord] Shard ${id} resumed — replayed ${replayed} events`);
});

const COLOR_PRIMARY = 0xf1c40f;
const COLOR_SUCCESS = 0x2ecc71;
const COLOR_DANGER = 0xe74c3c;
const COLOR_WARN = 0xf39c12;
const COLOR_INFO = 0x3498db;

const SHOP_ITEMS = [
  { id: "color", name: "🎨 لون مميز", price: 500, desc: "اختر لون فريد لاسمك" },
  { id: "shield", name: "🛡️ درع حماية (24 ساعة)", price: 1200, desc: "يمنع الآخرين من سرقتك لمدة 24 ساعة" },
  { id: "freejail", name: "🔓 خروج من السجن", price: 800, desc: "إلغاء فوري للتايم آوت إذا كنت في السجن" },
  { id: "vip", name: "👑 رتبة VIP", price: 50000, desc: "رتبة ملكية تظهر بجانب اسمك" },
];

const BLACK_MARKET_ITEMS = [
  { id: "stealth", name: "🕵️ قناع التخفي", price: 5000, desc: "تسرق بدون ما يظهر اسمك في السجلات لمدة 30 دقيقة" },
  { id: "hack", name: "💻 جهاز الاختراق", price: 7500, desc: "يرفع نسبة نجاح سرقتك القادمة إلى 80%" },
  { id: "jailkey", name: "🗝️ مفتاح السجن", price: 3000, desc: "يخرجك تلقائياً من السجن إذا تم القبض عليك" },
  { id: "bomb", name: "💣 قنبلة النقاط", price: 10000, desc: "تخصم مستوى كامل من عضو تختاره — استخدم `/قنبلة @العضو`" },
];

const SHOP_TAX_RATE = 0.1; // 10% من كل عملية شراء تذهب للخزنة

const BACKGROUNDS = [
  { id: "galaxy", name: "🌌 خلفية المجرة", price: 5000, url: "https://picsum.photos/seed/galaxybg/800/200" },
  { id: "sunset", name: "🌅 خلفية الغروب", price: 5000, url: "https://picsum.photos/seed/sunsetbg/800/200" },
  { id: "ocean", name: "🌊 خلفية المحيط", price: 5000, url: "https://picsum.photos/seed/oceanbg/800/200" },
  { id: "forest", name: "🌲 خلفية الغابة", price: 5000, url: "https://picsum.photos/seed/forestbg/800/200" },
  { id: "neon", name: "💜 خلفية النيون", price: 7500, url: "https://picsum.photos/seed/neonbg/800/200" },
  { id: "gold", name: "👑 خلفية ذهبية فاخرة", price: 15000, url: "https://picsum.photos/seed/goldbg/800/200" },
];

// ==================== Pending state ====================
type PendingState =
  | { type: "purge_count"; channelId: string; userId: string; expiresAt: number };

const pending = new Map<string, PendingState>();

function setPending(key: string, state: PendingState): void {
  pending.set(key, state);
  setTimeout(() => {
    const s = pending.get(key);
    if (s && s.expiresAt <= Date.now()) pending.delete(key);
  }, state.expiresAt - Date.now() + 1000);
}

// ==================== Ready ====================
// ==================== Black Market scheduling state ====================
const bmSchedule = new Map<string, { date: string; openAt: number }>();

function todayKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

async function announceBlackMarketOpen(guildId: string, until: Date): Promise<void> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;
  const cfg = await getGuildConfig(guildId);
  const channelId = cfg.log_channel_id || cfg.welcome_channel_id;
  if (!channelId) return;
  const ch = await client.channels.fetch(channelId).catch(() => null);
  if (!ch || !ch.isTextBased()) return;
  const embed = new EmbedBuilder()
    .setColor(0x2c2f33)
    .setTitle("🕵️ السوق السوداء فُتح!")
    .setDescription(
      `الأبواب مفتوحة لمدة **ساعة واحدة فقط** حتى <t:${Math.floor(until.getTime() / 1000)}:t> (<t:${Math.floor(until.getTime() / 1000)}:R>).\n\n` +
        `استخدم \`/السوق_السوداء\` لتصفح الأدوات المحظورة قبل ما تختفي!`
    )
    .setTimestamp();
  await (ch as TextChannel).send({ embeds: [embed] }).catch(() => {});
}

async function blackMarketTick(): Promise<void> {
  const today = todayKey();
  for (const [, guild] of client.guilds.cache) {
    try {
      const bm = await getBlackMarket(guild.id);
      const lastOpen = bm.last_open_date
        ? `${new Date(bm.last_open_date).getUTCFullYear()}-${new Date(bm.last_open_date).getUTCMonth()}-${new Date(bm.last_open_date).getUTCDate()}`
        : null;
      if (lastOpen === today) continue; // already opened today
      let sched = bmSchedule.get(guild.id);
      if (!sched || sched.date !== today) {
        // Schedule random time today (within next 23h)
        const now = Date.now();
        const endOfDay = new Date();
        endOfDay.setUTCHours(23, 0, 0, 0);
        const minTime = now + 60_000;
        const maxTime = Math.max(endOfDay.getTime(), now + 23 * 3600_000);
        const openAt = minTime + Math.random() * (maxTime - minTime);
        sched = { date: today, openAt };
        bmSchedule.set(guild.id, sched);
      }
      if (Date.now() >= sched.openAt) {
        const until = await openBlackMarket(guild.id, 60 * 60 * 1000);
        await announceBlackMarketOpen(guild.id, until);
      }
    } catch (e) {
      console.error("BM tick error", e);
    }
  }
}

async function fridayDrawTick(): Promise<void> {
  const now = new Date();
  if (now.getUTCDay() !== 5) return; // Friday only
  const todayDate = now.toISOString().slice(0, 10);
  for (const [, guild] of client.guilds.cache) {
    try {
      const v = await getVault(guild.id);
      const lastDraw = v.last_friday_draw ? new Date(v.last_friday_draw).toISOString().slice(0, 10) : null;
      if (lastDraw === todayDate) continue;
      if (v.balance < 100) {
        await markFridayDraw(guild.id, now);
        continue;
      }
      // Pick winner from chat-active users in last 7 days
      const r = await pool.query<{ user_id: string }>(
        `SELECT user_id FROM bot_users
         WHERE guild_id=$1 AND (daily_at IS NOT NULL OR steal_at IS NOT NULL)
         ORDER BY RANDOM() LIMIT 1`,
        [guild.id]
      );
      if (r.rows.length === 0) {
        await markFridayDraw(guild.id, now);
        continue;
      }
      const winnerId = r.rows[0]!.user_id;
      const prize = Math.floor(v.balance * 0.5);
      await withdrawFromVault(guild.id, prize);
      await addPoints(winnerId, guild.id, prize);
      await markFridayDraw(guild.id, now);
      const cfg = await getGuildConfig(guild.id);
      const channelId = cfg.welcome_channel_id || cfg.log_channel_id;
      if (channelId) {
        const ch = await client.channels.fetch(channelId).catch(() => null);
        if (ch && ch.isTextBased()) {
          const embed = new EmbedBuilder()
            .setColor(0xf1c40f)
            .setTitle("🎰 سحب الجمعة الأسبوعي!")
            .setDescription(
              `🎉 مبروك <@${winnerId}>!\n\n` +
                `كسبت **${prize}** نقطة من خزنة السيرفر! 💰\n` +
                `تبقى في الخزنة: **${v.balance - prize}** نقطة.`
            )
            .setTimestamp();
          await (ch as TextChannel).send({ content: `<@${winnerId}>`, embeds: [embed] }).catch(() => {});
        }
      }
    } catch (e) {
      console.error("Friday draw error", e);
    }
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Bot logged in as ${c.user.tag}`);
  try {
    await initSchema();
    console.log("✅ Schema migrated");
  } catch (e) {
    console.error("Schema migration failed:", e);
  }
  try {
    await registerCommands(c);
    console.log("✅ Slash commands registered");
  } catch (e) {
    console.error("Failed to register commands:", e);
  }

  // Initialize Lavalink (music) — must be after client.user is set
  try {
    initLavalink(c);
    await initOnReady();
  } catch (e) {
    console.error("Lavalink init failed:", e);
  }

  // Black market & Friday raffle every minute + giveaway scheduler
  setInterval(() => {
    blackMarketTick().catch(() => {});
    fridayDrawTick().catch(() => {});
    giveawayTick().catch(() => {});
  }, 60_000);
  blackMarketTick().catch(() => {});

  // Athkar/hekam every hour
  setInterval(async () => {
    for (const [, guild] of client.guilds.cache) {
      try {
        const cfg = await getGuildConfig(guild.id);
        if (!cfg.athkar_channel_id) continue;
        const ch = await client.channels.fetch(cfg.athkar_channel_id).catch(() => null);
        if (!ch || !ch.isTextBased()) continue;
        const useDhikr = Math.random() < 0.6;
        const text = useDhikr ? pick(ATHKAR) : pick(HEKAM);
        const embed = new EmbedBuilder()
          .setColor(useDhikr ? 0x16a085 : 0x9b59b6)
          .setTitle(useDhikr ? "🌿 ذكر" : "💡 حكمة")
          .setDescription(text)
          .setTimestamp();
        await (ch as TextChannel).send({ embeds: [embed] }).catch(() => {});
      } catch {
        // ignore
      }
    }
  }, 60 * 60 * 1000);
});

async function giveawayTick(): Promise<void> {
  const due = await getDueGiveaways();
  for (const g of due) {
    try {
      const ch = await client.channels.fetch(g.channel_id).catch(() => null);
      const entries = g.entries || [];
      let resultText: string;
      if (entries.length === 0) {
        resultText = `🎉 انتهت قرعة **${g.prize}** ولا أحد شارك! 😢`;
      } else {
        const shuffled = [...entries].sort(() => Math.random() - 0.5);
        const winners = shuffled.slice(0, g.winners_count).map((id) => `<@${id}>`);
        resultText = `🎊 انتهت قرعة **${g.prize}**!\n🏆 الفائز${winners.length > 1 ? "ون" : ""}: ${winners.join(", ")}`;
      }
      if (ch && ch.isTextBased()) await (ch as TextChannel).send(resultText).catch(() => {});
      await endGiveaway(g.id);
    } catch (e) {
      console.error("giveaway end error", e);
      await endGiveaway(g.id).catch(() => {});
    }
  }
}

function fillTemplate(tmpl: string, member: GuildMember): string {
  return tmpl
    .replaceAll("{user}", `<@${member.id}>`)
    .replaceAll("{username}", member.user.username)
    .replaceAll("{server}", member.guild.name)
    .replaceAll("{count}", String(member.guild.memberCount));
}

client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
  try {
    const cfg = await getGuildConfig(member.guild.id);
    if (!cfg.welcome_channel_id) return;
    const ch = await client.channels.fetch(cfg.welcome_channel_id).catch(() => null);
    if (!ch || !ch.isTextBased()) return;
    const customMsg = (cfg as any).welcome_msg as string | null;
    const customImg = (cfg as any).welcome_image as string | null;
    const text = customMsg
      ? fillTemplate(customMsg, member)
      : `حياك الله في **${member.guild.name}** يا ${member}!\n\n` +
        `💰 **اجمع النقاط من خلال:**\n` +
        `• \`/راتب\` للحصول على مكافأة يومية\n` +
        `• الألعاب: \`/اسرع\`، \`/فكك\`، \`/عواصم\`\n` +
        `• تفاعلك في الشات والصوت يمنحك XP\n\n` +
        `📊 شاهد رصيدك بـ \`/نقاطي\` ولوحة المتصدرين بـ \`/البيست\`.`;
    const embed = new EmbedBuilder()
      .setColor(COLOR_PRIMARY)
      .setTitle(`🎉 أهلاً بك ${member.user.username}!`)
      .setDescription(text)
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .setTimestamp();
    if (customImg) embed.setImage(customImg);
    await (ch as TextChannel).send({ content: `${member}`, embeds: [embed] }).catch(() => {});
  } catch (e) {
    console.error("welcome error", e);
  }
});

client.on(Events.GuildMemberRemove, async (member) => {
  try {
    if (!member.guild) return;
    const cfg = await getGuildConfig(member.guild.id);
    if (!cfg.welcome_channel_id) return;
    const ch = await client.channels.fetch(cfg.welcome_channel_id).catch(() => null);
    if (!ch || !ch.isTextBased()) return;
    const customMsg = (cfg as any).leave_msg as string | null;
    const customImg = (cfg as any).leave_image as string | null;
    const text = customMsg
      ? fillTemplate(customMsg, member as GuildMember)
      : `😢 غادرنا **${member.user?.username ?? "عضو"}** — نتمنى له التوفيق.`;
    const embed = new EmbedBuilder()
      .setColor(COLOR_DANGER)
      .setTitle("👋 وداعاً")
      .setDescription(text)
      .setThumbnail(member.user?.displayAvatarURL({ size: 256 }) ?? "")
      .setTimestamp();
    if (customImg) embed.setImage(customImg);
    await (ch as TextChannel).send({ embeds: [embed] }).catch(() => {});
  } catch (e) {
    console.error("leave error", e);
  }
});

// ==================== Voice tracking ====================
client.on(Events.VoiceStateUpdate, async (oldState: VoiceState, newState: VoiceState) => {
  const userId = newState.id;
  const guildId = newState.guild.id;
  if (!oldState.channelId && newState.channelId) {
    await pool.query(
      `INSERT INTO bot_voice_sessions (user_id, guild_id, joined_at) VALUES ($1, $2, NOW())
       ON CONFLICT (user_id, guild_id) DO UPDATE SET joined_at = NOW()`,
      [userId, guildId]
    );
  } else if (oldState.channelId && !newState.channelId) {
    const r = await pool.query<{ joined_at: Date }>(
      "SELECT joined_at FROM bot_voice_sessions WHERE user_id=$1 AND guild_id=$2",
      [userId, guildId]
    );
    if (r.rows[0]) {
      const seconds = Math.floor((Date.now() - r.rows[0].joined_at.getTime()) / 1000);
      await pool.query(
        "UPDATE bot_users SET voice_seconds = voice_seconds + $1 WHERE user_id=$2",
        [seconds, userId]
      );
      await pool.query("DELETE FROM bot_voice_sessions WHERE user_id=$1 AND guild_id=$2", [userId, guildId]);
    }
  }
});

// ==================== Message-based features ====================
client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot || !message.guild) return;

  // ===== Anti-spam: block invite/URL links if enabled =====
  try {
    const cfg = await getGuildConfig(message.guild.id);
    if ((cfg as any).antispam_enabled) {
      const author = await message.guild.members.fetch(message.author.id).catch(() => null);
      const isMod = author?.permissions.has(PermissionFlagsBits.ManageMessages);
      if (!isMod && /(https?:\/\/|discord\.gg\/|discord\.com\/invite)/i.test(message.content)) {
        await message.delete().catch(() => {});
        const warn = await message.channel.send(`🛡️ <@${message.author.id}> الروابط ممنوعة في السيرفر.`).catch(() => null);
        setTimeout(() => warn?.delete().catch(() => {}), 5000);
        return;
      }
    }
  } catch (e) {
    console.error("antispam error", e);
  }

  // ===== Prefix-style moderation commands (reply OR mention) =====
  // Supported: براا (kick), اصبر (mute), تكلم (unmute), حظر (ban)
  try {
    const raw = message.content.trim();
    const modMatch = raw.match(/^(براا|اصبر|تكلم|حظر)\b\s*([\s\S]*)$/);
    if (modMatch) {
      const cmd = modMatch[1];
      let rest = modMatch[2].trim();

      // Resolve target: prefer replied-to message author, else first mention
      let targetId: string | null = null;
      if (message.reference?.messageId) {
        const ref = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
        if (ref) targetId = ref.author.id;
      }
      if (!targetId) {
        const m = rest.match(/<@!?(\d+)>/);
        if (m) {
          targetId = m[1];
          rest = rest.replace(m[0], "").trim();
        }
      }
      if (!targetId) {
        await message.reply("⚠️ لازم ترد على رسالة العضو أو تعمل له منشن.").catch(() => {});
        return;
      }
      if (targetId === message.author.id) {
        await message.reply("🤨 ما تقدر تعاقب نفسك.").catch(() => {});
        return;
      }
      if (targetId === client.user?.id) {
        await message.reply("😅 ما تقدر تعاقبني!").catch(() => {});
        return;
      }

      // Permission check based on command
      const permNeeded =
        cmd === "براا" ? PermissionFlagsBits.KickMembers :
        cmd === "حظر" ? PermissionFlagsBits.BanMembers :
        PermissionFlagsBits.ModerateMembers;
      const author = await message.guild.members.fetch(message.author.id).catch(() => null);
      if (!author || !author.permissions.has(permNeeded)) {
        await message.reply("🚫 ما عندك الصلاحية لاستخدام هذا الأمر.").catch(() => {});
        return;
      }

      const targetMember = await message.guild.members.fetch(targetId).catch(() => null);

      if (cmd === "براا") {
        if (!targetMember) { await message.reply("العضو مش بالسيرفر.").catch(() => {}); return; }
        if (!targetMember.kickable) { await message.reply("🚫 ما أقدر أطرد هذا العضو (رتبته أعلى أو محمي).").catch(() => {}); return; }
        const reason = rest || "بدون سبب";
        await targetMember.kick(reason);
        await message.reply(`👋 تم طرد <@${targetId}>. السبب: ${reason}`).catch(() => {});
        const log = new EmbedBuilder().setColor(COLOR_DANGER).setTitle("👋 طرد")
          .addFields(
            { name: "المطرود", value: `<@${targetId}>`, inline: true },
            { name: "بواسطة", value: `<@${message.author.id}>`, inline: true },
            { name: "السبب", value: reason },
          ).setTimestamp();
        await sendLog(client, message.guild.id, log);
        return;
      }

      if (cmd === "حظر") {
        if (targetMember && !targetMember.bannable) { await message.reply("🚫 ما أقدر أحظر هذا العضو (رتبته أعلى أو محمي).").catch(() => {}); return; }
        const reason = rest || "بدون سبب";
        await message.guild.members.ban(targetId, { reason }).catch(async () => {
          await message.reply("🚫 فشل الحظر.").catch(() => {});
        });
        await message.reply(`🔨 تم حظر <@${targetId}> نهائياً. السبب: ${reason}`).catch(() => {});
        const log = new EmbedBuilder().setColor(COLOR_DANGER).setTitle("🔨 حظر")
          .addFields(
            { name: "المحظور", value: `<@${targetId}>`, inline: true },
            { name: "بواسطة", value: `<@${message.author.id}>`, inline: true },
            { name: "السبب", value: reason },
          ).setTimestamp();
        await sendLog(client, message.guild.id, log);
        return;
      }

      if (cmd === "اصبر") {
        if (!targetMember) { await message.reply("العضو مش بالسيرفر.").catch(() => {}); return; }
        if (!targetMember.moderatable) { await message.reply("🚫 ما أقدر أسكت هذا العضو.").catch(() => {}); return; }
        // Parse minutes from rest (first integer), default 10
        const numMatch = rest.match(/(\d+)/);
        const minutes = numMatch ? Math.min(40320, Math.max(1, parseInt(numMatch[1], 10))) : 10;
        const reason = (numMatch ? rest.replace(numMatch[0], "") : rest).trim() || "بدون سبب";
        await targetMember.timeout(minutes * 60 * 1000, reason);
        await message.reply(`🤐 تم إسكات <@${targetId}> لمدة **${minutes}** دقيقة. السبب: ${reason}`).catch(() => {});
        const log = new EmbedBuilder().setColor(COLOR_WARN).setTitle("🤐 إسكات")
          .addFields(
            { name: "العضو", value: `<@${targetId}>`, inline: true },
            { name: "بواسطة", value: `<@${message.author.id}>`, inline: true },
            { name: "المدة", value: `${minutes} دقيقة`, inline: true },
            { name: "السبب", value: reason },
          ).setTimestamp();
        await sendLog(client, message.guild.id, log);
        return;
      }

      if (cmd === "تكلم") {
        if (!targetMember) { await message.reply("العضو مش بالسيرفر.").catch(() => {}); return; }
        if (!targetMember.moderatable) { await message.reply("🚫 ما أقدر أعدّل على هذا العضو.").catch(() => {}); return; }
        await targetMember.timeout(null);
        await message.reply(`🗣️ تم فك الإسكات عن <@${targetId}>. تكلم بحرية!`).catch(() => {});
        const log = new EmbedBuilder().setColor(COLOR_SUCCESS).setTitle("🗣️ فك إسكات")
          .addFields(
            { name: "العضو", value: `<@${targetId}>`, inline: true },
            { name: "بواسطة", value: `<@${message.author.id}>`, inline: true },
          ).setTimestamp();
        await sendLog(client, message.guild.id, log);
        return;
      }
    }
  } catch (e) {
    console.error("mod prefix error", e);
  }

  // Auto reactions: 🔥 on image attachments
  try {
    if (message.attachments.size > 0) {
      const hasImage = message.attachments.some((a) =>
        (a.contentType?.startsWith("image/") ?? false) ||
        /\.(png|jpe?g|gif|webp)$/i.test(a.name ?? "")
      );
      if (hasImage) await message.react("🔥").catch(() => {});
    }
  } catch {
    // ignore
  }

  // Translation by reply
  if (message.reference && /^ترجمة$/i.test(message.content.trim())) {
    try {
      const ref = await message.channel.messages.fetch(message.reference.messageId!);
      if (ref?.content) {
        const translated = await translateToArabic(ref.content);
        const embed = new EmbedBuilder()
          .setColor(COLOR_INFO)
          .setTitle("🌐 ترجمة")
          .addFields(
            { name: "الأصلي", value: ref.content.slice(0, 1000) },
            { name: "العربية", value: translated.slice(0, 1000) }
          );
        await message.reply({ embeds: [embed] });
      }
    } catch (e) {
      console.error("translate error", e);
    }
  }

  // Purge count waiting
  const purgeKey = `purge:${message.channel.id}:${message.author.id}`;
  const ps = pending.get(purgeKey);
  if (ps && ps.type === "purge_count" && ps.expiresAt > Date.now()) {
    const n = parseInt(message.content.trim(), 10);
    if (!isNaN(n) && n > 0 && n <= 100) {
      pending.delete(purgeKey);
      try {
        const ch = message.channel as TextChannel;
        const deleted = await ch.bulkDelete(Math.min(n + 1, 100), true);
        const reply = await ch.send(`🧹 تم كنس ${deleted.size - 1} رسالة.`);
        setTimeout(() => reply.delete().catch(() => {}), 5000);
        const log = new EmbedBuilder()
          .setColor(COLOR_DANGER)
          .setTitle("🧹 كنس رسائل")
          .addFields(
            { name: "المسؤول", value: `<@${message.author.id}>`, inline: true },
            { name: "القناة", value: `<#${message.channel.id}>`, inline: true },
            { name: "العدد", value: `${deleted.size - 1}`, inline: true }
          )
          .setTimestamp();
        await sendLog(client, message.guild.id, log);
      } catch (e) {
        console.error("purge error", e);
        await message.channel.send("⚠️ تعذّر الحذف. الرسائل قد تكون أقدم من 14 يوماً.");
      }
    }
  }
});

// ==================== Helpers ====================
async function fetchPanelConfig(guildId: string): Promise<PanelConfig> {
  await pool.query(
    "INSERT INTO bot_guild_config (guild_id) VALUES ($1) ON CONFLICT DO NOTHING",
    [guildId]
  );
  const r = await pool.query("SELECT * FROM bot_guild_config WHERE guild_id=$1", [guildId]);
  const row = r.rows[0] ?? {};
  return {
    log_channel_id: row.log_channel_id ?? null,
    welcome_channel_id: row.welcome_channel_id ?? null,
    athkar_channel_id: row.athkar_channel_id ?? null,
    ticket_category_id: row.ticket_category_id ?? null,
    vip_role_id: row.vip_role_id ?? null,
    verify_role_id: row.verify_role_id ?? null,
    verify_channel_id: row.verify_channel_id ?? null,
    antispam_enabled: row.antispam_enabled ?? false,
    welcome_msg: row.welcome_msg ?? null,
    leave_msg: row.leave_msg ?? null,
  };
}

function fmtMinutes(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h} ساعة و${m} دقيقة`;
  return `${m} دقيقة`;
}

async function checkMod(interaction: ChatInputCommandInteraction, perm: bigint): Promise<boolean> {
  const m = interaction.member as GuildMember | null;
  if (!m || !m.permissions.has(perm)) {
    await interaction.reply({ content: "🚫 ما عندك صلاحية لهذا الأمر.", ephemeral: true });
    return false;
  }
  return true;
}

// ==================== Slash commands ====================
client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (interaction.isButton()) {
    if (interaction.customId.startsWith("music:")) {
      const action = interaction.customId.split(":")[1];
      const player = getPlayer(interaction.guildId!);
      if (!player) {
        await interaction.reply({ content: "🚫 ما في تشغيل حالياً.", ephemeral: true });
        return;
      }
      const member = interaction.member as GuildMember | null;
      if (!member?.voice?.channel || member.voice.channelId !== player.voiceChannelId) {
        await interaction.reply({ content: "🚫 لازم تكون في نفس الروم الصوتي.", ephemeral: true });
        return;
      }
      try {
        if (action === "pause") {
          if (player.paused) { await interaction.reply({ content: "⏸️ التشغيل متوقف مسبقاً.", ephemeral: true }); return; }
          await player.pause();
          await interaction.reply({ content: `⏸️ ${interaction.user} أوقف التشغيل مؤقتاً.` });
        } else if (action === "resume") {
          if (!player.paused) { await interaction.reply({ content: "▶️ التشغيل شغّال أصلاً.", ephemeral: true }); return; }
          await player.resume();
          await interaction.reply({ content: `▶️ ${interaction.user} استأنف التشغيل.` });
        } else if (action === "skip") {
          await player.skip();
          await interaction.reply({ content: `⏭️ ${interaction.user} تخطّى الأغنية.` });
        } else if (action === "loop") {
          const next = player.repeatMode === "off" ? "track" : "off";
          await player.setRepeatMode(next);
          await interaction.reply({ content: next === "track" ? `🔁 ${interaction.user} فعّل التكرار.` : `➡️ ${interaction.user} ألغى التكرار.` });
        } else if (action === "stop") {
          await player.destroy();
          await interaction.reply({ content: `⏹️ ${interaction.user} أوقف الموسيقى وأخلى القائمة.` });
        } else if (action === "shuffle") {
          if (player.queue.tracks.length < 2) { await interaction.reply({ content: "🚫 محتاج أغنيتين على الأقل في الانتظار للخلط.", ephemeral: true }); return; }
          await player.queue.shuffle();
          await interaction.reply({ content: `🔀 ${interaction.user} خلَط ترتيب **${player.queue.tracks.length}** أغنية.` });
        }
      } catch (e: any) {
        if (!interaction.replied) await interaction.reply({ content: `🚫 خطأ: ${e?.message ?? e}`, ephemeral: true });
      }
      return;
    }
    if (interaction.customId.startsWith("bm:")) {
      const itemId = interaction.customId.split(":")[1];
      const item = BLACK_MARKET_ITEMS.find((i) => i.id === itemId);
      if (!item || item.id === "bomb") {
        await interaction.reply({ content: "💣 لاستخدام القنبلة، نفذ الأمر `/قنبلة @العضو` مباشرة.", ephemeral: true });
        return;
      }
      if (!(await isBlackMarketOpen(interaction.guildId!))) {
        await interaction.reply({ content: "🚫 السوق السوداء مغلق الآن. انتظر حتى يفتح من جديد!", ephemeral: true });
        return;
      }
      const u = await getUser(interaction.user.id, interaction.guildId!);
      if (Number(u.points) < item.price) {
        await interaction.reply({ content: `🚫 ما عندك نقاط كافية. السعر: ${item.price}، رصيدك: ${u.points}`, ephemeral: true });
        return;
      }
      await addPoints(interaction.user.id, interaction.guildId!, -item.price);
      // 10% tax → vault
      const tax = Math.floor(item.price * SHOP_TAX_RATE);
      await addToVault(interaction.guildId!, tax);
      let result = "";
      if (item.id === "stealth") {
        await pool.query(
          "UPDATE bot_users SET stealth_until = NOW() + INTERVAL '30 minutes' WHERE user_id=$1",
          [interaction.user.id]
        );
        result = "🕵️ تم تفعيل قناع التخفي لمدة 30 دقيقة. سرقاتك صارت سرية!";
      } else if (item.id === "hack") {
        await pool.query("UPDATE bot_users SET hack_next=TRUE WHERE user_id=$1", [interaction.user.id]);
        result = "💻 جهاز الاختراق جاهز. عملية السرقة القادمة لها 80% نجاح!";
      } else if (item.id === "jailkey") {
        await pool.query("UPDATE bot_users SET jail_keys = jail_keys + 1 WHERE user_id=$1", [interaction.user.id]);
        result = "🗝️ أضفت مفتاح سجن لمخزونك. سيُستخدم تلقائياً لو تم القبض عليك.";
      }
      await interaction.reply({ content: result, ephemeral: true });
      return;
    }
    if (interaction.customId.startsWith("bg:")) {
      const bgId = interaction.customId.split(":")[1];
      const bg = BACKGROUNDS.find((b) => b.id === bgId);
      if (!bg) return;
      const u = await getUser(interaction.user.id, interaction.guildId!);
      if (Number(u.points) < bg.price) {
        await interaction.reply({ content: `🚫 ما عندك نقاط كافية. السعر: ${bg.price}، رصيدك: ${u.points}`, ephemeral: true });
        return;
      }
      await addPoints(interaction.user.id, interaction.guildId!, -bg.price);
      const tax = Math.floor(bg.price * SHOP_TAX_RATE);
      await addToVault(interaction.guildId!, tax);
      await pool.query("UPDATE bot_users SET background=$1 WHERE user_id=$2", [bg.id, interaction.user.id]);
      await interaction.reply({ content: `🎨 تم تفعيل **${bg.name}** على بطاقتك! شوفها بـ \`/حسابي\`.`, ephemeral: true });
      return;
    }
    if (interaction.customId === "verify") {
      const cfg = await getGuildConfig(interaction.guildId!);
      const roleId = (cfg as any).verify_role_id as string | null;
      if (!roleId) {
        await interaction.reply({ content: "🚫 نظام التحقق غير مُعَدّ.", ephemeral: true });
        return;
      }
      if (await isVerified(interaction.user.id, interaction.guildId!)) {
        await interaction.reply({ content: "✅ أنت متحقّق سابقاً.", ephemeral: true });
        return;
      }
      const member = await interaction.guild!.members.fetch(interaction.user.id).catch(() => null);
      if (!member) return;
      // Account age check (must be 7+ days old to weed out alts)
      const ageDays = (Date.now() - interaction.user.createdTimestamp) / 86400000;
      if (ageDays < 7) {
        await interaction.reply({ content: `🚫 حسابك جديد جداً (${Math.floor(ageDays)} يوم). انتظر حتى يكمل 7 أيام.`, ephemeral: true });
        return;
      }
      try {
        await member.roles.add(roleId);
        await markVerified(interaction.user.id, interaction.guildId!);
        await interaction.reply({ content: "✅ تم التحقّق! مرحباً بك.", ephemeral: true });
      } catch {
        await interaction.reply({ content: "🚫 فشل إعطاء الرتبة. تأكد إن البوت رتبته فوق الرتبة المطلوبة.", ephemeral: true });
      }
      return;
    }
    if (interaction.customId === "giveaway_enter") {
      const added = await addGiveawayEntry(interaction.message.id, interaction.user.id);
      if (added) await interaction.reply({ content: "🎉 تم تسجيلك في القرعة! بالتوفيق.", ephemeral: true });
      else await interaction.reply({ content: "✅ أنت مسجّل بالفعل أو القرعة منتهية.", ephemeral: true });
      return;
    }
    if (interaction.customId.startsWith("buy:")) {
      const itemId = interaction.customId.split(":")[1];
      const item = SHOP_ITEMS.find((i) => i.id === itemId);
      if (!item) return;
      const u = await getUser(interaction.user.id, interaction.guildId!);
      if (Number(u.points) < item.price) {
        await interaction.reply({ content: `🚫 ما عندك نقاط كافية. السعر: ${item.price}، رصيدك: ${u.points}`, ephemeral: true });
        return;
      }
      await addPoints(interaction.user.id, interaction.guildId!, -item.price);
      // 10% tax → vault
      const tax = Math.floor(item.price * SHOP_TAX_RATE);
      await addToVault(interaction.guildId!, tax);
      let result = "";
      if (item.id === "shield") {
        await pool.query(
          "UPDATE bot_users SET shield_until = NOW() + INTERVAL '24 hours' WHERE user_id=$1",
          [interaction.user.id]
        );
        result = "🛡️ تم تفعيل درع الحماية لمدة 24 ساعة!";
      } else if (item.id === "freejail") {
        await pool.query("UPDATE bot_users SET jail_until = NULL WHERE user_id=$1", [interaction.user.id]);
        const member = await interaction.guild!.members.fetch(interaction.user.id).catch(() => null);
        if (member?.isCommunicationDisabled()) {
          await member.timeout(null).catch(() => {});
        }
        result = "🔓 خرجت من السجن! استمتع بحريتك.";
      } else if (item.id === "color") {
        const colors = ["#e74c3c", "#3498db", "#2ecc71", "#9b59b6", "#f1c40f", "#e67e22", "#1abc9c"];
        const color = pick(colors);
        await pool.query("UPDATE bot_users SET color = $1 WHERE user_id=$2", [color, interaction.user.id]);
        result = `🎨 لونك المميز الآن: **${color}**`;
      } else if (item.id === "vip") {
        const cfg = await getGuildConfig(interaction.guildId!);
        if (cfg.vip_role_id) {
          const member = await interaction.guild!.members.fetch(interaction.user.id).catch(() => null);
          if (member) await member.roles.add(cfg.vip_role_id).catch(() => {});
          result = "👑 مبروك! حصلت على رتبة VIP الملكية.";
        } else {
          result = "👑 تم الشراء، لكن لم يضبط المسؤول رتبة VIP بعد. تواصل مع الإدارة.";
        }
      }
      await interaction.reply({ content: result, ephemeral: true });
    }
    return;
  }

  // ==================== Panel: StringSelectMenu (navigation) ====================
  if (interaction.isStringSelectMenu() && interaction.customId === "panel:nav") {
    const member = interaction.member as GuildMember | null;
    if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "🚫 ما عندك صلاحية.", ephemeral: true });
      return;
    }
    const category = interaction.values[0];
    const guildId = interaction.guildId!;
    const cfg = await fetchPanelConfig(guildId);
    let payload: object;
    if (category === "main") {
      payload = buildMainPanel(cfg, interaction.guild!.name, interaction.guild!.iconURL());
    } else if (category === "channels") {
      payload = buildChannelsPanel(cfg);
    } else if (category === "roles") {
      payload = buildRolesPanel(cfg);
    } else if (category === "protection") {
      payload = buildProtectionPanel(cfg);
    } else if (category === "economy") {
      const market = await getBlackMarket(guildId);
      const vault = await getVault(guildId);
      const open = market?.open_until ? new Date(market.open_until) > new Date() : false;
      const openUntil = market?.open_until ? new Date(market.open_until) : null;
      payload = buildEconomyPanel(open, openUntil, Number(vault?.balance ?? 0));
    } else if (category === "welcome") {
      payload = buildWelcomePanel(cfg);
    } else {
      payload = buildMainPanel(cfg, interaction.guild!.name, interaction.guild!.iconURL());
    }
    await interaction.update(payload as any);
    return;
  }

  // ==================== Panel: ChannelSelectMenu ====================
  if (interaction.isChannelSelectMenu() && interaction.customId.startsWith("panel:ch:")) {
    const member = interaction.member as GuildMember | null;
    if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "🚫 ما عندك صلاحية.", ephemeral: true });
      return;
    }
    const sub = interaction.customId.split(":")[2] as string;
    const fieldMap: Record<string, "log_channel_id" | "welcome_channel_id" | "athkar_channel_id" | "ticket_category_id"> = {
      log: "log_channel_id",
      welcome: "welcome_channel_id",
      athkar: "athkar_channel_id",
      tickets: "ticket_category_id",
    };
    const field = fieldMap[sub];
    if (field) {
      const channelId = interaction.values[0];
      await setGuildConfig(interaction.guildId!, field, channelId);
    }
    const cfg = await fetchPanelConfig(interaction.guildId!);
    await interaction.update(buildChannelsPanel(cfg) as any);
    return;
  }

  // ==================== Panel: RoleSelectMenu ====================
  if (interaction.isRoleSelectMenu() && interaction.customId.startsWith("panel:role:")) {
    const member = interaction.member as GuildMember | null;
    if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "🚫 ما عندك صلاحية.", ephemeral: true });
      return;
    }
    const sub = interaction.customId.split(":")[2] as string;
    const roleId = interaction.values[0];
    if (sub === "vip") {
      await setGuildConfig(interaction.guildId!, "vip_role_id", roleId);
    } else if (sub === "verify") {
      await pool.query(
        `INSERT INTO bot_guild_config (guild_id, verify_role_id) VALUES ($1, $2)
         ON CONFLICT (guild_id) DO UPDATE SET verify_role_id=$2`,
        [interaction.guildId!, roleId]
      );
    }
    const cfg = await fetchPanelConfig(interaction.guildId!);
    await interaction.update(buildRolesPanel(cfg) as any);
    return;
  }

  // ==================== Panel: Buttons ====================
  if (interaction.isButton() && interaction.customId.startsWith("panel:")) {
    const member = interaction.member as GuildMember | null;
    if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "🚫 ما عندك صلاحية.", ephemeral: true });
      return;
    }
    const action = interaction.customId.replace("panel:", "");
    const guildId = interaction.guildId!;

    if (action === "back" || action === "btn:refresh") {
      const cfg = await fetchPanelConfig(guildId);
      await interaction.update(buildMainPanel(cfg, interaction.guild!.name, interaction.guild!.iconURL()) as any);
      return;
    }

    if (action === "btn:antispam_on" || action === "btn:antispam_off") {
      const enabled = action === "btn:antispam_on";
      await pool.query(
        `INSERT INTO bot_guild_config (guild_id, antispam_enabled) VALUES ($1, $2)
         ON CONFLICT (guild_id) DO UPDATE SET antispam_enabled=$2`,
        [guildId, enabled]
      );
      const cfg = await fetchPanelConfig(guildId);
      await interaction.update(buildProtectionPanel(cfg) as any);
      return;
    }

    if (action === "btn:send_verify") {
      const cfg = await fetchPanelConfig(guildId);
      if (!cfg.verify_role_id) {
        await interaction.reply({ content: "🚫 اضبط رتبة التحقق أولاً.", ephemeral: true });
        return;
      }
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("✅ تحقّق من حسابك")
        .setDescription("اضغط الزر أدناه لتأكيد أنك لست بوت والحصول على صلاحية الدخول للسيرفر.");
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("verify").setLabel("✅ تحقّق").setStyle(ButtonStyle.Success)
      );
      await (interaction.channel as TextChannel).send({ embeds: [embed], components: [row] }).catch(() => {});
      await interaction.reply({ content: "📤 تم إرسال لوحة التحقق.", ephemeral: true });
      return;
    }

    if (action === "btn:market_1h" || action === "btn:market_3h") {
      const hours = action === "btn:market_1h" ? 1 : 3;
      const until = new Date(Date.now() + hours * 3_600_000);
      await openBlackMarket(guildId, until);
      const cfg = await fetchPanelConfig(guildId);
      const vault = await getVault(guildId);
      await interaction.update(buildEconomyPanel(true, until, Number(vault?.balance ?? 0)) as any);
      return;
    }

    if (action === "btn:market_close") {
      await pool.query(
        "UPDATE bot_guild_config SET black_market_until = NULL WHERE guild_id=$1",
        [guildId]
      );
      const vault = await getVault(guildId);
      await interaction.update(buildEconomyPanel(false, null, Number(vault?.balance ?? 0)) as any);
      return;
    }

    if (action === "btn:reset_welcome") {
      await pool.query("UPDATE bot_guild_config SET welcome_msg=NULL WHERE guild_id=$1", [guildId]);
      const cfg = await fetchPanelConfig(guildId);
      await interaction.update(buildWelcomePanel(cfg) as any);
      return;
    }

    if (action === "btn:reset_leave") {
      await pool.query("UPDATE bot_guild_config SET leave_msg=NULL WHERE guild_id=$1", [guildId]);
      const cfg = await fetchPanelConfig(guildId);
      await interaction.update(buildWelcomePanel(cfg) as any);
      return;
    }

    return;
  }

  if (!interaction.isChatInputCommand()) return;
  const sub = interaction.commandName;
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "هذا الأمر داخل السيرفر فقط.", ephemeral: true });
    return;
  }

  try {
    switch (sub) {
      // ============ ADMIN ============
      case "قفل": {
        if (!(await checkMod(interaction, PermissionFlagsBits.ManageChannels))) return;
        const ch = interaction.channel as TextChannel;
        await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLOR_DANGER).setDescription("🔒 تم إغلاق الشات.")] });
        const log = new EmbedBuilder().setColor(COLOR_DANGER).setTitle("🔒 قفل القناة")
          .addFields({ name: "المسؤول", value: `<@${interaction.user.id}>` }, { name: "القناة", value: `<#${ch.id}>` }).setTimestamp();
        await sendLog(client, guild.id, log);
        return;
      }
      case "فتح": {
        if (!(await checkMod(interaction, PermissionFlagsBits.ManageChannels))) return;
        const ch = interaction.channel as TextChannel;
        await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLOR_SUCCESS).setDescription("🔓 تم فتح الشات.")] });
        return;
      }
      case "كنس": {
        if (!(await checkMod(interaction, PermissionFlagsBits.ManageMessages))) return;
        await interaction.reply("🧹 كم رسالة تريد حذفها؟ اكتب الرقم في الشات (1-100) خلال 30 ثانية.");
        const key = `purge:${interaction.channelId}:${interaction.user.id}`;
        setPending(key, { type: "purge_count", channelId: interaction.channelId, userId: interaction.user.id, expiresAt: Date.now() + 30_000 });
        return;
      }
      case "بشويش": {
        if (!(await checkMod(interaction, PermissionFlagsBits.ManageChannels))) return;
        const seconds = interaction.options.getInteger("ثواني", true);
        const ch = interaction.channel as TextChannel;
        await ch.setRateLimitPerUser(seconds);
        await interaction.reply(`🐢 تم تفعيل وضع التباطؤ (${seconds} ثانية) في هذه القناة.`);
        return;
      }
      case "براا": {
        if (!(await checkMod(interaction, PermissionFlagsBits.KickMembers))) return;
        const target = interaction.options.getUser("العضو", true);
        const reason = interaction.options.getString("السبب") ?? "بدون سبب";
        const member = await guild.members.fetch(target.id).catch(() => null);
        if (!member) return interaction.reply({ content: "العضو مش موجود.", ephemeral: true });
        await member.kick(reason);
        await interaction.reply(`👋 تم طرد ${target} من السيرفر. السبب: ${reason}`);
        const log = new EmbedBuilder().setColor(COLOR_DANGER).setTitle("👋 طرد")
          .addFields({ name: "المطرود", value: `<@${target.id}>`, inline: true }, { name: "بواسطة", value: `<@${interaction.user.id}>`, inline: true }, { name: "السبب", value: reason }).setTimestamp();
        await sendLog(client, guild.id, log);
        return;
      }
      case "اصبر": {
        if (!(await checkMod(interaction, PermissionFlagsBits.ModerateMembers))) return;
        const target = interaction.options.getUser("العضو", true);
        const minutes = interaction.options.getInteger("دقائق", true);
        const reason = interaction.options.getString("السبب") ?? "بدون سبب";
        const member = await guild.members.fetch(target.id).catch(() => null);
        if (!member) return interaction.reply({ content: "العضو مش موجود.", ephemeral: true });
        await member.timeout(minutes * 60 * 1000, reason);
        await interaction.reply(`🤐 تم إسكات ${target} لمدة ${minutes} دقيقة. السبب: ${reason}`);
        return;
      }
      case "تكلم": {
        if (!(await checkMod(interaction, PermissionFlagsBits.ModerateMembers))) return;
        const target = interaction.options.getUser("العضو", true);
        const member = await guild.members.fetch(target.id).catch(() => null);
        if (!member) return interaction.reply({ content: "العضو مش موجود.", ephemeral: true });
        await member.timeout(null);
        await interaction.reply(`🗣️ تم فك الإسكات عن ${target}. تكلم بحرية!`);
        return;
      }
      case "حظر": {
        if (!(await checkMod(interaction, PermissionFlagsBits.BanMembers))) return;
        const target = interaction.options.getUser("العضو", true);
        const reason = interaction.options.getString("السبب") ?? "بدون سبب";
        await guild.members.ban(target.id, { reason });
        await interaction.reply(`🔨 تم حظر ${target} نهائياً. السبب: ${reason}`);
        const log = new EmbedBuilder().setColor(COLOR_DANGER).setTitle("🔨 حظر")
          .addFields({ name: "المحظور", value: `<@${target.id}>`, inline: true }, { name: "بواسطة", value: `<@${interaction.user.id}>`, inline: true }, { name: "السبب", value: reason }).setTimestamp();
        await sendLog(client, guild.id, log);
        return;
      }
      case "فك_الحظر": {
        if (!(await checkMod(interaction, PermissionFlagsBits.BanMembers))) return;
        const userId = interaction.options.getString("الايدي", true);
        await guild.members.unban(userId).catch(() => null);
        await interaction.reply(`✅ تم فك الحظر عن <@${userId}>.`);
        return;
      }
      case "بلاغ": {
        const target = interaction.options.getUser("العضو", true);
        const reason = interaction.options.getString("السبب", true);
        await pool.query(
          "INSERT INTO bot_reports (guild_id, reporter_id, target_id, reason) VALUES ($1, $2, $3, $4)",
          [guild.id, interaction.user.id, target.id, reason]
        );
        await interaction.reply({ content: "📨 تم إرسال البلاغ للإدارة بسرية تامة. شكراً لمساعدتك في حماية السيرفر.", ephemeral: true });
        const log = new EmbedBuilder().setColor(COLOR_DANGER).setTitle("🚨 بلاغ جديد")
          .addFields({ name: "المُبلِغ", value: `<@${interaction.user.id}>`, inline: true }, { name: "ضد", value: `<@${target.id}>`, inline: true }, { name: "السبب", value: reason }).setTimestamp();
        await sendLog(client, guild.id, log);
        return;
      }

      // ============ AI ============
      case "ai": {
        const prompt = interaction.options.getString("السؤال", true);
        await interaction.deferReply();
        const answer = await chatAI(prompt);
        const embed = new EmbedBuilder().setColor(COLOR_INFO).setAuthor({ name: `سؤال من ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
          .addFields({ name: "❓ السؤال", value: prompt.slice(0, 1000) }, { name: "🤖 الإجابة", value: answer.slice(0, 4000) }).setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        return;
      }
      case "تخيل": {
        const prompt = interaction.options.getString("الوصف", true);
        await interaction.deferReply();
        try {
          const buf = await generateImage(prompt);
          const file = new AttachmentBuilder(buf, { name: "image.png" });
          const embed = new EmbedBuilder().setColor(COLOR_PRIMARY).setTitle("🎨 تخيلي").setDescription(prompt.slice(0, 500)).setImage("attachment://image.png");
          await interaction.editReply({ embeds: [embed], files: [file] });
        } catch (e) {
          console.error("imagine error", e);
          await interaction.editReply("⚠️ ما قدرت أولّد الصورة الآن. جرب وصف مختلف.");
        }
        return;
      }

      // ============ ECONOMY ============
      case "راتب": {
        const u = await getUser(interaction.user.id, guild.id);
        if (u.daily_at && Date.now() - new Date(u.daily_at).getTime() < 24 * 3600 * 1000) {
          const next = new Date(u.daily_at).getTime() + 24 * 3600 * 1000;
          const remaining = Math.ceil((next - Date.now()) / (3600 * 1000));
          return interaction.reply({ content: `⏳ راتبك جاهز بعد ~${remaining} ساعة.`, ephemeral: true });
        }
        const amount = 200 + Math.floor(Math.random() * 300);
        await addPoints(interaction.user.id, guild.id, amount);
        await pool.query("UPDATE bot_users SET daily_at = NOW() WHERE user_id=$1", [interaction.user.id]);
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLOR_SUCCESS).setTitle("💰 راتبك اليومي").setDescription(`استلمت **${amount}** نقطة! تعال بكرة لراتب جديد.`)] });
        return;
      }
      case "تحويل": {
        const target = interaction.options.getUser("العضو", true);
        const amount = interaction.options.getInteger("المبلغ", true);
        if (target.id === interaction.user.id) return interaction.reply({ content: "ما تقدر تحول لنفسك.", ephemeral: true });
        if (target.bot) return interaction.reply({ content: "البوتات ما تحتاج فلوس.", ephemeral: true });
        if (amount <= 0) return interaction.reply({ content: "المبلغ لازم يكون موجب.", ephemeral: true });
        const u = await getUser(interaction.user.id, guild.id);
        if (Number(u.points) < amount) return interaction.reply({ content: `🚫 رصيدك ${u.points} فقط.`, ephemeral: true });
        await addPoints(interaction.user.id, guild.id, -amount);
        await addPoints(target.id, guild.id, amount);
        await interaction.reply(`💸 تم تحويل **${amount}** نقطة من ${interaction.user} إلى ${target}.`);
        return;
      }
      case "متجر": {
        const embed = new EmbedBuilder().setColor(COLOR_PRIMARY).setTitle("🛒 متجر السيرفر")
          .setDescription("اختر اللي يعجبك من القائمة. *10% من قيمة كل عملية شراء تذهب إلى خزنة السيرفر 🏛️*")
          .addFields(
            ...SHOP_ITEMS.map((i) => ({ name: `${i.name} — ${i.price} 💰`, value: i.desc })),
            { name: "🎨 خلفيات بطاقة /حسابي", value: BACKGROUNDS.map((b) => `${b.name} — **${b.price}** 💰`).join("\n") }
          );
        const rows: ActionRowBuilder<ButtonBuilder>[] = [];
        // Shop items
        for (let i = 0; i < SHOP_ITEMS.length; i += 5) {
          const row = new ActionRowBuilder<ButtonBuilder>();
          for (const item of SHOP_ITEMS.slice(i, i + 5)) {
            row.addComponents(new ButtonBuilder().setCustomId(`buy:${item.id}`).setLabel(`شراء ${item.name}`).setStyle(ButtonStyle.Primary));
          }
          rows.push(row);
        }
        // Background buttons (max 5 rows total — we have 1 shop row + up to 4 bg rows)
        for (let i = 0; i < BACKGROUNDS.length && rows.length < 5; i += 5) {
          const row = new ActionRowBuilder<ButtonBuilder>();
          for (const bg of BACKGROUNDS.slice(i, i + 5)) {
            row.addComponents(new ButtonBuilder().setCustomId(`bg:${bg.id}`).setLabel(bg.name).setStyle(ButtonStyle.Secondary));
          }
          rows.push(row);
        }
        await interaction.reply({ embeds: [embed], components: rows });
        return;
      }
      case "سرقة": {
        const target = interaction.options.getUser("العضو", true);
        if (target.id === interaction.user.id) return interaction.reply({ content: "ما تقدر تسرق نفسك يا ذكي.", ephemeral: true });
        if (target.bot) return interaction.reply({ content: "البوتات جيوبها فاضية.", ephemeral: true });
        const me = await getUser(interaction.user.id, guild.id);
        if (me.steal_at && Date.now() - new Date(me.steal_at).getTime() < 3600 * 1000) {
          const remaining = Math.ceil((3600 * 1000 - (Date.now() - new Date(me.steal_at).getTime())) / 60000);
          return interaction.reply({ content: `⏳ ارتاح يا لص، جرب بعد ${remaining} دقيقة.`, ephemeral: true });
        }
        if (me.jail_until && new Date(me.jail_until).getTime() > Date.now()) {
          return interaction.reply({ content: "🚔 أنت في السجن! اشترِ بطاقة خروج من /متجر.", ephemeral: true });
        }
        const victim = await getUser(target.id, guild.id);
        if (victim.shield_until && new Date(victim.shield_until).getTime() > Date.now()) {
          await pool.query("UPDATE bot_users SET steal_at=NOW() WHERE user_id=$1", [interaction.user.id]);
          return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLOR_INFO).setDescription(pick(SHIELD_BLOCK_LINES))] });
        }
        if (Number(victim.points) < 100) {
          return interaction.reply({ content: `🪙 ${target} جيبه فاضي، ما يستاهل العناء.`, ephemeral: true });
        }
        await pool.query("UPDATE bot_users SET steal_at=NOW() WHERE user_id=$1", [interaction.user.id]);
        const successChance = me.hack_next ? 0.8 : 0.45;
        const usedHack = me.hack_next;
        if (usedHack) {
          await pool.query("UPDATE bot_users SET hack_next=FALSE WHERE user_id=$1", [interaction.user.id]);
        }
        const success = Math.random() < successChance;
        const actorMention = await maskedActor(guild.id, interaction.user.id);
        if (success) {
          const stolen = Math.floor(Number(victim.points) * (0.05 + Math.random() * 0.15));
          await addPoints(target.id, guild.id, -stolen);
          await addPoints(interaction.user.id, guild.id, stolen);
          await pool.query("UPDATE bot_users SET steal_streak = steal_streak + 1 WHERE user_id=$1", [interaction.user.id]);
          const embed = new EmbedBuilder().setColor(COLOR_SUCCESS).setTitle("🦹‍♂️ عملية سطو ناجحة.. عفواً لقد تم نتفه!")
            .setDescription(`${interaction.user} نتف **${stolen}** نقطة من ${target}!${usedHack ? "\n💻 *جهاز الاختراق فعّال*" : ""}\n\n${pick(STEAL_SUCCESS_LINES)}`);
          await interaction.reply({ embeds: [embed] });
          const log = new EmbedBuilder().setColor(COLOR_PRIMARY).setTitle("💸 سرقة ناجحة").addFields(
            { name: "السارق", value: actorMention, inline: true },
            { name: "الضحية", value: `<@${target.id}>`, inline: true },
            { name: "المبلغ", value: `${stolen}`, inline: true }
          ).setTimestamp();
          await sendLog(client, guild.id, log);
        } else {
          const fine = Math.min(500, Math.floor(Number(me.points)));
          await addPoints(interaction.user.id, guild.id, -fine);
          await addToVault(guild.id, fine);
          // Check jail key inventory
          const usedKey = me.jail_keys > 0;
          let jailMsg = "";
          if (usedKey) {
            await pool.query("UPDATE bot_users SET jail_keys = jail_keys - 1, steal_streak=0 WHERE user_id=$1", [interaction.user.id]);
            jailMsg = "🗝️ استخدمت **مفتاح سجن** فهربت قبل ما يوصلوا لك!";
          } else {
            await pool.query("UPDATE bot_users SET jail_until = NOW() + INTERVAL '5 minutes', steal_streak=0 WHERE user_id=$1", [interaction.user.id]);
            // Update jail counter (today)
            await pool.query(
              `UPDATE bot_users SET
                 jail_count_today = CASE WHEN jail_count_date = CURRENT_DATE THEN jail_count_today + 1 ELSE 1 END,
                 jail_count_date = CURRENT_DATE
               WHERE user_id=$1`,
              [interaction.user.id]
            );
            const member = await guild.members.fetch(interaction.user.id).catch(() => null);
            await member?.timeout(5 * 60 * 1000, "محاولة سرقة فاشلة").catch(() => {});
            jailMsg = "سجن 5 دقائق.";
          }
          const embed = new EmbedBuilder().setColor(COLOR_DANGER).setTitle("🚨 تم القبض عليك متلبساً!")
            .setDescription(`${interaction.user} حاول يسرق ${target}!\n\nالعقوبة: **-${fine}** نقطة (راحت للخزنة 🏛️) + ${jailMsg}\n\n${pick(STEAL_FAIL_LINES)}`);
          await interaction.reply({ embeds: [embed] });
          const log = new EmbedBuilder().setColor(COLOR_DANGER).setTitle("🚔 سرقة فاشلة").addFields(
            { name: "اللص", value: actorMention, inline: true },
            { name: "الضحية", value: `<@${target.id}>`, inline: true },
            { name: "الغرامة → الخزنة", value: `${fine}`, inline: true }
          ).setTimestamp();
          await sendLog(client, guild.id, log);
        }
        return;
      }

      // ============ BLACK MARKET & VAULT ============
      case "السوق_السوداء": {
        const open = await isBlackMarketOpen(guild.id);
        const bm = await getBlackMarket(guild.id);
        if (!open) {
          const embed = new EmbedBuilder().setColor(0x2c2f33).setTitle("🕵️ السوق السوداء")
            .setDescription("🚫 الأبواب مغلقة الآن.\n\nالسوق يفتح فجأة لمدة **ساعة واحدة** في وقت عشوائي يومياً. خلّي عينك مفتوحة على قناة السجلات!");
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        const until = new Date(bm.open_until!).getTime();
        const embed = new EmbedBuilder().setColor(0x2c2f33).setTitle("🕵️ السوق السوداء — مفتوح!")
          .setDescription(`الباب مفتوح حتى <t:${Math.floor(until / 1000)}:t> (<t:${Math.floor(until / 1000)}:R>)\n\n*ملاحظة: 10% من كل عملية شراء تذهب إلى خزنة السيرفر 🏛️*`)
          .addFields(BLACK_MARKET_ITEMS.map((i) => ({ name: `${i.name} — ${i.price} 💰`, value: i.desc })));
        const rows: ActionRowBuilder<ButtonBuilder>[] = [];
        const buyable = BLACK_MARKET_ITEMS.filter((i) => i.id !== "bomb");
        const row = new ActionRowBuilder<ButtonBuilder>();
        for (const item of buyable) {
          row.addComponents(new ButtonBuilder().setCustomId(`bm:${item.id}`).setLabel(`شراء ${item.name}`).setStyle(ButtonStyle.Danger));
        }
        rows.push(row);
        await interaction.reply({ embeds: [embed], components: rows });
        return;
      }
      case "فتح_السوق": {
        if (!(await checkMod(interaction, PermissionFlagsBits.ManageGuild))) return;
        const until = await openBlackMarket(guild.id, 60 * 60 * 1000);
        await interaction.reply({ content: `✅ تم فتح السوق السوداء حتى <t:${Math.floor(until.getTime() / 1000)}:t>.`, ephemeral: true });
        await announceBlackMarketOpen(guild.id, until);
        return;
      }
      case "قنبلة": {
        const target = interaction.options.getUser("العضو", true);
        if (target.id === interaction.user.id) return interaction.reply({ content: "ما تقدر تفجر نفسك!", ephemeral: true });
        if (target.bot) return interaction.reply({ content: "ما تنفجر القنبلة على البوتات.", ephemeral: true });
        if (!(await isBlackMarketOpen(guild.id))) {
          return interaction.reply({ content: "🚫 القنبلة متوفرة فقط في وقت السوق السوداء.", ephemeral: true });
        }
        const me = await getUser(interaction.user.id, guild.id);
        const cost = 10000;
        if (Number(me.points) < cost) {
          return interaction.reply({ content: `🚫 سعر القنبلة ${cost} نقطة. رصيدك: ${me.points}.`, ephemeral: true });
        }
        await addPoints(interaction.user.id, guild.id, -cost);
        const tax = Math.floor(cost * SHOP_TAX_RATE);
        await addToVault(guild.id, tax);
        const victim = await getUser(target.id, guild.id);
        const bombLoss = Math.floor(Number(victim.points) * 0.3);
        if (bombLoss > 0) await addPoints(target.id, guild.id, -bombLoss);
        const actorMention = await maskedActor(guild.id, interaction.user.id);
        const embed = new EmbedBuilder().setColor(COLOR_DANGER).setTitle("💥 انفجرت قنبلة النقاط!")
          .setDescription(`💣 ${interaction.user} فجّر قنبلة على ${target}!\n\n📉 خسر ${target} **${bombLoss.toLocaleString("ar")}** نقطة (30% من رصيده)!`);
        await interaction.reply({ embeds: [embed] });
        const log = new EmbedBuilder().setColor(COLOR_DANGER).setTitle("💣 قنبلة نقاط").addFields(
          { name: "المهاجم", value: actorMention, inline: true },
          { name: "الضحية", value: `<@${target.id}>`, inline: true },
          { name: "الخسارة", value: `${bombLoss}`, inline: true }
        ).setTimestamp();
        await sendLog(client, guild.id, log);
        return;
      }
      case "الخزنة": {
        const v = await getVault(guild.id);
        const lastDraw = v.last_friday_draw
          ? `<t:${Math.floor(new Date(v.last_friday_draw).getTime() / 1000)}:R>`
          : "لم يتم بعد";
        const embed = new EmbedBuilder().setColor(0xf1c40f).setTitle("🏛️ خزنة السيرفر")
          .setDescription(`💰 الرصيد الحالي: **${v.balance.toLocaleString("ar")}** نقطة\n\n` +
            `🎰 سحب الجمعة الأسبوعي يوزع 50% من الخزنة على عضو محظوظ من المتفاعلين.\n\n` +
            `📅 آخر سحب: ${lastDraw}`);
        await interaction.reply({ embeds: [embed] });
        return;
      }
      case "البيست": {
        const r1 = await pool.query<{ user_id: string; points: string }>(
          "SELECT user_id, points FROM bot_users WHERE guild_id=$1 ORDER BY points DESC LIMIT 10",
          [guild.id]
        );
        const richest = r1.rows.map((x, i) => `**${i + 1}.** <@${x.user_id}> — ${x.points} 💰`).join("\n") || "لا أحد بعد.";
        const embed = new EmbedBuilder().setColor(COLOR_PRIMARY).setTitle("🏆 أغنى الأعضاء")
          .addFields({ name: "💰 الترتيب بالنقاط", value: richest });
        await interaction.reply({ embeds: [embed] });
        return;
      }

      // ============ INFO ============
      case "حسابي": {
        const target = interaction.options.getUser("العضو") ?? interaction.user;
        const member = await guild.members.fetch(target.id).catch(() => null);
        if (!member) return interaction.reply({ content: "العضو مش في السيرفر.", ephemeral: true });
        const u = await getUser(target.id, guild.id);
        const title = computeTitle(u);
        const roles = member.roles.cache.filter((r) => r.id !== guild.id).map((r) => `<@&${r.id}>`).slice(0, 10).join(" ") || "لا يوجد";
        const bg = u.background ? BACKGROUNDS.find((b) => b.id === u.background) : null;
        const embed = new EmbedBuilder().setColor(title?.color ?? (u.color ? parseInt(u.color.replace("#", ""), 16) : COLOR_PRIMARY))
          .setAuthor({ name: target.username, iconURL: target.displayAvatarURL() })
          .setThumbnail(target.displayAvatarURL({ size: 256 }))
          .setTitle(`🪪 بطاقة الهوية — ${formatTitle(title) || "*بدون لقب*"}`);
        if (bg) embed.setImage(bg.url);
        embed
          .addFields(
            { name: "🆔 الايدي", value: target.id, inline: true },
            { name: "📅 انضم للسيرفر", value: `<t:${Math.floor((member.joinedTimestamp ?? 0) / 1000)}:R>`, inline: true },
            { name: "📅 صنع الحساب", value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R>`, inline: true },
            { name: "💰 النقاط", value: `${u.points}`, inline: true },
            { name: "🎙️ وقت الصوت", value: fmtMinutes(Number(u.voice_seconds)), inline: true },
            { name: "🎨 اللون", value: u.color || "افتراضي", inline: true },
            { name: "📜 الرتب", value: roles }
          );
        await interaction.reply({ embeds: [embed] });
        return;
      }
      case "بايو": {
        const target = interaction.options.getUser("العضو") ?? interaction.user;
        const full = await client.users.fetch(target.id, { force: true });
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLOR_INFO).setAuthor({ name: target.username, iconURL: target.displayAvatarURL() }).setTitle("📝 الـ Bio").setDescription(full.toString() ? `<@${target.id}>` : "—").addFields({ name: "Bio", value: (full as { bio?: string }).bio || "ما عندو bio." })] });
        return;
      }
      case "صورة": {
        const target = interaction.options.getUser("العضو") ?? interaction.user;
        const url = target.displayAvatarURL({ size: 4096, extension: "png" });
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLOR_INFO).setTitle(`🖼️ صورة ${target.username}`).setImage(url).setURL(url)] });
        return;
      }
      case "السيرفر": {
        const owner = await guild.fetchOwner().catch(() => null);
        const totalMembers = guild.memberCount;
        const bots = guild.members.cache.filter((m) => m.user.bot).size;
        const humans = totalMembers - bots;
        const embed = new EmbedBuilder().setColor(COLOR_PRIMARY).setTitle(`📊 معلومات ${guild.name}`)
          .setThumbnail(guild.iconURL({ size: 256 }) || null)
          .addFields(
            { name: "👥 الأعضاء", value: `${humans}`, inline: true },
            { name: "🤖 البوتات", value: `${bots}`, inline: true },
            { name: "📦 الإجمالي", value: `${totalMembers}`, inline: true },
            { name: "👑 المالك", value: owner ? `<@${owner.id}>` : "—", inline: true },
            { name: "📅 التأسيس", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
            { name: "💬 القنوات", value: `${guild.channels.cache.size}`, inline: true },
            { name: "🎭 الرتب", value: `${guild.roles.cache.size}`, inline: true }
          );
        await interaction.reply({ embeds: [embed] });
        return;
      }
      case "تذكرة": {
        const reason = interaction.options.getString("السبب") ?? "بدون سبب محدد";
        const cfg = await getGuildConfig(guild.id);
        const everyone = guild.roles.everyone;
        const channel = await guild.channels.create({
          name: `ticket-${interaction.user.username}`.slice(0, 90),
          type: ChannelType.GuildText,
          parent: cfg.ticket_category_id || undefined,
          permissionOverwrites: [
            { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          ],
        });
        await pool.query("INSERT INTO bot_tickets (channel_id, guild_id, user_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [channel.id, guild.id, interaction.user.id]);
        await (channel as TextChannel).send({
          content: `${interaction.user}`,
          embeds: [new EmbedBuilder().setColor(COLOR_INFO).setTitle("🎫 تذكرة دعم فني").setDescription(`السبب: ${reason}\n\nسوف تتواصل معك الإدارة قريباً. اكتب تفاصيلك هنا.`)],
        });
        await interaction.reply({ content: `✅ تم إنشاء تذكرتك: ${channel}`, ephemeral: true });
        return;
      }

      // ============ MUSIC (via Lavalink) ============
      case "play": {
        const member = await guild.members.fetch(interaction.user.id);
        if (!member.voice.channel) return interaction.reply({ content: "🎤 ادخل روم صوتي أولاً.", ephemeral: true });
        const query = interaction.options.getString("الطلب", true);
        await interaction.deferReply();
        try {
          const r = await searchAndQueue(member, interaction.channel, query);
          if (r.isPlaylist) {
            await interaction.editReply(`✅ أُضيفت **${r.addedCount}** أغنية من القائمة.`);
          } else {
            await interaction.editReply(`🎶 تمت إضافة: **${r.firstTitle}**`);
          }
        } catch (e: any) {
          await interaction.editReply(`🚫 فشل: ${e?.message || "خطأ غير معروف"}`);
        }
        return;
      }
      case "skip": {
        const player = getPlayer(guild.id);
        if (!player || !player.queue.current) return interaction.reply({ content: "ما في تشغيل حالياً.", ephemeral: true });
        await player.skip();
        await interaction.reply("⏭️ تم التخطي.");
        return;
      }
      case "stop": {
        const player = getPlayer(guild.id);
        if (!player) return interaction.reply({ content: "ما في تشغيل حالياً.", ephemeral: true });
        await player.destroy();
        await interaction.reply("⏹️ توقفت ومغادرت الروم.");
        return;
      }
      case "queue":
      case "قائمة_الانتظار": {
        const player = getPlayer(guild.id);
        if (!player) return interaction.reply({ content: "ما في تشغيل حالياً.", ephemeral: true });
        const cur = player.queue.current;
        const upcoming = player.queue.tracks.slice(0, 20);
        const reqName = (t: any) => (t.requester?.username ? ` — طلبها <@${t.requester.id}>` : "");
        const lines = [
          cur ? `▶️ **يشغّل الآن:** ${cur.info.title} — ${formatDuration(cur.info.duration)}${reqName(cur)}` : "*لا يوجد*",
          "",
          ...upcoming.map((t, i) => `**${i + 1}.** ${t.info.title} — ${formatDuration(t.info.duration)}${reqName(t)}`),
        ];
        if (player.queue.tracks.length > 20) lines.push(`\n...و **${player.queue.tracks.length - 20}** أغنية إضافية`);
        if (!upcoming.length) lines.push("📭 لا يوجد أغانٍ في الانتظار.");
        const embed = new EmbedBuilder().setColor(COLOR_INFO).setTitle("📜 قائمة الانتظار").setDescription(lines.join("\n"))
          .setFooter({ text: `🔁 التكرار: ${player.repeatMode} • 🔊 الصوت: ${player.volume}% • المجموع: ${player.queue.tracks.length}` });
        const components: ActionRowBuilder<ButtonBuilder>[] = [];
        if (player.queue.tracks.length >= 2) {
          components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("music:shuffle").setLabel("🔀 اخلِط").setStyle(ButtonStyle.Primary)
          ));
        }
        await interaction.reply({ embeds: [embed], components });
        return;
      }
      case "loop": {
        const player = getPlayer(guild.id);
        if (!player) return interaction.reply({ content: "ما في تشغيل حالياً.", ephemeral: true });
        const next = player.repeatMode === "off" ? "track" : player.repeatMode === "track" ? "queue" : "off";
        await player.setRepeatMode(next as any);
        const labels: Record<string, string> = { off: "➡️ بدون تكرار", track: "🔂 تكرار الأغنية", queue: "🔁 تكرار القائمة" };
        await interaction.reply(labels[next]);
        return;
      }
      case "volume": {
        const player = getPlayer(guild.id);
        if (!player) return interaction.reply({ content: "ما في تشغيل حالياً.", ephemeral: true });
        const lvl = interaction.options.getInteger("المستوى", true);
        await player.setVolume(lvl);
        await interaction.reply(`🔊 الصوت الآن: **${lvl}%**`);
        return;
      }

      // ============ Anti-spam / Verification ============
      case "antispam": {
        if (!(await checkMod(interaction, PermissionFlagsBits.ManageGuild))) return;
        const state = interaction.options.getString("الحالة", true);
        await pool.query(
          `INSERT INTO bot_guild_config (guild_id, antispam_enabled) VALUES ($1, $2)
           ON CONFLICT (guild_id) DO UPDATE SET antispam_enabled=$2`,
          [guild.id, state === "on"]
        );
        await interaction.reply(state === "on" ? "🛡️ تم تفعيل منع الروابط." : "🔓 تم إيقاف منع الروابط.");
        return;
      }
      case "verify_setup": {
        if (!(await checkMod(interaction, PermissionFlagsBits.ManageGuild))) return;
        const role = interaction.options.getRole("الرتبة", true);
        const ch = interaction.options.getChannel("القناة", true);
        await pool.query(
          `INSERT INTO bot_guild_config (guild_id, verify_role_id, verify_channel_id) VALUES ($1, $2, $3)
           ON CONFLICT (guild_id) DO UPDATE SET verify_role_id=$2, verify_channel_id=$3`,
          [guild.id, role.id, ch.id]
        );
        await interaction.reply(`✅ تم الإعداد. الرتبة: <@&${role.id}> — القناة: <#${ch.id}>\nاستخدم \`/verify_panel\` في القناة لإرسال زر التحقق.`);
        return;
      }
      case "verify_panel": {
        if (!(await checkMod(interaction, PermissionFlagsBits.ManageGuild))) return;
        const cfg = await getGuildConfig(guild.id);
        if (!(cfg as any).verify_role_id) return interaction.reply({ content: "🚫 سوّ الإعداد أولاً بـ `/verify_setup`.", ephemeral: true });
        const embed = new EmbedBuilder().setColor(COLOR_SUCCESS).setTitle("✅ تحقّق من حسابك")
          .setDescription("اضغط الزر أدناه لتأكيد أنك لست بوت والحصول على صلاحية الدخول للسيرفر.");
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId("verify").setLabel("✅ تحقّق").setStyle(ButtonStyle.Success)
        );
        await (interaction.channel as TextChannel).send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: "📤 تم إرسال اللوحة.", ephemeral: true });
        return;
      }

      // ============ Welcome customization ============
      case "set_welcome": {
        if (!(await checkMod(interaction, PermissionFlagsBits.ManageGuild))) return;
        const text = interaction.options.getString("النص", true);
        const img = interaction.options.getString("الصورة");
        await pool.query(
          `INSERT INTO bot_guild_config (guild_id, welcome_msg, welcome_image) VALUES ($1, $2, $3)
           ON CONFLICT (guild_id) DO UPDATE SET welcome_msg=$2, welcome_image=COALESCE($3, bot_guild_config.welcome_image)`,
          [guild.id, text, img]
        );
        await interaction.reply("✅ تم حفظ رسالة الترحيب الجديدة.");
        return;
      }
      case "set_leave": {
        if (!(await checkMod(interaction, PermissionFlagsBits.ManageGuild))) return;
        const text = interaction.options.getString("النص", true);
        const img = interaction.options.getString("الصورة");
        await pool.query(
          `INSERT INTO bot_guild_config (guild_id, leave_msg, leave_image) VALUES ($1, $2, $3)
           ON CONFLICT (guild_id) DO UPDATE SET leave_msg=$2, leave_image=COALESCE($3, bot_guild_config.leave_image)`,
          [guild.id, text, img]
        );
        await interaction.reply("✅ تم حفظ رسالة المغادرة الجديدة.");
        return;
      }

      // ============ Fun ============
      case "قرعة": {
        if (!(await checkMod(interaction, PermissionFlagsBits.ManageMessages))) return;
        const prize = interaction.options.getString("الجائزة", true);
        const minutes = interaction.options.getInteger("الدقائق", true);
        const winners = interaction.options.getInteger("الفائزين") ?? 1;
        const endsAt = new Date(Date.now() + minutes * 60_000);
        const embed = new EmbedBuilder().setColor(0xe91e63).setTitle("🎉 قرعة!")
          .setDescription(`**الجائزة:** ${prize}\n👥 **عدد الفائزين:** ${winners}\n⏰ **تنتهي:** <t:${Math.floor(endsAt.getTime() / 1000)}:R>\n\nاضغط 🎉 للمشاركة!`);
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId("giveaway_enter").setLabel("🎉 شارك").setStyle(ButtonStyle.Success)
        );
        await interaction.reply({ embeds: [embed], components: [row] });
        const msg = await interaction.fetchReply();
        await createGiveaway({
          guild_id: guild.id,
          channel_id: interaction.channelId,
          message_id: msg.id,
          prize,
          winners_count: winners,
          ends_at: endsAt,
        });
        return;
      }
      case "نرد": {
        const n = 1 + Math.floor(Math.random() * 6);
        await interaction.reply(`🎲 طلع لك: **${n}**`);
        return;
      }
      case "عملة": {
        const r = Math.random() < 0.5 ? "صورة 👑" : "كتابة ✍️";
        await interaction.reply(`🪙 العملة قالت: **${r}**`);
        return;
      }
      case "اختر": {
        const opts = interaction.options.getString("الخيارات", true).split("|").map((s) => s.trim()).filter(Boolean);
        if (opts.length < 2) return interaction.reply({ content: "حط خيارين على الأقل مفصولة بـ |", ephemeral: true });
        await interaction.reply(`🎯 اخترت لك: **${pick(opts)}**`);
        return;
      }

      // ============ CONFIG ============
      case "ضبط": {
        if (!(await checkMod(interaction, PermissionFlagsBits.ManageGuild))) return;
        const setting = interaction.options.getString("النوع", true);
        const channel = interaction.options.getChannel("القناة") as GuildBasedChannel | null;
        const role = interaction.options.getRole("الرتبة");
        const fieldMap: Record<string, "log_channel_id" | "welcome_channel_id" | "athkar_channel_id" | "ticket_category_id" | "vip_role_id"> = {
          "logs": "log_channel_id",
          "welcome": "welcome_channel_id",
          "athkar": "athkar_channel_id",
          "tickets": "ticket_category_id",
          "vip": "vip_role_id",
        };
        const field = fieldMap[setting];
        if (!field) return interaction.reply({ content: "نوع الإعداد غير صحيح.", ephemeral: true });
        const value = setting === "vip" ? role?.id ?? null : channel?.id ?? null;
        if (!value) return interaction.reply({ content: "حدد القناة أو الرتبة المطلوبة.", ephemeral: true });
        await setGuildConfig(guild.id, field, value);
        await interaction.reply({ content: `✅ تم حفظ إعداد **${setting}**.`, ephemeral: true });
        return;
      }
      case "لوحة_التحكم": {
        if (!(await checkMod(interaction, PermissionFlagsBits.ManageGuild))) return;
        const cfg = await fetchPanelConfig(guild.id);
        const payload = buildMainPanel(cfg, guild.name, guild.iconURL());
        await interaction.reply({ ...(payload as any), ephemeral: true });
        return;
      }

      case "مساعدة":
      case "اوامر": {
        const embed = new EmbedBuilder()
          .setColor(0xffd700)
          .setAuthor({ name: guild.name, iconURL: guild.iconURL({ size: 256 }) || undefined })
          .setTitle("📜 قائمة أوامر البوت")
          .setDescription("اختر الفئة اللي تهمك واستخدم الأمر المناسب:")
          .addFields(
            {
              name: "🛡️ الإدارة",
              value: [
                "`/قفل` — إغلاق القناة ومنع الكتابة",
                "`/فتح` — إعادة فتح القناة",
                "`/كنس` — حذف عدد من الرسائل",
                "`/بشويش` — تفعيل وضع التباطؤ",
                "`/براا` — طرد عضو من السيرفر",
                "`/اصبر` — إسكات عضو مؤقتاً",
                "`/تكلم` — فك إسكات عضو",
                "`/حظر` — حظر نهائي لعضو",
                "`/فك_الحظر` — إزالة الحظر",
                "`/بلاغ` — إرسال بلاغ سري للإدارة",
                "`/ضبط` — ضبط قنوات السجلات والترحيب والأذكار والتذاكر ورتبة VIP",
              ].join("\n"),
            },
            {
              name: "🤖 الذكاء الاصطناعي",
              value: [
                "`/ai` — اسأل الذكاء الاصطناعي أي سؤال",
                "`/تخيل` — توليد صورة من وصف نصي",
                "📝 اكتب **ترجمة** بالرد على أي رسالة لترجمتها للعربية",
              ].join("\n"),
            },
            {
              name: "💰 الاقتصاد والسرقة",
              value: [
                "`/راتب` — استلام مكافأتك اليومية",
                "`/تحويل` — تحويل نقاط لعضو آخر",
                "`/متجر` — متجر السيرفر (درع، خروج من السجن، VIP، لون مميز، خلفيات)",
                "`/سرقة` — محاولة سرقة عضو (الفشل = غرامة وسجن)",
                "`/الخزنة` — عرض رصيد خزنة السيرفر",
                "`/البيست` — لوحة أغنى الأعضاء",
                "`/السوق_السوداء` — متجر سري يفتح ساعة عشوائية يومياً",
                "`/قنبلة` — قنبلة نقاط تسلب 30% من رصيد عضو (من السوق السوداء)",
                "`/فتح_السوق` — فتح السوق السوداء يدوياً (للإدارة)",
              ].join("\n"),
            },
            {
              name: "🛎️ الخدمات",
              value: [
                "`/حسابي` — بطاقة هويتك مع اللقب والإحصائيات",
                "`/بايو` — عرض الـ bio الخاص بعضو",
                "`/صورة` — عرض صورة البروفايل بأعلى جودة",
                "`/السيرفر` — إحصائيات شاملة عن السيرفر",
                "`/تذكرة` — فتح تذكرة دعم خاصة مع الإدارة",
                "`/مساعدة` أو `/اوامر` — عرض هذه القائمة",
              ].join("\n"),
            },
            {
              name: "🏷️ الألقاب التلقائية",
              value: "🔪 **السفاح** (10 سرقات متتالية) • 💎 **الملياردير** (100K+) • 🎙️ **عمدة الفويس** (50 ساعة+) • 💀 **المنحوس** (5 مرات سجن في يوم)",
            },
          )
          .setFooter({ text: "✨ بوت متكامل بالعربية | للمزيد جرّب أي أمر مباشرة" })
          .setTimestamp();
        await interaction.reply({ embeds: [embed] });
        return;
      }
    }
  } catch (e) {
    console.error("interaction error", e);
    const msg = "⚠️ صار خطأ. حاول مرة ثانية.";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(msg).catch(() => {});
    } else {
      await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
  }
});

// ==================== Keep-Alive HTTP Server ====================
const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

app.get("/", (_req, res) => {
  const uptime = process.uptime();
  const h = Math.floor(uptime / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  const s = Math.floor(uptime % 60);
  res.send(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>Bot Status</title>
<style>
  body{font-family:system-ui,sans-serif;background:#0f1117;color:#e6e6e6;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
  .card{background:#1a1d27;padding:32px 48px;border-radius:16px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.4)}
  h1{margin:0 0 8px;color:#2ecc71}
  .pulse{display:inline-block;width:12px;height:12px;background:#2ecc71;border-radius:50%;margin-left:8px;animation:pulse 1.5s infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
  .stat{margin:8px 0;color:#aaa}
</style>
</head>
<body>
  <div class="card">
    <h1>البوت شغّال<span class="pulse"></span></h1>
    <div class="stat">${client.user?.tag ?? "—"}</div>
    <div class="stat">⏱️ مدة التشغيل: ${h}س ${m}د ${s}ث</div>
    <div class="stat">🌐 السيرفرات: ${client.guilds.cache.size}</div>
  </div>
</body>
</html>`);
});

app.get("/ping", (_req, res) => {
  res.json({
    status: "ok",
    bot: client.user?.tag ?? null,
    uptime: process.uptime(),
    guilds: client.guilds.cache.size,
    ts: Date.now(),
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Keep-alive server listening on port ${PORT}`);
});

client.login(TOKEN);

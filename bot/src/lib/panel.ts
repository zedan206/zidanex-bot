import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelType,
} from "discord.js";

export type PanelConfig = {
  log_channel_id: string | null;
  welcome_channel_id: string | null;
  athkar_channel_id: string | null;
  ticket_category_id: string | null;
  vip_role_id: string | null;
  verify_role_id: string | null;
  verify_channel_id: string | null;
  antispam_enabled: boolean;
  welcome_msg: string | null;
  leave_msg: string | null;
};

const COLOR = 0x5865f2;

function ch(id: string | null): string {
  return id ? `<#${id}>` : "`غير مضبوط`";
}
function ro(id: string | null): string {
  return id ? `<@&${id}>` : "`غير مضبوطة`";
}

// ── Navigation select menu (shared) ─────────────────────────────
function navRow() {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("panel:nav")
      .setPlaceholder("📂 انتقل إلى فئة أخرى...")
      .addOptions(
        { label: "🏠 الرئيسية", value: "main" },
        { label: "📋 القنوات", value: "channels" },
        { label: "🏷️ الرتب", value: "roles" },
        { label: "🛡️ الحماية", value: "protection" },
        { label: "💰 الاقتصاد", value: "economy" },
        { label: "👋 الترحيب والمغادرة", value: "welcome" },
      )
  );
}

function backRow() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("panel:back").setLabel("◀️ رجوع للرئيسية").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("panel:btn:refresh").setLabel("🔄 تحديث").setStyle(ButtonStyle.Secondary),
  );
}

// ── Main panel ───────────────────────────────────────────────────
export function buildMainPanel(cfg: PanelConfig, guildName: string, guildIcon: string | null) {
  const antispamStatus = cfg.antispam_enabled ? "✅ شغّال" : "❌ مُوقف";
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setAuthor({ name: `⚙️ لوحة التحكم — ${guildName}`, iconURL: guildIcon ?? undefined })
    .setDescription("اختر فئة من القائمة أدناه للتعديل. التغييرات تُطبَّق **فوراً**.")
    .addFields(
      {
        name: "📋 القنوات",
        value: [
          `📝 السجلات: ${ch(cfg.log_channel_id)}`,
          `👋 الترحيب: ${ch(cfg.welcome_channel_id)}`,
          `🌙 الأذكار: ${ch(cfg.athkar_channel_id)}`,
          `🎫 التذاكر: ${ch(cfg.ticket_category_id)}`,
        ].join("\n"),
        inline: true,
      },
      {
        name: "🏷️ الرتب",
        value: [
          `👑 VIP: ${ro(cfg.vip_role_id)}`,
          `✅ التحقق: ${ro(cfg.verify_role_id)}`,
        ].join("\n"),
        inline: true,
      },
      {
        name: "🛡️ الحماية",
        value: `Anti-Spam: **${antispamStatus}**`,
        inline: true,
      },
    )
    .setFooter({ text: "🔒 هذه اللوحة مرئية لك فقط" })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [navRow()],
  };
}

// ── Channels panel ───────────────────────────────────────────────
export function buildChannelsPanel(cfg: PanelConfig) {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle("📋 ضبط القنوات")
    .setDescription("اختر من كل قائمة القناة المناسبة — التغيير يُحفظ فوراً.")
    .addFields(
      { name: "📝 قناة السجلات الحالية", value: ch(cfg.log_channel_id), inline: true },
      { name: "👋 قناة الترحيب الحالية", value: ch(cfg.welcome_channel_id), inline: true },
      { name: "🌙 قناة الأذكار الحالية", value: ch(cfg.athkar_channel_id), inline: true },
      { name: "🎫 فئة التذاكر الحالية", value: ch(cfg.ticket_category_id), inline: true },
    );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId("panel:ch:log")
          .setPlaceholder("📝 اختر قناة السجلات...")
          .addChannelTypes(ChannelType.GuildText)
      ),
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId("panel:ch:welcome")
          .setPlaceholder("👋 اختر قناة الترحيب...")
          .addChannelTypes(ChannelType.GuildText)
      ),
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId("panel:ch:athkar")
          .setPlaceholder("🌙 اختر قناة الأذكار...")
          .addChannelTypes(ChannelType.GuildText)
      ),
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId("panel:ch:tickets")
          .setPlaceholder("🎫 اختر فئة التذاكر...")
          .addChannelTypes(ChannelType.GuildCategory)
      ),
      backRow(),
    ],
  };
}

// ── Roles panel ──────────────────────────────────────────────────
export function buildRolesPanel(cfg: PanelConfig) {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle("🏷️ ضبط الرتب")
    .setDescription("اختر الرتبة المناسبة من القائمة — التغيير يُحفظ فوراً.")
    .addFields(
      { name: "👑 رتبة VIP الحالية", value: ro(cfg.vip_role_id), inline: true },
      { name: "✅ رتبة التحقق الحالية", value: ro(cfg.verify_role_id), inline: true },
    );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId("panel:role:vip")
          .setPlaceholder("👑 اختر رتبة VIP...")
      ),
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId("panel:role:verify")
          .setPlaceholder("✅ اختر رتبة التحقق...")
      ),
      backRow(),
    ],
  };
}

// ── Protection panel ─────────────────────────────────────────────
export function buildProtectionPanel(cfg: PanelConfig) {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle("🛡️ إعدادات الحماية")
    .addFields(
      {
        name: "🔗 Anti-Spam (منع الروابط)",
        value: cfg.antispam_enabled
          ? "✅ **مُفعَّل** — يحذف الروابط تلقائياً ويحذّر العضو"
          : "❌ **مُوقف** — الروابط مسموح بها",
      },
      {
        name: "✅ نظام التحقق",
        value: [
          `رتبة التحقق: ${ro(cfg.verify_role_id)}`,
          `قناة التحقق: ${ch(cfg.verify_channel_id)}`,
          cfg.verify_role_id
            ? "⚡ اضغط الزر أدناه لإرسال لوحة التحقق في القناة الحالية"
            : "⚠️ اضبط رتبة التحقق أولاً من صفحة **الرتب**",
        ].join("\n"),
      },
    );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("panel:btn:antispam_on")
          .setLabel("✅ تفعيل Anti-Spam")
          .setStyle(ButtonStyle.Success)
          .setDisabled(cfg.antispam_enabled),
        new ButtonBuilder()
          .setCustomId("panel:btn:antispam_off")
          .setLabel("❌ إيقاف Anti-Spam")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(!cfg.antispam_enabled),
        new ButtonBuilder()
          .setCustomId("panel:btn:send_verify")
          .setLabel("📨 إرسال لوحة التحقق هنا")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!cfg.verify_role_id),
      ),
      backRow(),
    ],
  };
}

// ── Economy panel ─────────────────────────────────────────────────
export function buildEconomyPanel(marketOpen: boolean, openUntil: Date | null, vaultBalance: number) {
  const marketStatus = marketOpen
    ? `✅ **مفتوح** ${openUntil ? `حتى <t:${Math.floor(openUntil.getTime() / 1000)}:R>` : ""}`
    : "❌ **مغلق**";

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle("💰 إعدادات الاقتصاد")
    .addFields(
      { name: "🕵️ السوق السوداء", value: marketStatus, inline: false },
      { name: "🏛️ رصيد الخزنة", value: `💰 **${vaultBalance.toLocaleString("ar")}** نقطة`, inline: false },
    );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("panel:btn:market_1h")
          .setLabel("🔓 فتح السوق — ساعة")
          .setStyle(ButtonStyle.Success)
          .setDisabled(marketOpen),
        new ButtonBuilder()
          .setCustomId("panel:btn:market_3h")
          .setLabel("🔓 فتح السوق — 3 ساعات")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(marketOpen),
        new ButtonBuilder()
          .setCustomId("panel:btn:market_close")
          .setLabel("🔒 إغلاق السوق")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(!marketOpen),
      ),
      backRow(),
    ],
  };
}

// ── Welcome panel ─────────────────────────────────────────────────
export function buildWelcomePanel(cfg: PanelConfig) {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle("👋 رسائل الترحيب والمغادرة")
    .setDescription(
      "**المتغيرات المتاحة:** `{user}` = العضو، `{server}` = اسم السيرفر\n" +
      "لتعديل النصوص استخدم: `/set_welcome` أو `/set_leave`"
    )
    .addFields(
      { name: "👋 قناة الترحيب", value: ch(cfg.welcome_channel_id), inline: true },
      { name: "\u200b", value: "\u200b", inline: true },
      { name: "\u200b", value: "\u200b", inline: true },
      {
        name: "📝 نص رسالة الترحيب",
        value: cfg.welcome_msg
          ? `\`\`\`${cfg.welcome_msg.slice(0, 300)}\`\`\``
          : "*الرسالة الافتراضية*",
      },
      {
        name: "📝 نص رسالة المغادرة",
        value: cfg.leave_msg
          ? `\`\`\`${cfg.leave_msg.slice(0, 300)}\`\`\``
          : "*الرسالة الافتراضية*",
      },
    );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("panel:btn:reset_welcome")
          .setLabel("🔄 إعادة ضبط رسالة الترحيب")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(!cfg.welcome_msg),
        new ButtonBuilder()
          .setCustomId("panel:btn:reset_leave")
          .setLabel("🔄 إعادة ضبط رسالة المغادرة")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(!cfg.leave_msg),
      ),
      backRow(),
    ],
  };
}

import {
  SlashCommandBuilder,
  type Client,
  ChannelType,
  PermissionFlagsBits,
} from "discord.js";

export async function registerCommands(client: Client<true>): Promise<void> {
  const cmds = [
    // Admin
    new SlashCommandBuilder().setName("قفل").setDescription("إغلاق الشات ومنع الكتابة").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    new SlashCommandBuilder().setName("فتح").setDescription("إعادة فتح القناة").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    new SlashCommandBuilder().setName("كنس").setDescription("حذف الرسائل (يسأل البوت عن العدد)").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    new SlashCommandBuilder().setName("بشويش").setDescription("تفعيل وضع التباطؤ").addIntegerOption((o) => o.setName("ثواني").setDescription("عدد الثواني (0-21600)").setMinValue(0).setMaxValue(21600).setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    new SlashCommandBuilder().setName("براا").setDescription("طرد عضو من السيرفر").addUserOption((o) => o.setName("العضو").setDescription("العضو").setRequired(true)).addStringOption((o) => o.setName("السبب").setDescription("السبب")).setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    new SlashCommandBuilder().setName("اصبر").setDescription("إسكات عضو مؤقتاً").addUserOption((o) => o.setName("العضو").setDescription("العضو").setRequired(true)).addIntegerOption((o) => o.setName("دقائق").setDescription("المدة بالدقائق").setMinValue(1).setMaxValue(40320).setRequired(true)).addStringOption((o) => o.setName("السبب").setDescription("السبب")).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    new SlashCommandBuilder().setName("تكلم").setDescription("فك الإسكات").addUserOption((o) => o.setName("العضو").setDescription("العضو").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    new SlashCommandBuilder().setName("حظر").setDescription("حظر نهائي").addUserOption((o) => o.setName("العضو").setDescription("العضو").setRequired(true)).addStringOption((o) => o.setName("السبب").setDescription("السبب")).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    new SlashCommandBuilder().setName("فك_الحظر").setDescription("إزالة الحظر").addStringOption((o) => o.setName("الايدي").setDescription("ID العضو").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    new SlashCommandBuilder().setName("بلاغ").setDescription("إرسال بلاغ سري للإدارة").addUserOption((o) => o.setName("العضو").setDescription("ضد من").setRequired(true)).addStringOption((o) => o.setName("السبب").setDescription("السبب").setRequired(true)),

    // AI
    new SlashCommandBuilder().setName("ai").setDescription("اسأل الذكاء الاصطناعي").addStringOption((o) => o.setName("السؤال").setDescription("اكتب سؤالك").setRequired(true)),
    new SlashCommandBuilder().setName("تخيل").setDescription("توليد صورة من وصف").addStringOption((o) => o.setName("الوصف").setDescription("صف الصورة المطلوبة").setRequired(true)),

    // Economy
    new SlashCommandBuilder().setName("راتب").setDescription("استلم مكافأتك اليومية"),
    new SlashCommandBuilder().setName("تحويل").setDescription("تحويل نقاط لعضو").addUserOption((o) => o.setName("العضو").setDescription("المستلم").setRequired(true)).addIntegerOption((o) => o.setName("المبلغ").setDescription("المبلغ").setMinValue(1).setRequired(true)),
    new SlashCommandBuilder().setName("متجر").setDescription("عرض المتجر"),
    new SlashCommandBuilder().setName("سرقة").setDescription("محاولة سرقة عضو").addUserOption((o) => o.setName("العضو").setDescription("الضحية").setRequired(true)),

    // Black Market & Vault
    new SlashCommandBuilder().setName("السوق_السوداء").setDescription("🕵️ السوق السوداء (يفتح ساعة عشوائية يومياً)"),
    new SlashCommandBuilder().setName("فتح_السوق").setDescription("🔓 فتح السوق السوداء يدوياً (للإدارة فقط)").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder().setName("قنبلة").setDescription("💣 قنبلة النقاط — تخصم مستوى كامل من عضو (تتطلب 10,000💰 + سوق سوداء مفتوح)").addUserOption((o) => o.setName("العضو").setDescription("الضحية").setRequired(true)),
    new SlashCommandBuilder().setName("الخزنة").setDescription("🏛️ عرض رصيد خزنة السيرفر"),
    // Economy leaderboard
    new SlashCommandBuilder().setName("البيست").setDescription("🏆 لوحة أغنى الأعضاء"),

    // Info
    new SlashCommandBuilder().setName("حسابي").setDescription("بطاقة هوية").addUserOption((o) => o.setName("العضو").setDescription("شوف بطاقة عضو")),
    new SlashCommandBuilder().setName("بايو").setDescription("عرض الـ bio").addUserOption((o) => o.setName("العضو").setDescription("العضو")),
    new SlashCommandBuilder().setName("صورة").setDescription("صورة البروفايل بأعلى جودة").addUserOption((o) => o.setName("العضو").setDescription("العضو")),
    new SlashCommandBuilder().setName("السيرفر").setDescription("إحصائيات السيرفر"),
    new SlashCommandBuilder().setName("تذكرة").setDescription("فتح تذكرة دعم").addStringOption((o) => o.setName("السبب").setDescription("السبب")),

    // Config
    new SlashCommandBuilder().setName("ضبط").setDescription("ضبط قنوات/رتب البوت").addStringOption((o) => o.setName("النوع").setDescription("النوع").setRequired(true).addChoices(
      { name: "logs (السجلات)", value: "logs" },
      { name: "welcome (الترحيب)", value: "welcome" },
      { name: "athkar (الأذكار)", value: "athkar" },
      { name: "tickets (تصنيف التذاكر)", value: "tickets" },
      { name: "vip (رتبة VIP)", value: "vip" },
    )).addChannelOption((o) => o.setName("القناة").setDescription("القناة أو التصنيف").addChannelTypes(ChannelType.GuildText, ChannelType.GuildCategory)).addRoleOption((o) => o.setName("الرتبة").setDescription("الرتبة (لـ VIP)")).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    // Music
    new SlashCommandBuilder().setName("play").setDescription("🎵 شغّل أغنية من يوتيوب (اسم أو رابط)").addStringOption((o) => o.setName("الطلب").setDescription("اسم الأغنية أو رابط يوتيوب/قائمة").setRequired(true)),
    new SlashCommandBuilder().setName("skip").setDescription("⏭️ تخطي الأغنية الحالية"),
    new SlashCommandBuilder().setName("stop").setDescription("⏹️ إيقاف الموسيقى ومغادرة الروم"),
    new SlashCommandBuilder().setName("queue").setDescription("📜 عرض قائمة الانتظار"),
    new SlashCommandBuilder().setName("قائمة_الانتظار").setDescription("📜 عرض كل الأغاني القادمة مع زر خلط"),
    new SlashCommandBuilder().setName("loop").setDescription("🔁 تفعيل/إيقاف تكرار الأغنية الحالية"),
    new SlashCommandBuilder().setName("volume").setDescription("🔊 تغيير مستوى الصوت (0-200)").addIntegerOption((o) => o.setName("المستوى").setDescription("من 0 إلى 200").setMinValue(0).setMaxValue(200).setRequired(true)),

    // Anti-spam / Verification
    new SlashCommandBuilder().setName("antispam").setDescription("🛡️ تفعيل/إيقاف منع الروابط").addStringOption((o) => o.setName("الحالة").setDescription("تشغيل/إيقاف").setRequired(true).addChoices({ name: "تشغيل", value: "on" }, { name: "إيقاف", value: "off" })).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder().setName("verify_setup").setDescription("✅ إعداد نظام التحقق").addRoleOption((o) => o.setName("الرتبة").setDescription("الرتبة التي تُمنح بعد التحقق").setRequired(true)).addChannelOption((o) => o.setName("القناة").setDescription("القناة التي ستحتوي زر التحقق").addChannelTypes(ChannelType.GuildText).setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder().setName("verify_panel").setDescription("📜 إرسال لوحة التحقق في القناة الحالية").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    // Welcome customization
    new SlashCommandBuilder().setName("set_welcome").setDescription("✏️ تعديل رسالة الترحيب ({user} = العضو، {server} = اسم السيرفر)").addStringOption((o) => o.setName("النص").setDescription("نص الرسالة").setRequired(true)).addStringOption((o) => o.setName("الصورة").setDescription("رابط صورة (اختياري)")).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder().setName("set_leave").setDescription("✏️ تعديل رسالة المغادرة").addStringOption((o) => o.setName("النص").setDescription("نص الرسالة").setRequired(true)).addStringOption((o) => o.setName("الصورة").setDescription("رابط صورة (اختياري)")).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    // Fun events
    new SlashCommandBuilder().setName("قرعة").setDescription("🎉 إنشاء قرعة عشوائية").addStringOption((o) => o.setName("الجائزة").setDescription("الجائزة").setRequired(true)).addIntegerOption((o) => o.setName("الدقائق").setDescription("مدة القرعة بالدقائق").setMinValue(1).setMaxValue(10080).setRequired(true)).addIntegerOption((o) => o.setName("الفائزين").setDescription("عدد الفائزين").setMinValue(1).setMaxValue(20)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    new SlashCommandBuilder().setName("نرد").setDescription("🎲 ارمِ النرد"),
    new SlashCommandBuilder().setName("عملة").setDescription("🪙 صورة أم كتابة"),
    new SlashCommandBuilder().setName("اختر").setDescription("🎯 اختر عشوائياً من خيارات (افصلها بـ |)").addStringOption((o) => o.setName("الخيارات").setDescription("مثال: نعم|لا|ربما").setRequired(true)),

    new SlashCommandBuilder()
      .setName("لوحة_التحكم")
      .setDescription("⚙️ لوحة تحكم إدارية تفاعلية بالأزرار والقوائم")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder().setName("مساعدة").setDescription("قائمة كل الأوامر"),
    new SlashCommandBuilder().setName("اوامر").setDescription("قائمة كل الأوامر"),
  ];

  await client.application.commands.set(cmds.map((c) => c.toJSON()));
}

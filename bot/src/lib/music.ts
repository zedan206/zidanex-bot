import { LavalinkManager } from "lavalink-client";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Message,
} from "discord.js";
import type { Client, GuildMember, TextBasedChannel, User, VoiceBasedChannel } from "discord.js";

const COLOR_MUSIC = 0x1db954;

// ─── Progress bar ────────────────────────────────────────────────
const BAR_LENGTH = 18;

function buildProgressBar(positionMs: number, durationMs: number): string {
  if (!durationMs || durationMs <= 0) return `[${"░".repeat(BAR_LENGTH)}]`;
  const ratio = Math.min(positionMs / durationMs, 1);
  const filled = Math.round(ratio * BAR_LENGTH);
  const empty = BAR_LENGTH - filled;
  return `[${"▓".repeat(filled)}${"░".repeat(empty)}]`;
}

function formatDuration(ms: number): string {
  if (!ms || !isFinite(ms)) return "—";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export { formatDuration };

// ─── Controls row ─────────────────────────────────────────────────
export function buildMusicControls(loop: boolean = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("music:pause").setLabel("⏸️ إيقاف مؤقت").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("music:resume").setLabel("▶️ استئناف").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("music:skip").setLabel("⏭️ تخطي").setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("music:loop")
      .setLabel(loop ? "🔁 تكرار: شغّال" : "🔁 تكرار")
      .setStyle(loop ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("music:stop").setLabel("⏹️ إيقاف").setStyle(ButtonStyle.Danger),
  );
}

// ─── Now-Playing embed ────────────────────────────────────────────
function buildNowPlayingEmbed(opts: {
  title: string;
  url: string | null;
  artworkUrl: string | null;
  author: string;
  authorIconUrl: string | null;
  durationMs: number;
  positionMs: number;
  queueSize: number;
  loop: boolean;
  isStream: boolean;
}): EmbedBuilder {
  const {
    title, url, artworkUrl, author, authorIconUrl,
    durationMs, positionMs, queueSize, loop, isStream,
  } = opts;

  const bar = isStream ? "🔴 بث مباشر" : buildProgressBar(positionMs, durationMs);
  const timeLabel = isStream
    ? "🔴 Live"
    : `\`${formatDuration(positionMs)}\` ${bar} \`${formatDuration(durationMs)}\``;

  const embed = new EmbedBuilder()
    .setColor(COLOR_MUSIC)
    .setAuthor({ name: "▶️ يشغّل الآن", iconURL: authorIconUrl ?? undefined })
    .setTitle(title.length > 256 ? title.slice(0, 253) + "..." : title)
    .setDescription(timeLabel)
    .addFields(
      { name: "⏱️ المدة", value: isStream ? "بث مباشر" : formatDuration(durationMs), inline: true },
      { name: "👤 طلبها", value: author, inline: true },
      { name: "📋 في القائمة", value: `${queueSize} أغنية`, inline: true },
      { name: "🔁 التكرار", value: loop ? "شغّال" : "مُوقف", inline: true },
    )
    .setTimestamp();

  if (url) embed.setURL(url);
  if (artworkUrl) embed.setThumbnail(artworkUrl);

  return embed;
}

// ─── Per-player update intervals ──────────────────────────────────
const npIntervals = new Map<string, ReturnType<typeof setInterval>>();

function clearNpInterval(guildId: string): void {
  const existing = npIntervals.get(guildId);
  if (existing) {
    clearInterval(existing);
    npIntervals.delete(guildId);
  }
}

// ─── 24/7 voice persist store ─────────────────────────────────────
interface VcPersistEntry {
  voiceChannelId: string;
  textChannel: TextBasedChannel;
}
const vcPersist = new Map<string, VcPersistEntry>();

export function setVcPersist(guildId: string, entry: VcPersistEntry): void {
  vcPersist.set(guildId, entry);
}

export function clearVcPersist(guildId: string): void {
  vcPersist.delete(guildId);
}

// ─── Reconnect helper ─────────────────────────────────────────────
async function reconnect247(client: Client, guildId: string): Promise<void> {
  const entry = vcPersist.get(guildId);
  if (!entry || !manager) return;

  // Wait a moment to avoid racing with Discord disconnect events
  await new Promise((r) => setTimeout(r, 3_000));

  try {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;

    let player = manager.getPlayer(guildId);
    if (!player) {
      player = manager.createPlayer({
        guildId,
        voiceChannelId: entry.voiceChannelId,
        textChannelId: (entry.textChannel as any).id,
        selfDeaf: true,
        volume: 80,
      });
    }
    player.set("textChannel", entry.textChannel);
    if (!player.connected) {
      await player.connect();
    }

    // Send a quiet notice
    if ("send" in entry.textChannel) {
      await (entry.textChannel as any).send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_MUSIC)
            .setDescription("🔄 أعدت الاتصال بالقناة الصوتية تلقائياً — أنا هنا 24/7! 🎵"),
        ],
      }).catch(() => {});
    }
  } catch {
    // Retry after 10 seconds if something went wrong
    setTimeout(() => reconnect247(client, guildId), 10_000);
  }
}

// ─── Lavalink manager ─────────────────────────────────────────────
export let manager: LavalinkManager | null = null;

export function initLavalink(client: Client): LavalinkManager | null {
  const host = process.env.LAVALINK_HOST;
  const port = process.env.LAVALINK_PORT ? parseInt(process.env.LAVALINK_PORT, 10) : 2333;
  const password = process.env.LAVALINK_PASSWORD;
  const secure = process.env.LAVALINK_SECURE === "true";

  if (!host || !password) {
    console.warn("⚠️ Lavalink غير مُعَدّ — اضبط LAVALINK_HOST و LAVALINK_PASSWORD لتفعيل الموسيقى.");
    return null;
  }

  manager = new LavalinkManager({
    nodes: [
      {
        authorization: password,
        host,
        port,
        id: "main",
        secure,
        retryAmount: 10,
        retryDelay: 5_000,
      },
    ],
    sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard?.send(payload),
    client: { id: client.user!.id, username: client.user!.username },
    autoSkip: true,
    playerOptions: {
      defaultSearchPlatform: "ytsearch",
      // Never destroy player on disconnect; always try to reconnect
      onDisconnect: { autoReconnect: true, destroyPlayer: false },
      // Never auto-destroy when queue is empty (24/7 mode)
      onEmptyQueue: { destroyAfterMs: undefined as unknown as number },
    },
  });

  client.on("raw", (d) => manager?.sendRawData(d));

  manager.nodeManager.on("connect", (node) => {
    console.log(`✅ Lavalink node متصل: ${node.id}`);
  });
  manager.nodeManager.on("error", (node, err) => {
    console.error(`❌ Lavalink node خطأ (${node.id}):`, err?.message ?? err);
  });
  manager.nodeManager.on("disconnect", (node) => {
    console.warn(`⚠️ Lavalink node منقطع: ${node.id}`);
  });

  // ── trackStart ────────────────────────────────────────────────
  manager.on("trackStart", async (player, track) => {
    const ch = player.get<TextBasedChannel | undefined>("textChannel");
    if (!ch || !("send" in ch)) return;

    const requester = track.requester as User | null | undefined;
    const author = requester ? (requester.displayName ?? requester.username) : "مجهول";
    const authorIconUrl = requester?.displayAvatarURL() ?? null;

    const loop = player.repeatMode === "track" || player.repeatMode === "queue";
    const isStream = !track.info.isSeekable && !track.info.duration;
    const durationMs = track.info.duration ?? 0;
    const queueSize = player.queue.tracks.length;

    const embed = buildNowPlayingEmbed({
      title: track.info.title,
      url: track.info.uri ?? null,
      artworkUrl: (track.info as any).artworkUrl ?? (track.info as any).thumbnail ?? null,
      author,
      authorIconUrl,
      durationMs,
      positionMs: 0,
      queueSize,
      loop,
      isStream,
    });

    clearNpInterval(player.guildId);

    let npMsg: Message | null = null;
    try {
      npMsg = await (ch as any).send({
        embeds: [embed],
        components: [buildMusicControls(loop)],
      });
    } catch {
      return;
    }

    player.set("npMessage", npMsg);
    if (isStream) return;

    // Update progress bar every 15 seconds
    const interval = setInterval(async () => {
      const currentPlayer = manager?.getPlayer(player.guildId);
      if (!currentPlayer || !currentPlayer.playing) {
        clearNpInterval(player.guildId);
        return;
      }

      const posMs = currentPlayer.position ?? 0;
      const currentLoop = currentPlayer.repeatMode === "track" || currentPlayer.repeatMode === "queue";
      const currentTrack = currentPlayer.queue.current;
      if (!currentTrack) {
        clearNpInterval(player.guildId);
        return;
      }

      const updatedEmbed = buildNowPlayingEmbed({
        title: currentTrack.info.title,
        url: currentTrack.info.uri ?? null,
        artworkUrl: (currentTrack.info as any).artworkUrl ?? (currentTrack.info as any).thumbnail ?? null,
        author,
        authorIconUrl,
        durationMs: currentTrack.info.duration ?? durationMs,
        positionMs: posMs,
        queueSize: currentPlayer.queue.tracks.length,
        loop: currentLoop,
        isStream: false,
      });

      await npMsg!.edit({
        embeds: [updatedEmbed],
        components: [buildMusicControls(currentLoop)],
      }).catch(() => {
        clearNpInterval(player.guildId);
      });
    }, 15_000);

    npIntervals.set(player.guildId, interval);
  });

  // ── queueEnd: stay in channel (24/7) ─────────────────────────
  manager.on("queueEnd", (player) => {
    clearNpInterval(player.guildId);
    const ch = player.get<TextBasedChannel | undefined>("textChannel");
    if (ch && "send" in ch) {
      (ch as any).send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_MUSIC)
            .setTitle("🎵 قائمة الانتظار فارغة")
            .setDescription(
              "📭 انتهت جميع الأغاني.\n" +
              "أنا باقي في القناة الصوتية **24/7** — أضف أغاني جديدة بـ `/شغل`! 🎶"
            )
            .setFooter({ text: "وضع 24/7 مُفعَّل — البوت لا يغادر القناة." }),
        ],
      }).catch(() => {});
    }
    // Do NOT destroy the player — stay connected forever
  });

  // ── playerDestroy: auto-reconnect if kicked ───────────────────
  manager.on("playerDestroy", (player) => {
    clearNpInterval(player.guildId);
    const entry = vcPersist.get(player.guildId);
    if (entry) {
      // Attempt to rejoin the voice channel after 3 seconds
      reconnect247(client, player.guildId);
    }
  });

  return manager;
}

export async function initOnReady(): Promise<void> {
  if (manager) {
    await manager.init({ id: manager.options.client.id, username: manager.options.client.username });
  }
}

// ─── Player helpers ───────────────────────────────────────────────
export async function getOrCreatePlayer(
  member: GuildMember,
  textChannel: TextBasedChannel | null
) {
  if (!manager) throw new Error("نظام الموسيقى غير مُفعّل (Lavalink).");
  const vc = member.voice.channel as VoiceBasedChannel | null;
  if (!vc) throw new Error("ادخل روم صوتي أولاً.");

  let player = manager.getPlayer(member.guild.id);
  if (!player) {
    player = manager.createPlayer({
      guildId: member.guild.id,
      voiceChannelId: vc.id,
      textChannelId: textChannel?.id,
      selfDeaf: true,
      volume: 80,
    });
  } else if (player.voiceChannelId !== vc.id) {
    player.voiceChannelId = vc.id;
  }

  if (textChannel) {
    player.set("textChannel", textChannel);
    // Register for 24/7 auto-reconnect
    setVcPersist(member.guild.id, {
      voiceChannelId: vc.id,
      textChannel,
    });
  }

  if (!player.connected) await player.connect();
  return player;
}

export async function searchAndQueue(
  member: GuildMember,
  textChannel: TextBasedChannel | null,
  query: string
): Promise<{ playing: boolean; addedCount: number; firstTitle: string; isPlaylist: boolean }> {
  const player = await getOrCreatePlayer(member, textChannel);
  const result = await player.search({ query, source: "ytsearch" }, member.user);
  if (!result.tracks.length) throw new Error("ما لقيت أي نتيجة.");

  const isPlaylist = result.loadType === "playlist";
  const tracks = isPlaylist ? result.tracks.slice(0, 50) : [result.tracks[0]];
  await player.queue.add(tracks);
  if (!player.playing && !player.paused) await player.play();

  return {
    playing: !player.playing,
    addedCount: tracks.length,
    firstTitle: tracks[0].info.title,
    isPlaylist,
  };
}

export function getPlayer(guildId: string) {
  return manager?.getPlayer(guildId);
}

import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { getGuildConfig, getUser } from "./db.js";

export async function sendLog(
  client: Client,
  guildId: string,
  embed: EmbedBuilder
): Promise<void> {
  try {
    const cfg = await getGuildConfig(guildId);
    if (!cfg.log_channel_id) return;
    const ch = await client.channels.fetch(cfg.log_channel_id).catch(() => null);
    if (ch && ch.isTextBased()) {
      await (ch as TextChannel).send({ embeds: [embed] }).catch(() => {});
    }
  } catch {
    // ignore
  }
}

/**
 * Returns the actor mention, or "🕵️ مجهول" when actor has active stealth mask.
 */
export async function maskedActor(
  guildId: string,
  actorId: string
): Promise<string> {
  try {
    const u = await getUser(actorId, guildId);
    if (u.stealth_until && new Date(u.stealth_until).getTime() > Date.now()) {
      return "🕵️ **مجهول**";
    }
  } catch {
    // ignore
  }
  return `<@${actorId}>`;
}

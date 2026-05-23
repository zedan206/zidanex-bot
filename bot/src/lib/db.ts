import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function initSchema(): Promise<void> {
  await pool.query(`
    ALTER TABLE bot_users
      ADD COLUMN IF NOT EXISTS steal_streak INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS jail_count_today INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS jail_count_date DATE,
      ADD COLUMN IF NOT EXISTS stealth_until TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS hack_next BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS jail_keys INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS background TEXT;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_vault (
      guild_id TEXT PRIMARY KEY,
      balance BIGINT NOT NULL DEFAULT 0,
      last_friday_draw DATE
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_black_market (
      guild_id TEXT PRIMARY KEY,
      open_until TIMESTAMPTZ,
      last_open_date DATE
    );
  `);
  await pool.query(`
    ALTER TABLE bot_guild_config
      ADD COLUMN IF NOT EXISTS antispam_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS verify_role_id TEXT,
      ADD COLUMN IF NOT EXISTS verify_channel_id TEXT,
      ADD COLUMN IF NOT EXISTS welcome_msg TEXT,
      ADD COLUMN IF NOT EXISTS leave_msg TEXT,
      ADD COLUMN IF NOT EXISTS welcome_image TEXT,
      ADD COLUMN IF NOT EXISTS leave_image TEXT;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_level_roles (
      guild_id TEXT NOT NULL,
      level INTEGER NOT NULL,
      role_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, level)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_verified (
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, guild_id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_giveaways (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      prize TEXT NOT NULL,
      winners_count INTEGER NOT NULL DEFAULT 1,
      ends_at TIMESTAMPTZ NOT NULL,
      ended BOOLEAN NOT NULL DEFAULT FALSE,
      entries TEXT[] NOT NULL DEFAULT '{}'
    );
  `);
}

// ============ Verification ============
export async function isVerified(userId: string, guildId: string): Promise<boolean> {
  const r = await pool.query("SELECT 1 FROM bot_verified WHERE user_id=$1 AND guild_id=$2", [userId, guildId]);
  return r.rowCount! > 0;
}
export async function markVerified(userId: string, guildId: string): Promise<void> {
  await pool.query(
    `INSERT INTO bot_verified (user_id, guild_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, guildId]
  );
}

// ============ Giveaways ============
export interface Giveaway {
  id: number;
  guild_id: string;
  channel_id: string;
  message_id: string;
  prize: string;
  winners_count: number;
  ends_at: Date;
  ended: boolean;
  entries: string[];
}
export async function createGiveaway(g: Omit<Giveaway, "id" | "ended" | "entries">): Promise<number> {
  const r = await pool.query<{ id: number }>(
    `INSERT INTO bot_giveaways (guild_id, channel_id, message_id, prize, winners_count, ends_at)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [g.guild_id, g.channel_id, g.message_id, g.prize, g.winners_count, g.ends_at]
  );
  return r.rows[0]!.id;
}
export async function addGiveawayEntry(messageId: string, userId: string): Promise<boolean> {
  const r = await pool.query(
    `UPDATE bot_giveaways SET entries = array_append(entries, $2)
     WHERE message_id=$1 AND ended=false AND NOT ($2 = ANY(entries)) RETURNING id`,
    [messageId, userId]
  );
  return r.rowCount! > 0;
}
export async function getDueGiveaways(): Promise<Giveaway[]> {
  const r = await pool.query<Giveaway>("SELECT * FROM bot_giveaways WHERE ended=false AND ends_at <= NOW()");
  return r.rows;
}
export async function endGiveaway(id: number): Promise<void> {
  await pool.query("UPDATE bot_giveaways SET ended=true WHERE id=$1", [id]);
}

export async function ensureUser(userId: string, guildId: string): Promise<void> {
  await pool.query(
    `INSERT INTO bot_users (user_id, guild_id) VALUES ($1, $2)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, guildId]
  );
}

export interface BotUser {
  user_id: string;
  guild_id: string;
  points: string;
  xp: string;
  level: number;
  voice_seconds: string;
  shield_until: Date | null;
  jail_until: Date | null;
  daily_at: Date | null;
  steal_at: Date | null;
  game_at: Date | null;
  color: string | null;
  steal_streak: number;
  jail_count_today: number;
  jail_count_date: Date | null;
  stealth_until: Date | null;
  hack_next: boolean;
  jail_keys: number;
}

export async function getUser(userId: string, guildId: string): Promise<BotUser> {
  await ensureUser(userId, guildId);
  const r = await pool.query<BotUser>("SELECT * FROM bot_users WHERE user_id=$1", [userId]);
  return r.rows[0]!;
}

export async function addPoints(userId: string, guildId: string, amount: number): Promise<void> {
  await ensureUser(userId, guildId);
  await pool.query("UPDATE bot_users SET points = points + $1 WHERE user_id=$2", [amount, userId]);
}

export async function getGuildConfig(guildId: string): Promise<{
  log_channel_id: string | null;
  welcome_channel_id: string | null;
  athkar_channel_id: string | null;
  ticket_category_id: string | null;
  vip_role_id: string | null;
}> {
  await pool.query(
    "INSERT INTO bot_guild_config (guild_id) VALUES ($1) ON CONFLICT DO NOTHING",
    [guildId]
  );
  const r = await pool.query("SELECT * FROM bot_guild_config WHERE guild_id=$1", [guildId]);
  return r.rows[0];
}

export async function setGuildConfig(
  guildId: string,
  field: "log_channel_id" | "welcome_channel_id" | "athkar_channel_id" | "ticket_category_id" | "vip_role_id",
  value: string | null
): Promise<void> {
  await pool.query(
    "INSERT INTO bot_guild_config (guild_id) VALUES ($1) ON CONFLICT DO NOTHING",
    [guildId]
  );
  await pool.query(`UPDATE bot_guild_config SET ${field}=$1 WHERE guild_id=$2`, [value, guildId]);
}

// ==================== Vault ====================
export async function addToVault(guildId: string, amount: number): Promise<void> {
  await pool.query(
    `INSERT INTO bot_vault (guild_id, balance) VALUES ($1, $2)
     ON CONFLICT (guild_id) DO UPDATE SET balance = bot_vault.balance + $2`,
    [guildId, amount]
  );
}

export async function getVault(guildId: string): Promise<{ balance: number; last_friday_draw: Date | null }> {
  await pool.query("INSERT INTO bot_vault (guild_id) VALUES ($1) ON CONFLICT DO NOTHING", [guildId]);
  const r = await pool.query<{ balance: string; last_friday_draw: Date | null }>(
    "SELECT balance, last_friday_draw FROM bot_vault WHERE guild_id=$1",
    [guildId]
  );
  return { balance: Number(r.rows[0]!.balance), last_friday_draw: r.rows[0]!.last_friday_draw };
}

export async function withdrawFromVault(guildId: string, amount: number): Promise<void> {
  await pool.query("UPDATE bot_vault SET balance = GREATEST(0, balance - $1) WHERE guild_id=$2", [amount, guildId]);
}

export async function markFridayDraw(guildId: string, date: Date): Promise<void> {
  await pool.query("UPDATE bot_vault SET last_friday_draw=$1 WHERE guild_id=$2", [date, guildId]);
}

// ==================== Black Market ====================
export async function getBlackMarket(guildId: string): Promise<{ open_until: Date | null; last_open_date: Date | null }> {
  await pool.query("INSERT INTO bot_black_market (guild_id) VALUES ($1) ON CONFLICT DO NOTHING", [guildId]);
  const r = await pool.query<{ open_until: Date | null; last_open_date: Date | null }>(
    "SELECT open_until, last_open_date FROM bot_black_market WHERE guild_id=$1",
    [guildId]
  );
  return r.rows[0]!;
}

export async function openBlackMarket(guildId: string, durationMs: number): Promise<Date> {
  const until = new Date(Date.now() + durationMs);
  await pool.query(
    `INSERT INTO bot_black_market (guild_id, open_until, last_open_date) VALUES ($1, $2, CURRENT_DATE)
     ON CONFLICT (guild_id) DO UPDATE SET open_until=$2, last_open_date=CURRENT_DATE`,
    [guildId, until]
  );
  return until;
}

export async function isBlackMarketOpen(guildId: string): Promise<boolean> {
  const bm = await getBlackMarket(guildId);
  return !!(bm.open_until && new Date(bm.open_until).getTime() > Date.now());
}

// ==================== Titles ====================
export interface Title {
  name: string;
  icon: string;
  color: number;
}

export function computeTitle(u: BotUser): Title | null {
  const today = new Date().toISOString().slice(0, 10);
  const jailDate = u.jail_count_date ? new Date(u.jail_count_date).toISOString().slice(0, 10) : null;
  const jailToday = jailDate === today ? u.jail_count_today : 0;

  if (jailToday >= 5) return { name: "المنحوس", icon: "💀", color: 0x7f8c8d };
  if (u.steal_streak >= 10) return { name: "السفاح", icon: "🔪", color: 0xc0392b };
  if (Number(u.points) >= 100000) return { name: "الملياردير", icon: "💎", color: 0xf1c40f };
  if (Number(u.voice_seconds) >= 50 * 3600) return { name: "عمدة الفويس", icon: "🎙️", color: 0x9b59b6 };
  return null;
}

export function formatTitle(t: Title | null): string {
  if (!t) return "";
  return `${t.icon} **[${t.name}]** `;
}

/** SQLite-backed mail account and message index. */
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type {
  MailAccount,
  MailAccountStatus,
  MailAuthType,
  MailProvider,
} from '../shared/mail'

type AccountRow = {
  id: string
  provider: MailProvider
  email: string
  display_name: string | null
  auth_type: MailAuthType
  status: MailAccountStatus
  unread: number
  last_sync_at: number | null
  error: string | null
  created_at: number
}

function accountFromRow(row: AccountRow): MailAccount {
  return {
    id: row.id,
    provider: row.provider,
    email: row.email,
    ...(row.display_name ? { displayName: row.display_name } : {}),
    authType: row.auth_type,
    status: row.status,
    unread: row.unread,
    ...(row.last_sync_at ? { lastSyncAt: row.last_sync_at } : {}),
    ...(row.error ? { error: row.error } : {}),
    createdAt: row.created_at,
  }
}

export class MailDatabase {
  private readonly db: DatabaseSync

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS mail_accounts (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        email TEXT NOT NULL,
        display_name TEXT,
        auth_type TEXT NOT NULL,
        status TEXT NOT NULL,
        unread INTEGER NOT NULL DEFAULT 0,
        last_sync_at INTEGER,
        error TEXT,
        created_at INTEGER NOT NULL,
        UNIQUE(provider, email)
      );
      CREATE TABLE IF NOT EXISTS mail_folders (
        account_id TEXT NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        name TEXT NOT NULL,
        delimiter TEXT,
        uid_validity INTEGER,
        uid_next INTEGER,
        unread INTEGER NOT NULL DEFAULT 0,
        total INTEGER NOT NULL DEFAULT 0,
        last_sync_at INTEGER,
        PRIMARY KEY(account_id, path)
      );
      CREATE TABLE IF NOT EXISTS mail_messages (
        account_id TEXT NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,
        folder TEXT NOT NULL,
        uid INTEGER NOT NULL,
        message_id TEXT,
        subject TEXT,
        from_name TEXT,
        from_address TEXT,
        date INTEGER,
        snippet TEXT,
        unread INTEGER NOT NULL DEFAULT 0,
        has_attachments INTEGER NOT NULL DEFAULT 0,
        size INTEGER NOT NULL DEFAULT 0,
        body_text TEXT,
        body_html TEXT,
        cached_at INTEGER NOT NULL,
        PRIMARY KEY(account_id, folder, uid)
      );
      CREATE INDEX IF NOT EXISTS mail_messages_date
        ON mail_messages(account_id, folder, date DESC);
      CREATE TABLE IF NOT EXISTS mail_attachments (
        account_id TEXT NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,
        folder TEXT NOT NULL,
        uid INTEGER NOT NULL,
        part TEXT NOT NULL,
        filename TEXT NOT NULL,
        mime TEXT,
        size INTEGER NOT NULL DEFAULT 0,
        local_path TEXT,
        PRIMARY KEY(account_id, folder, uid, part)
      );
      CREATE TABLE IF NOT EXISTS mail_codes (
        account_id TEXT NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,
        folder TEXT NOT NULL,
        uid INTEGER NOT NULL,
        code TEXT NOT NULL,
        detected_at INTEGER NOT NULL,
        expires_at INTEGER,
        copied_at INTEGER,
        PRIMARY KEY(account_id, folder, uid, code)
      );
      CREATE TABLE IF NOT EXISTS mail_sync_state (
        account_id TEXT NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,
        folder TEXT NOT NULL,
        uid_validity INTEGER,
        last_uid INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(account_id, folder)
      );
    `)
  }

  listAccounts(): MailAccount[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM mail_accounts ORDER BY created_at ASC',
      )
      .all() as unknown as AccountRow[]
    return rows.map(accountFromRow)
  }

  account(id: string): MailAccount | undefined {
    const row = this.db
      .prepare('SELECT * FROM mail_accounts WHERE id = ?')
      .get(id) as unknown as AccountRow | undefined
    return row ? accountFromRow(row) : undefined
  }

  addAccount(input: {
    provider: MailProvider
    email: string
    displayName?: string
  }): MailAccount {
    const existing = this.db
      .prepare(
        'SELECT * FROM mail_accounts WHERE provider = ? AND email = ?',
      )
      .get(input.provider, input.email) as unknown as
      | AccountRow
      | undefined
    if (existing) {
      this.db
        .prepare(
          'UPDATE mail_accounts SET display_name = ?, status = ?, error = NULL WHERE id = ?',
        )
        .run(
          input.displayName?.trim() || existing.display_name,
          'ready',
          existing.id,
        )
      return this.account(existing.id)!
    }
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO mail_accounts
          (id, provider, email, display_name, auth_type, status, unread, created_at)
         VALUES (?, ?, ?, ?, 'password', 'ready', 0, ?)`,
      )
      .run(
        id,
        input.provider,
        input.email,
        input.displayName?.trim() || null,
        Date.now(),
      )
    return this.account(id)!
  }

  updateAccount(
    id: string,
    patch: {
      status?: MailAccountStatus
      unread?: number
      lastSyncAt?: number
      error?: string | null
      displayName?: string | null
    },
  ): void {
    const sets: string[] = []
    const values: (string | number | null)[] = []
    if (patch.status !== undefined) {
      sets.push('status = ?')
      values.push(patch.status)
    }
    if (patch.unread !== undefined) {
      sets.push('unread = ?')
      values.push(Math.max(0, Math.floor(patch.unread)))
    }
    if (patch.lastSyncAt !== undefined) {
      sets.push('last_sync_at = ?')
      values.push(patch.lastSyncAt)
    }
    if (patch.error !== undefined) {
      sets.push('error = ?')
      values.push(patch.error)
    }
    if (patch.displayName !== undefined) {
      sets.push('display_name = ?')
      values.push(patch.displayName)
    }
    if (!sets.length) return
    this.db
      .prepare(`UPDATE mail_accounts SET ${sets.join(', ')} WHERE id = ?`)
      .run(...values, id)
  }

  removeAccount(id: string): void {
    this.db.prepare('DELETE FROM mail_accounts WHERE id = ?').run(id)
  }

  close(): void {
    this.db.close()
  }
}

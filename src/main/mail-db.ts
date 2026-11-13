/** SQLite-backed mail account and message index. */
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type {
  MailAccount,
  MailAccountStatus,
  MailAttachmentInfo,
  MailAuthType,
  MailMessageDetail,
  MailMessageSummary,
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

  /** Removes cached messages older than the cutoff and returns their keys. */
  pruneMessages(
    olderThan: number,
  ): Array<{ accountId: string; folder: string; uid: number }> {
    const rows = this.db
      .prepare(
        `SELECT account_id, folder, uid FROM mail_messages
         WHERE COALESCE(date, cached_at) < ?`,
      )
      .all(olderThan) as unknown as Array<{
      account_id: string
      folder: string
      uid: number
    }>
    if (!rows.length) return []
    const deleteAttachments = this.db.prepare(
      'DELETE FROM mail_attachments WHERE account_id = ? AND folder = ? AND uid = ?',
    )
    const deleteCodes = this.db.prepare(
      'DELETE FROM mail_codes WHERE account_id = ? AND folder = ? AND uid = ?',
    )
    const deleteMessage = this.db.prepare(
      'DELETE FROM mail_messages WHERE account_id = ? AND folder = ? AND uid = ?',
    )
    this.db.exec('BEGIN')
    try {
      for (const row of rows) {
        deleteAttachments.run(row.account_id, row.folder, row.uid)
        deleteCodes.run(row.account_id, row.folder, row.uid)
        deleteMessage.run(row.account_id, row.folder, row.uid)
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return rows.map((row) => ({
      accountId: row.account_id,
      folder: row.folder,
      uid: row.uid,
    }))
  }

  upsertMessages(
    accountId: string,
    folder: string,
    messages: MailMessageSummary[],
  ): void {
    const statement = this.db.prepare(`
      INSERT INTO mail_messages
        (account_id, folder, uid, message_id, subject, from_name, from_address,
         date, snippet, unread, has_attachments, size, cached_at)
      VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      ON CONFLICT(account_id, folder, uid) DO UPDATE SET
        subject = excluded.subject,
        from_name = excluded.from_name,
        from_address = excluded.from_address,
        date = excluded.date,
        snippet = excluded.snippet,
        unread = excluded.unread,
        has_attachments = excluded.has_attachments,
        cached_at = excluded.cached_at
    `)
    for (const message of messages) {
      statement.run(
        accountId,
        folder,
        message.uid,
        message.subject,
        message.fromName ?? null,
        message.fromAddress ?? null,
        message.date ?? null,
        message.snippet ?? '',
        message.unread ? 1 : 0,
        message.hasAttachments ? 1 : 0,
        Date.now(),
      )
    }
  }

  listMessages(
    accountId: string,
    folder = 'INBOX',
    limit = 50,
  ): MailMessageSummary[] {
    const rows = this.db
      .prepare(
        `SELECT uid, subject, from_name, from_address, date, snippet,
                unread, has_attachments
         FROM mail_messages
         WHERE account_id = ? AND folder = ?
         ORDER BY date DESC, uid DESC
         LIMIT ?`,
      )
      .all(accountId, folder, limit) as unknown as Array<{
      uid: number
      subject: string | null
      from_name: string | null
      from_address: string | null
      date: number | null
      snippet: string | null
      unread: number
      has_attachments: number
    }>
    return rows.map((row) => ({
      uid: row.uid,
      subject: row.subject || '(无主题)',
      ...(row.from_name ? { fromName: row.from_name } : {}),
      ...(row.from_address ? { fromAddress: row.from_address } : {}),
      ...(row.date ? { date: row.date } : {}),
      ...(row.snippet ? { snippet: row.snippet } : {}),
      unread: Boolean(row.unread),
      hasAttachments: Boolean(row.has_attachments),
    }))
  }

  clearDetails(): void {
    this.db.exec(`
      UPDATE mail_messages
      SET body_text = NULL, body_html = NULL, snippet = NULL;
      DELETE FROM mail_attachments;
      DELETE FROM mail_codes;
    `)
  }

  countMessages(accountId: string, folder = 'INBOX'): number {
    const row = this.db
      .prepare(
        'SELECT COUNT(*) AS count FROM mail_messages WHERE account_id = ? AND folder = ?',
      )
      .get(accountId, folder) as unknown as { count: number }
    return row.count
  }

  oldestUid(accountId: string, folder = 'INBOX'): number | undefined {
    const row = this.db
      .prepare(
        'SELECT MIN(uid) AS uid FROM mail_messages WHERE account_id = ? AND folder = ?',
      )
      .get(accountId, folder) as unknown as { uid: number | null }
    return row.uid ?? undefined
  }

  searchMessages(
    accountId: string,
    folder: string,
    query: string,
    limit = 500,
  ): MailMessageSummary[] {
    const term = query.trim().toLowerCase()
    if (!term) return this.listMessages(accountId, folder, limit)
    const rows = this.db
      .prepare(
        `SELECT uid, subject, from_name, from_address, date, snippet,
                unread, has_attachments
         FROM mail_messages
         WHERE account_id = ? AND folder = ?
           AND (INSTR(LOWER(COALESCE(subject, '')), ?) > 0
             OR INSTR(LOWER(COALESCE(from_name, '')), ?) > 0
             OR INSTR(LOWER(COALESCE(from_address, '')), ?) > 0
             OR INSTR(LOWER(COALESCE(snippet, '')), ?) > 0)
         ORDER BY date DESC, uid DESC
         LIMIT ?`,
      )
      .all(accountId, folder, term, term, term, term, limit) as unknown as Array<{
      uid: number
      subject: string | null
      from_name: string | null
      from_address: string | null
      date: number | null
      snippet: string | null
      unread: number
      has_attachments: number
    }>
    return rows.map((row) => ({
      uid: row.uid,
      subject: row.subject || '(无主题)',
      ...(row.from_name ? { fromName: row.from_name } : {}),
      ...(row.from_address ? { fromAddress: row.from_address } : {}),
      ...(row.date ? { date: row.date } : {}),
      ...(row.snippet ? { snippet: row.snippet } : {}),
      unread: Boolean(row.unread),
      hasAttachments: Boolean(row.has_attachments),
    }))
  }

  message(
    accountId: string,
    folder: string,
    uid: number,
  ): MailMessageDetail | undefined {
    const row = this.db
      .prepare(
        `SELECT uid, subject, from_name, from_address, date, snippet,
                unread, has_attachments, body_text, body_html
         FROM mail_messages
         WHERE account_id = ? AND folder = ? AND uid = ?`,
      )
      .get(accountId, folder, uid) as unknown as
      | {
          uid: number
          subject: string | null
          from_name: string | null
          from_address: string | null
          date: number | null
          snippet: string | null
          unread: number
          has_attachments: number
          body_text: string | null
          body_html: string | null
        }
      | undefined
    if (!row) return undefined
    const attachments = this.db
      .prepare(
        `SELECT part, filename, mime, size, local_path
         FROM mail_attachments
         WHERE account_id = ? AND folder = ? AND uid = ?
         ORDER BY part ASC`,
      )
      .all(accountId, folder, uid) as unknown as Array<{
      part: string
      filename: string
      mime: string | null
      size: number
      local_path: string | null
    }>
    const codeRow = this.db
      .prepare(
        `SELECT code, expires_at FROM mail_codes
         WHERE account_id = ? AND folder = ? AND uid = ?
         ORDER BY detected_at DESC LIMIT 1`,
      )
      .get(accountId, folder, uid) as unknown as
      | { code: string; expires_at: number | null }
      | undefined
    const superseded =
      Boolean(codeRow?.code) && row.from_address && row.date
        ? Boolean(
            this.db
              .prepare(
                `SELECT 1 FROM mail_codes newer
                 JOIN mail_messages newer_message
                   ON newer_message.account_id = newer.account_id
                  AND newer_message.folder = newer.folder
                  AND newer_message.uid = newer.uid
                 WHERE newer.account_id = ? AND newer.folder = ?
                   AND LOWER(newer_message.from_address) = LOWER(?)
                   AND (newer_message.date > ? OR
                        (newer_message.date = ? AND newer.uid > ?))
                 LIMIT 1`,
              )
              .get(
                accountId,
                folder,
                row.from_address,
                row.date,
                row.date,
                uid,
              ),
          )
        : false
    return {
      uid: row.uid,
      subject: row.subject || '(无主题)',
      ...(row.from_name ? { fromName: row.from_name } : {}),
      ...(row.from_address ? { fromAddress: row.from_address } : {}),
      ...(row.date ? { date: row.date } : {}),
      ...(row.snippet ? { snippet: row.snippet } : {}),
      unread: Boolean(row.unread),
      hasAttachments: Boolean(row.has_attachments),
      ...(row.body_text ? { bodyText: row.body_text } : {}),
      ...(row.body_html ? { bodyHtml: row.body_html } : {}),
      ...(codeRow?.code
        ? {
            code: codeRow.code,
            ...(codeRow.expires_at
              ? { codeExpiresAt: codeRow.expires_at }
              : {}),
            ...(superseded ? { codeSuperseded: true } : {}),
          }
        : {}),
      attachments: attachments.map((item) => ({
        part: item.part,
        filename: item.filename,
        size: item.size,
        ...(item.mime ? { mime: item.mime } : {}),
        ...(item.local_path ? { localPath: item.local_path } : {}),
      })),
    }
  }

  saveMessageDetail(
    accountId: string,
    folder: string,
    uid: number,
    detail: {
      bodyText?: string
      bodyHtml?: string
      snippet?: string
      code?: string
      codeExpiresAt?: number
      attachments: MailAttachmentInfo[]
    },
  ): void {
    this.db
      .prepare(
        `UPDATE mail_messages
         SET body_text = ?, body_html = ?, snippet = ?, has_attachments = ?
         WHERE account_id = ? AND folder = ? AND uid = ?`,
      )
      .run(
        detail.bodyText ?? null,
        detail.bodyHtml ?? null,
        detail.snippet ?? null,
        detail.attachments.length ? 1 : 0,
        accountId,
        folder,
        uid,
      )
    this.db
      .prepare(
        'DELETE FROM mail_attachments WHERE account_id = ? AND folder = ? AND uid = ?',
      )
      .run(accountId, folder, uid)
    const insert = this.db.prepare(
      `INSERT INTO mail_attachments
        (account_id, folder, uid, part, filename, mime, size, local_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const attachment of detail.attachments)
      insert.run(
        accountId,
        folder,
        uid,
        attachment.part,
        attachment.filename,
        attachment.mime ?? null,
        attachment.size,
        attachment.localPath ?? null,
      )
    this.db
      .prepare(
        `DELETE FROM mail_codes WHERE account_id = ? AND folder = ? AND uid = ?`,
      )
      .run(accountId, folder, uid)
    if (detail.code)
      this.db
        .prepare(
          `INSERT INTO mail_codes
            (account_id, folder, uid, code, detected_at, expires_at, copied_at)
           VALUES (?, ?, ?, ?, ?, ?, NULL)`,
        )
        .run(
          accountId,
          folder,
          uid,
          detail.code,
          Date.now(),
          detail.codeExpiresAt ?? null,
        )
  }

  setUnread(
    accountId: string,
    folder: string,
    uid: number,
    unread: boolean,
  ): void {
    this.db
      .prepare(
        'UPDATE mail_messages SET unread = ? WHERE account_id = ? AND folder = ? AND uid = ?',
      )
      .run(unread ? 1 : 0, accountId, folder, uid)
  }

  attachment(
    accountId: string,
    folder: string,
    uid: number,
    part: string,
  ): MailAttachmentInfo | undefined {
    const row = this.db
      .prepare(
        `SELECT part, filename, mime, size, local_path
         FROM mail_attachments
         WHERE account_id = ? AND folder = ? AND uid = ? AND part = ?`,
      )
      .get(accountId, folder, uid, part) as unknown as
      | {
          part: string
          filename: string
          mime: string | null
          size: number
          local_path: string | null
        }
      | undefined
    if (!row) return undefined
    return {
      part: row.part,
      filename: row.filename,
      size: row.size,
      ...(row.mime ? { mime: row.mime } : {}),
      ...(row.local_path ? { localPath: row.local_path } : {}),
    }
  }

  close(): void {
    this.db.close()
  }
}

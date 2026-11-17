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
  MailDraft,
  MailDraftAttachment,
  MailDraftSummary,
  MailFolder,
  MailFolderKind,
  MailMessageDetail,
  MailMessageSummary,
  MailProvider,
} from '../shared/mail'
import { mailBodyVersion } from './mail-html'

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

  /** Flush the WAL so a file-level backup sees a consistent database. */
  checkpoint(): void {
    this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  }

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
        kind TEXT NOT NULL DEFAULT 'other',
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
        body_version INTEGER NOT NULL DEFAULT 0,
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
      CREATE TABLE IF NOT EXISTS mail_contacts (
        address TEXT PRIMARY KEY COLLATE NOCASE,
        name TEXT,
        last_used_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS mail_drafts (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,
        to_addr TEXT NOT NULL DEFAULT '',
        cc_addr TEXT NOT NULL DEFAULT '',
        bcc_addr TEXT NOT NULL DEFAULT '',
        subject TEXT NOT NULL DEFAULT '',
        body_text TEXT NOT NULL DEFAULT '',
        body_html TEXT NOT NULL DEFAULT '',
        attachments TEXT NOT NULL DEFAULT '[]',
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS mail_drafts_updated
        ON mail_drafts(account_id, updated_at DESC);
      CREATE TABLE IF NOT EXISTS mail_sync_state (
        account_id TEXT NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,
        folder TEXT NOT NULL,
        uid_validity INTEGER,
        last_uid INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(account_id, folder)
      );
    `)
    try {
      this.db.exec(
        "ALTER TABLE mail_folders ADD COLUMN kind TEXT NOT NULL DEFAULT 'other'",
      )
    } catch {
      /* column already exists */
    }
    try {
      this.db.exec(
        'ALTER TABLE mail_messages ADD COLUMN body_version INTEGER NOT NULL DEFAULT 0',
      )
    } catch {
      /* column already exists */
    }
    const version = this.db
      .prepare('PRAGMA user_version')
      .get() as unknown as { user_version: number }
    if ((version?.user_version ?? 0) < 1) {
      // Earlier builds opened INBOX while storing results under the selected
      // folder, polluting non-INBOX caches with INBOX copies.
      this.db.exec(`
        DELETE FROM mail_attachments WHERE folder <> 'INBOX';
        DELETE FROM mail_codes WHERE folder <> 'INBOX';
        DELETE FROM mail_messages WHERE folder <> 'INBOX';
        PRAGMA user_version = 1;
      `)
    }
    if ((version?.user_version ?? 0) < 2) {
      // Bodies cached before version 2 lost links and table styling during
      // sanitisation. They are refetched lazily when opened.
      this.db.exec('PRAGMA user_version = 2')
    }
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

  replaceFolders(accountId: string, folders: MailFolder[]): void {
    this.db.exec('BEGIN')
    try {
      this.db
        .prepare('DELETE FROM mail_folders WHERE account_id = ?')
        .run(accountId)
      const insert = this.db.prepare(
        `INSERT INTO mail_folders
          (account_id, path, name, kind, unread, total, last_sync_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      const now = Date.now()
      for (const folder of folders) {
        insert.run(
          accountId,
          folder.path,
          folder.name,
          folder.kind,
          Math.max(0, folder.unread),
          Math.max(0, folder.total),
          now,
        )
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  updateFolder(
    accountId: string,
    path: string,
    unread: number,
    total: number,
  ): void {
    this.db
      .prepare(
        `UPDATE mail_folders
         SET unread = ?, total = ?, last_sync_at = ?
         WHERE account_id = ? AND path = ?`,
      )
      .run(
        Math.max(0, unread),
        Math.max(0, total),
        Date.now(),
        accountId,
        path,
      )
  }

  listFolders(accountId: string): MailFolder[] {
    const rows = this.db
      .prepare(
        `SELECT path, name, kind, unread, total
         FROM mail_folders
         WHERE account_id = ?
         ORDER BY CASE kind
           WHEN 'inbox' THEN 0
           WHEN 'sent' THEN 1
           WHEN 'drafts' THEN 2
           WHEN 'archive' THEN 3
           WHEN 'junk' THEN 4
           WHEN 'trash' THEN 5
           WHEN 'all' THEN 6
           ELSE 7
         END, name ASC`,
      )
      .all(accountId) as unknown as Array<{
      path: string
      name: string
      kind: MailFolderKind
      unread: number
      total: number
    }>
    return rows.map((row) => ({
      path: row.path,
      name: row.name,
      kind: row.kind,
      unread: row.unread,
      total: row.total,
    }))
  }

  /** Removes cached messages older than the cutoff and returns their keys. */
  pruneMessages(
    olderThan: number,
    keepPerFolder = 500,
  ): Array<{ accountId: string; folder: string; uid: number }> {
    // Retention trims the long tail, but never empties a folder: keep the
    // newest cached page(s) so old folders and "load more" remain usable.
    const rows = this.db
      .prepare(
        `SELECT account_id, folder, uid, COALESCE(date, cached_at) AS stamp
         FROM mail_messages
         ORDER BY account_id ASC, folder ASC, stamp DESC, uid DESC`,
      )
      .all() as unknown as Array<{
      account_id: string
      folder: string
      uid: number
      stamp: number
    }>
    const rank = new Map<string, number>()
    const selected = rows.filter((row) => {
      const key = `${row.account_id}\u0000${row.folder}`
      const position = (rank.get(key) ?? 0) + 1
      rank.set(key, position)
      return row.stamp < olderThan && position > keepPerFolder
    })
    if (!selected.length) return []
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
      for (const row of selected) {
        deleteAttachments.run(row.account_id, row.folder, row.uid)
        deleteCodes.run(row.account_id, row.folder, row.uid)
        deleteMessage.run(row.account_id, row.folder, row.uid)
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return selected.map((row) => ({
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

  removeMessage(accountId: string, folder: string, uid: number): void {
    this.db.exec('BEGIN')
    try {
      this.db
        .prepare(
          'DELETE FROM mail_attachments WHERE account_id = ? AND folder = ? AND uid = ?',
        )
        .run(accountId, folder, uid)
      this.db
        .prepare(
          'DELETE FROM mail_codes WHERE account_id = ? AND folder = ? AND uid = ?',
        )
        .run(accountId, folder, uid)
      this.db
        .prepare(
          'DELETE FROM mail_messages WHERE account_id = ? AND folder = ? AND uid = ?',
        )
        .run(accountId, folder, uid)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  clearDetails(): void {
    this.db.exec(`
      UPDATE mail_messages
      SET body_text = NULL, body_html = NULL, snippet = NULL;
      DELETE FROM mail_attachments;
      DELETE FROM mail_codes;
    `)
  }

  recordContacts(addresses: Array<{ address: string; name?: string }>): void {
    const statement = this.db.prepare(
      `INSERT INTO mail_contacts (address, name, last_used_at)
       VALUES (?, ?, ?)
       ON CONFLICT(address) DO UPDATE SET
         name = COALESCE(excluded.name, mail_contacts.name),
         last_used_at = excluded.last_used_at`,
    )
    const now = Date.now()
    for (const contact of addresses) {
      const address = contact.address.trim()
      if (!address) continue
      statement.run(address, contact.name?.trim() || null, now)
    }
  }

  contacts(limit = 50): Array<{ name?: string; address: string }> {
    const rows = this.db
      .prepare(
        `SELECT address, name, latest FROM (
           SELECT LOWER(from_address) AS address,
                  MAX(from_name) AS name,
                  MAX(date) AS latest
           FROM mail_messages
           WHERE from_address IS NOT NULL AND from_address <> ''
           GROUP BY LOWER(from_address)
           UNION ALL
           SELECT LOWER(address) AS address, name, last_used_at AS latest
           FROM mail_contacts
         )
         GROUP BY address
         ORDER BY latest DESC, address ASC
         LIMIT ?`,
      )
      .all(limit) as unknown as Array<{
      name: string | null
      address: string
    }>
    return rows.map((row) => ({
      ...(row.name ? { name: row.name } : {}),
      address: row.address,
    }))
  }

  countMessages(accountId: string, folder = 'INBOX'): number {
    const row = this.db
      .prepare(
        'SELECT COUNT(*) AS count FROM mail_messages WHERE account_id = ? AND folder = ?',
      )
      .get(accountId, folder) as unknown as { count: number }
    return row.count
  }

  hasMessage(accountId: string, folder: string, uid: number): boolean {
    return Boolean(
      this.db
        .prepare(
          'SELECT 1 FROM mail_messages WHERE account_id = ? AND folder = ? AND uid = ?',
        )
        .get(accountId, folder, uid),
    )
  }

  saveDraft(input: {
    id: string
    accountId: string
    to: string
    cc: string
    bcc: string
    subject: string
    bodyText: string
    bodyHtml: string
    attachments: MailDraftAttachment[]
  }): MailDraft {
    this.db
      .prepare(
        `INSERT INTO mail_drafts
          (id, account_id, to_addr, cc_addr, bcc_addr, subject,
           body_text, body_html, attachments, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           account_id = excluded.account_id,
           to_addr = excluded.to_addr,
           cc_addr = excluded.cc_addr,
           bcc_addr = excluded.bcc_addr,
           subject = excluded.subject,
           body_text = excluded.body_text,
           body_html = excluded.body_html,
           attachments = excluded.attachments,
           updated_at = excluded.updated_at`,
      )
      .run(
        input.id,
        input.accountId,
        input.to,
        input.cc,
        input.bcc,
        input.subject,
        input.bodyText,
        input.bodyHtml,
        JSON.stringify(input.attachments),
        Date.now(),
      )
    return this.draft(input.id)!
  }

  draft(id: string): MailDraft | undefined {
    const row = this.db
      .prepare('SELECT * FROM mail_drafts WHERE id = ?')
      .get(id) as unknown as
      | {
          id: string
          account_id: string
          to_addr: string
          cc_addr: string
          bcc_addr: string
          subject: string
          body_text: string
          body_html: string
          attachments: string
          updated_at: number
        }
      | undefined
    if (!row) return undefined
    return {
      id: row.id,
      accountId: row.account_id,
      to: row.to_addr,
      cc: row.cc_addr,
      bcc: row.bcc_addr,
      subject: row.subject,
      bodyText: row.body_text,
      bodyHtml: row.body_html,
      attachments: this.draftAttachments(row.attachments),
      updatedAt: row.updated_at,
    }
  }

  listDrafts(accountId?: string): MailDraftSummary[] {
    const rows = this.db
      .prepare(
        `SELECT id, account_id, to_addr, subject, attachments, updated_at
         FROM mail_drafts
         ${accountId ? 'WHERE account_id = ?' : ''}
         ORDER BY updated_at DESC`,
      )
      .all(...(accountId ? [accountId] : [])) as unknown as Array<{
      id: string
      account_id: string
      to_addr: string
      subject: string
      attachments: string
      updated_at: number
    }>
    return rows.map((row) => ({
      id: row.id,
      accountId: row.account_id,
      to: row.to_addr,
      subject: row.subject,
      attachmentCount: this.draftAttachments(row.attachments).length,
      updatedAt: row.updated_at,
    }))
  }

  removeDraft(id: string): void {
    this.db.prepare('DELETE FROM mail_drafts WHERE id = ?').run(id)
  }

  private draftAttachments(value: string): MailDraftAttachment[] {
    try {
      const parsed = JSON.parse(value) as unknown
      if (!Array.isArray(parsed)) return []
      return parsed.filter(
        (item): item is MailDraftAttachment =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as MailDraftAttachment).path === 'string' &&
          typeof (item as MailDraftAttachment).name === 'string' &&
          typeof (item as MailDraftAttachment).size === 'number',
      )
    } catch {
      return []
    }
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

  isMessageBodyCurrent(accountId: string, folder: string, uid: number): boolean {
    const row = this.db
      .prepare(
        `SELECT body_version
         FROM mail_messages
         WHERE account_id = ? AND folder = ? AND uid = ?`,
      )
      .get(accountId, folder, uid) as unknown as
      | { body_version: number }
      | undefined
    return Boolean(row && row.body_version >= mailBodyVersion)
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
         SET body_text = ?, body_html = ?, body_version = ?, snippet = ?,
             has_attachments = ?
         WHERE account_id = ? AND folder = ? AND uid = ?`,
      )
      .run(
        detail.bodyText ?? null,
        detail.bodyHtml ?? null,
        mailBodyVersion,
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

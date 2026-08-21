import type { App } from "obsidian";
import { normalizePath, TFile } from "obsidian";
import { sanitizeTaskId } from "../utils/taskId";

/** Where task attachments are stored — a normal, visible, indexed vault folder (unlike `.task-details/`). */
const ATTACHMENTS_FOLDER = "Attachments/Tasks";

/** Map an image MIME type to a file extension; falls back to the source filename, then "png". */
function extensionFor(file: File): string {
  const byMime: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/bmp": "bmp",
  };
  if (byMime[file.type]) {
    return byMime[file.type];
  }
  const fromName = file.name.match(/\.([a-zA-Z0-9]+)$/)?.[1];
  return fromName ? fromName.toLowerCase() : "png";
}

/** `YYYYMMDD-HHMMSS`, matching the naming convention in the spec (e.g. `DIG-12345-20260821-141501.png`). */
function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/**
 * Saves/removes task attachments (pasted or dropped images) as regular,
 * visible vault files under {@link ATTACHMENTS_FOLDER} — unlike
 * {@link TaskDetailsRepository}'s hidden sidecar files, these are meant to be
 * found, searched, and embedded like any other vault attachment.
 *
 * Centralises all attachment path-building so nothing else constructs a path
 * under this folder by hand: names are always sanitised (no path traversal)
 * and always unique (never overwrites an existing file).
 */
export class TaskAttachmentService {
  constructor(private readonly app: App) {}

  /**
   * Save `file` under a unique, sanitised name prefixed by `idPrefix` (the
   * task's Jira id if it has one, otherwise its Task id — see
   * {@link TaskDetailsModal}). Returns the vault-relative path written.
   */
  async saveAttachment(file: File, idPrefix: string): Promise<string> {
    const folder = normalizePath(ATTACHMENTS_FOLDER);
    await this.ensureFolder(folder);

    const safePrefix = sanitizeTaskId(idPrefix) ?? "attachment";
    const ext = extensionFor(file);
    const baseName = `${safePrefix}-${formatTimestamp(new Date())}`;
    const path = await this.uniquePath(folder, baseName, ext);

    const buffer = await file.arrayBuffer();
    await this.app.vault.createBinary(path, buffer);
    return path;
  }

  /** A `src` usable in an `<img>` tag for a vault-relative attachment path. */
  resourcePathFor(path: string): string {
    return this.app.vault.adapter.getResourcePath(normalizePath(path));
  }

  /**
   * Whether any other (indexed) note in the vault embeds/links this file.
   * Used to warn before deleting the file itself, rather than just its
   * reference on one task — see {@link deleteFile}.
   */
  isReferencedElsewhere(path: string, excludingSource?: string): boolean {
    const resolvedLinks = this.app.metadataCache.resolvedLinks;
    for (const [source, targets] of Object.entries(resolvedLinks)) {
      if (source === excludingSource) {
        continue;
      }
      if (targets[path]) {
        return true;
      }
    }
    return false;
  }

  /**
   * Permanently remove the attachment file from the vault (moved to
   * Obsidian's own trash, so still recoverable there). Callers are expected
   * to have already confirmed with the user — this plugin never deletes an
   * attachment file just because one task stopped referencing it; see the
   * modal's "remove" (reference-only) vs. "delete file" (this) distinction.
   */
  async deleteFile(path: string): Promise<boolean> {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!(file instanceof TFile)) {
      return false;
    }
    // FileManager.trashFile (not Vault.trash) so this respects the user's own
    // "deleted files go to" preference (system trash / .trash / permanent).
    await this.app.fileManager.trashFile(file);
    return true;
  }

  private async ensureFolder(folder: string): Promise<void> {
    if (!(await this.app.vault.adapter.exists(folder))) {
      await this.app.vault.createFolder(folder);
    }
  }

  /** Find a path under `folder` that doesn't already exist, appending `-1`, `-2`, … on collision. */
  private async uniquePath(
    folder: string,
    baseName: string,
    ext: string,
  ): Promise<string> {
    let candidate = normalizePath(`${folder}/${baseName}.${ext}`);
    let counter = 1;
    while (await this.app.vault.adapter.exists(candidate)) {
      candidate = normalizePath(`${folder}/${baseName}-${counter}.${ext}`);
      counter++;
    }
    return candidate;
  }
}

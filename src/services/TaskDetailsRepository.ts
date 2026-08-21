import type { App } from "obsidian";
import { normalizePath } from "obsidian";
import { emptyTaskDetails, type TaskDetails } from "../types/TaskDetails";
import { sanitizeTaskId } from "../utils/taskId";

/**
 * Folder for this plugin's per-task sidecar files, one `<task id>.md` per
 * task that has extra metadata (Jira, notes, or attachments). Dot-prefixed
 * so Obsidian's File Explorer and vault index (search, backlinks, graph)
 * leave it alone — the same convention `.obsidian` itself and other plugins'
 * data folders use — while the files remain plain Markdown on disk, readable
 * and portable even without this plugin installed.
 */
const DETAILS_FOLDER = ".task-details";

const NOTES_HEADING = "## Observações";
const ATTACHMENTS_HEADING = "## Anexos";

/**
 * Serialize a {@link TaskDetails} record to the sidecar file format:
 * frontmatter (`task_id`, optional `jira`) followed by an Observações section
 * and an Anexos section (each omitted when empty, so a record with only a
 * Jira link doesn't grow a blank "## Anexos" heading).
 */
export function serializeTaskDetails(details: TaskDetails): string {
  const frontmatter = ["---", `task_id: ${details.taskId}`];
  if (details.jira) {
    frontmatter.push(`jira: ${details.jira}`);
  }
  frontmatter.push("---", "");

  const sections: string[] = [];
  if (details.notes.trim()) {
    sections.push(`${NOTES_HEADING}\n\n${details.notes.trim()}`);
  }
  if (details.attachments.length > 0) {
    const embeds = details.attachments.map((path) => `![[${path}]]`).join("\n");
    sections.push(`${ATTACHMENTS_HEADING}\n\n${embeds}`);
  }

  return `${frontmatter.join("\n")}\n${sections.join("\n\n")}\n`;
}

/**
 * Parse a sidecar file back into a {@link TaskDetails} record. Tolerant of a
 * missing/malformed frontmatter block or missing sections — anything that
 * can't be read falls back to the empty value for that field, so a
 * hand-edited file never throws.
 */
export function parseTaskDetails(
  raw: string,
  fallbackTaskId: string,
): TaskDetails {
  const details = emptyTaskDetails(fallbackTaskId);

  const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const body = frontmatterMatch ? raw.slice(frontmatterMatch[0].length) : raw;

  if (frontmatterMatch) {
    for (const line of frontmatterMatch[1].split("\n")) {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex === -1) continue;
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      if (key === "task_id" && value) {
        details.taskId = value;
      } else if (key === "jira" && value) {
        details.jira = value;
      }
    }
  }

  details.notes = extractSection(body, NOTES_HEADING);

  const attachmentsSection = extractSection(body, ATTACHMENTS_HEADING);
  details.attachments = [
    ...attachmentsSection.matchAll(/!\[\[([^\]]+)\]\]/g),
  ].map((m) => m[1]);

  return details;
}

/** Extract the content of a `## Heading` section, up to the next `## ` heading or end of text. */
function extractSection(body: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(
    new RegExp(`${escaped}\\n+([\\s\\S]*?)(?:\\n## |$)`),
  );
  return match ? match[1].trim() : "";
}

/**
 * Reads/writes this plugin's per-task sidecar files (Jira, notes,
 * attachments — everything kept off the task's own line). All direct
 * filesystem access for this data lives here; nothing else touches
 * `.task-details/` directly.
 *
 * Uses {@link App.vault}'s raw `adapter` rather than the indexed `Vault` API,
 * matching how this plugin already reads the Tasks plugin's own hidden
 * `data.json` (see {@link TasksIntegration.readStatusSettingsFromFile}) —
 * files under a dot-folder generally aren't tracked as `TFile`s.
 */
export class TaskDetailsRepository {
  constructor(private readonly app: App) {}

  private pathFor(taskId: string): string | null {
    const safe = sanitizeTaskId(taskId);
    if (!safe) {
      return null;
    }
    return normalizePath(`${DETAILS_FOLDER}/${safe}.md`);
  }

  /** Load one task's details, or an empty record if it has none stored yet (or its id is unusable as a path). */
  async get(taskId: string): Promise<TaskDetails> {
    const path = this.pathFor(taskId);
    if (!path) {
      return emptyTaskDetails(taskId);
    }
    try {
      const raw = await this.app.vault.adapter.read(path);
      return parseTaskDetails(raw, taskId);
    } catch {
      return emptyTaskDetails(taskId);
    }
  }

  /** Persist a task's details, creating the sidecar folder on first use. */
  async save(details: TaskDetails): Promise<void> {
    const path = this.pathFor(details.taskId);
    if (!path) {
      throw new Error(
        `Cannot store task details: invalid task id "${details.taskId}"`,
      );
    }
    const folder = normalizePath(DETAILS_FOLDER);
    if (!(await this.app.vault.adapter.exists(folder))) {
      await this.app.vault.adapter.mkdir(folder);
    }
    await this.app.vault.adapter.write(path, serializeTaskDetails(details));
  }

  /**
   * Load every stored record at once, keyed by task id — for the board to do
   * cheap per-card badge lookups without one file read per card. Skips (does
   * not throw on) any file that can't be read or isn't Markdown.
   */
  async getAll(): Promise<Map<string, TaskDetails>> {
    const result = new Map<string, TaskDetails>();
    const folder = normalizePath(DETAILS_FOLDER);
    if (!(await this.app.vault.adapter.exists(folder))) {
      return result;
    }

    const { files } = await this.app.vault.adapter.list(folder);
    for (const filePath of files) {
      if (!filePath.endsWith(".md")) {
        continue;
      }
      const basename = filePath.slice(
        filePath.lastIndexOf("/") + 1,
        -".md".length,
      );
      try {
        const raw = await this.app.vault.adapter.read(filePath);
        result.set(basename, parseTaskDetails(raw, basename));
      } catch {
        // Skip an unreadable/corrupt sidecar file rather than fail the whole board.
      }
    }
    return result;
  }
}

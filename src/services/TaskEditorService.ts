import { type App, TFile } from "obsidian";
import type { Task } from "./TasksIntegration";
import type { TasksIntegration } from "./TasksIntegration";
import {
  FIELD_SYNTAX,
  PRIORITY_DATAVIEW_WORD,
  PRIORITY_EMOJI,
  PRIORITY_STRIP_DATAVIEW,
  PRIORITY_STRIP_EMOJI,
  resolveTaskFormat,
} from "../utils/taskFormat";

/**
 * The set of Tasks-native fields {@link TaskEditorService.saveTaskFields} can
 * write. A field is only touched when its key is present on the edits object
 * (so callers can update a subset without clobbering the rest) — `null` means
 * "clear this field", `undefined`/absent means "leave as-is".
 */
export interface TaskFieldEdits {
  /** New status symbol (e.g. "x"). Delegated to {@link TaskUpdater} so the
   *  done/cancelled-date bookkeeping isn't duplicated. */
  statusSymbol?: string;
  /** New description text (metadata suffix — dates, priority, id, tags in the
   *  trailing position — is preserved untouched). */
  description?: string;
  /** 0 (Highest) … 5 (Lowest); `null`/`3` clears the priority. */
  priority?: number | null;
  /** `YYYY-MM-DD`, or `null` to clear the due date. */
  dueDate?: string | null;
  /** Task id to write (see {@link TaskDetailsRepository}); `null` clears it. */
  id?: string | null;
}

const TASK_LINE_RE = /^(\s*- \[)[^\]]*(\]\s*.*)$/;

/** Emoji signifiers that start a metadata field, in the order Tasks documents. */
const EMOJI_FIELD_MARKERS = [..."🔺⏫🔼🔽⏬➕🛫⏳📅✅❌🔁🏁🆔⛔"];

/** Dataview inline-field keys Tasks recognises. */
const DATAVIEW_FIELD_KEYS = [
  "priority",
  "repeat",
  "onCompletion",
  "id",
  "dependsOn",
  "created",
  "scheduled",
  "start",
  "due",
  "completion",
  "cancelled",
];

/**
 * Matches the start of the first metadata field in a task's body (the part
 * after `- [x] `): either a known emoji signifier or a Dataview
 * `[key:: …]`/`(key:: …)` field. Built as an alternation of literal emoji
 * (not a `[...]` class) because several signifiers are outside the BMP — see
 * {@link PRIORITY_STRIP_EMOJI} for why that matters.
 */
const METADATA_START_RE = new RegExp(
  `(?:${EMOJI_FIELD_MARKERS.join("|")})` +
    `|(?:[[(]\\s*(?:${DATAVIEW_FIELD_KEYS.join("|")})\\s*::)`,
);

/**
 * Split a task line's body (everything after the checkbox) into the
 * description and the trailing metadata block, using the first recognised
 * field marker as the boundary. Tags (`#tag`) are never a boundary — they're
 * part of the description, consistent with how Tasks itself treats them.
 */
function splitBody(body: string): { description: string; trailing: string } {
  const match = body.match(METADATA_START_RE);
  if (!match || match.index === undefined) {
    return { description: body.trim(), trailing: "" };
  }
  return {
    description: body.slice(0, match.index).trim(),
    trailing: body.slice(match.index),
  };
}

/**
 * Service for editing Tasks-native fields (title, priority, due date, id,
 * status) directly on a task's source line — the counterpart to
 * {@link TaskUpdater} (status-only, used by drag & drop) for the full-detail
 * modal. Centralises all direct Markdown editing so no other component needs
 * to touch a task line by hand.
 */
export class TaskEditorService {
  constructor(
    private readonly app: App,
    private readonly tasksIntegration: TasksIntegration,
  ) {}

  /**
   * Apply `edits` to `task`'s source line. A status-symbol change is
   * delegated to {@link TaskUpdater.updateTaskStatus} (reused, not
   * duplicated, so done/cancelled-date handling stays in one place); any
   * other requested fields are then applied in a single read-modify-write.
   *
   * Returns false if the task's line can no longer be found/matched, or if
   * the status update (when requested) fails.
   */
  async saveTaskFields(task: Task, edits: TaskFieldEdits): Promise<boolean> {
    if (edits.statusSymbol && edits.statusSymbol !== task.status.symbol) {
      const ok = await this.tasksIntegration.taskUpdater.updateTaskStatus(
        task,
        edits.statusSymbol,
      );
      if (!ok) {
        return false;
      }
    }

    const hasFieldEdits =
      edits.description !== undefined ||
      edits.priority !== undefined ||
      edits.dueDate !== undefined ||
      edits.id !== undefined;
    if (!hasFieldEdits) {
      return true;
    }

    const filePath = task.taskLocation?.path;
    const lineNumber = task.taskLocation?.lineNumber;
    if (!filePath || lineNumber === undefined) {
      return false;
    }

    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
      return false;
    }

    try {
      const content = await this.app.vault.read(file);
      const lines = content.split("\n");
      if (lineNumber < 0 || lineNumber >= lines.length) {
        return false;
      }

      const line = lines[lineNumber];
      const match = line.match(TASK_LINE_RE);
      if (!match) {
        return false;
      }

      const { taskFormat } = await this.tasksIntegration.getWriteSettings();
      const format = resolveTaskFormat(taskFormat);
      const syntax = FIELD_SYNTAX[format];

      // match[1] is only "- [" (up to the open bracket); the checkbox symbol
      // itself sits between match[1] and match[2] uncaptured. Locate the
      // close bracket from the end (match[2] starts there) so `prefix` is the
      // full "- [x] " through the close bracket and `body` is everything
      // after it — never the symbol or bracket.
      const closeBracketIndex = line.length - match[2].length;
      const prefix = line.slice(0, closeBracketIndex + 1);
      let body = line.slice(closeBracketIndex + 1);

      if (edits.description !== undefined) {
        const { trailing } = splitBody(body);
        const newDescription = edits.description.trim();
        // `body` (and therefore `prefix`) never includes the space after the
        // closing bracket, so it must be re-added here.
        body = trailing
          ? ` ${newDescription} ${trailing}`
          : ` ${newDescription}`;
      }

      if (edits.priority !== undefined) {
        body = this.applyPriority(body, edits.priority, format);
      }

      if (edits.dueDate !== undefined) {
        body = this.applyField(body, edits.dueDate, syntax.dueDate);
      }

      if (edits.id !== undefined) {
        body = this.applyField(body, edits.id, syntax.id);
      }

      lines[lineNumber] = `${prefix}${body}`;
      await this.app.vault.modify(file, lines.join("\n"));
      return true;
    } catch (error) {
      console.error("Failed to update task fields:", error);
      return false;
    }
  }

  /** Strip any existing occurrence of a suffix field, then append the new value (or leave stripped, if `newValue` is null). */
  private applyField(
    body: string,
    newValue: string | null,
    syntax: { render(fieldValue: string): string; strip: RegExp },
  ): string {
    const stripped = body.replace(syntax.strip, "");
    return newValue === null || newValue === ""
      ? stripped
      : `${stripped}${syntax.render(newValue)}`;
  }

  /** Priority uses format-specific emoji/word values, not a single fixed suffix, so it's handled separately from {@link applyField}. */
  private applyPriority(
    body: string,
    priority: number | null,
    format: "tasksPluginEmoji" | "dataview",
  ): string {
    const strip =
      format === "dataview" ? PRIORITY_STRIP_DATAVIEW : PRIORITY_STRIP_EMOJI;
    const stripped = body.replace(strip, "");

    // 3 (None) and null both mean "no priority field".
    if (priority === null || priority === 3) {
      return stripped;
    }

    if (format === "dataview") {
      const word = PRIORITY_DATAVIEW_WORD[priority];
      return word ? `${stripped}  [priority:: ${word}]` : stripped;
    }
    const emoji = PRIORITY_EMOJI[priority];
    return emoji ? `${stripped} ${emoji}` : stripped;
  }
}

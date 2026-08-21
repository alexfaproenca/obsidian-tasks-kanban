/**
 * The Tasks plugin's "Task Format" setting, which decides whether task
 * metadata is written as emoji (`✅ 2026-08-04`) or as Dataview inline fields
 * (`[completion:: 2026-08-04]`).
 */
export type TaskFormat = "tasksPluginEmoji" | "dataview";

/** Matches the Tasks plugin's own default. */
export const DEFAULT_TASK_FORMAT: TaskFormat = "tasksPluginEmoji";

/** The task date fields this plugin writes as a simple date suffix. */
export type WritableDateField = "doneDate" | "cancelledDate" | "dueDate";

/** The task string fields this plugin writes as a simple value suffix. */
export type WritableStringField = "id";

export interface FieldSyntax {
  /** Render the field as a suffix to append to a task line. */
  render(date: string): string;
  /**
   * Match every existing occurrence of this field written in THIS format.
   *
   * Deliberately asymmetric with `render`: we write only the form Tasks'
   * serializer writes, but we must match every form Tasks' parser accepts,
   * or a hand-written variant would survive and we would append a duplicate.
   *
   * Global and unanchored on purpose — a line can carry both a done and a
   * cancelled date, in either order, so neither can be pinned to the end.
   */
  strip: RegExp;
}

/**
 * Build the strip regex for a Dataview inline field, covering the bracket and
 * paren forms, loose inner whitespace, and the optional trailing comma that
 * Tasks emits as a workaround in some layouts. `valuePattern` defaults to a
 * plain date (used by the date fields) but can be overridden for non-date
 * values (e.g. a task id).
 */
function dataviewStrip(
  key: string,
  valuePattern: string = String.raw`\d{4}-\d{2}-\d{2}`,
): RegExp {
  return new RegExp(
    String.raw`\s*(?:\[\s*${key}::\s*${valuePattern}\s*\]|\(\s*${key}::\s*${valuePattern}\s*\)) *,?`,
    "g",
  );
}

export const FIELD_SYNTAX: Record<
  TaskFormat,
  Record<WritableDateField, FieldSyntax> &
    Record<WritableStringField, FieldSyntax>
> = {
  tasksPluginEmoji: {
    doneDate: {
      render: (date) => ` ✅ ${date}`,
      strip: /\s*✅\s*\d{4}-\d{2}-\d{2}/g,
    },
    cancelledDate: {
      render: (date) => ` ❌ ${date}`,
      strip: /\s*❌\s*\d{4}-\d{2}-\d{2}/g,
    },
    dueDate: {
      render: (date) => ` 📅 ${date}`,
      strip: /\s*📅\s*\d{4}-\d{2}-\d{2}/g,
    },
    id: {
      render: (id) => ` 🆔 ${id}`,
      strip: /\s*🆔\s*\S+/g,
    },
  },
  dataview: {
    doneDate: {
      // Two leading spaces are required: a single space triggers the inline
      // field rendering bug (obsidian-tasks#1913).
      render: (date) => `  [completion:: ${date}]`,
      strip: dataviewStrip("completion"),
    },
    cancelledDate: {
      render: (date) => `  [cancelled:: ${date}]`,
      strip: dataviewStrip("cancelled"),
    },
    dueDate: {
      render: (date) => `  [due:: ${date}]`,
      strip: dataviewStrip("due"),
    },
    id: {
      render: (id) => `  [id:: ${id}]`,
      strip: dataviewStrip("id", String.raw`[^\]\)]+?`),
    },
  },
};

/**
 * Priority emoji signifiers, per obsidian-tasks' Priority enum (0 Highest …
 * 5 Lowest). Index 3 (None/Normal) has no emoji — Tasks writes nothing for it
 * in either format.
 */
export const PRIORITY_EMOJI: Record<number, string> = {
  0: "🔺",
  1: "⏫",
  2: "🔼",
  4: "🔽",
  5: "⏬",
};

/** Dataview `[priority:: <word>]` values, keyed the same way as {@link PRIORITY_EMOJI}. */
export const PRIORITY_DATAVIEW_WORD: Record<number, string> = {
  0: "highest",
  1: "high",
  2: "medium",
  4: "low",
  5: "lowest",
};

/**
 * Matches any priority emoji signifier already present on a line (emoji
 * format). Built as an alternation rather than a `[...]` character class:
 * several of these emoji are outside the BMP (surrogate pairs), and a
 * character class splits those into individual UTF-16 units without the `u`
 * flag, silently matching (and stripping) half a surrogate pair.
 */
export const PRIORITY_STRIP_EMOJI = new RegExp(
  `\\s*(?:${[...Object.values(PRIORITY_EMOJI)].join("|")})`,
  "g",
);

/** Matches an existing `[priority:: ...]`/`(priority:: ...)` field (dataview format). */
export const PRIORITY_STRIP_DATAVIEW = dataviewStrip(
  "priority",
  String.raw`[^\]\)]+?`,
);

/**
 * Coerce an unknown settings value to a supported format. Anything
 * unrecognised — including a format added by a future Tasks release — falls
 * back to emoji, which is Tasks' own default and this plugin's prior
 * behaviour.
 */
export function resolveTaskFormat(raw: unknown): TaskFormat {
  return raw === "dataview" ? "dataview" : DEFAULT_TASK_FORMAT;
}

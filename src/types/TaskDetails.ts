/**
 * The extra, non-Tasks-native metadata this plugin keeps for a task: Jira
 * link, free-form notes, and attachment references. Stored outside the
 * task's own line (see {@link TaskDetailsRepository}) so the task line and
 * description stay exactly what the Tasks plugin itself would write.
 */
export interface TaskDetails {
  /** The task's Tasks-native id (🆔 / `[id:: …]`) — the record's key. */
  taskId: string;
  /** Jira issue key (e.g. `DIG-12345`), or null when not linked. */
  jira: string | null;
  /** Free-form Markdown notes, separate from the task's own description. */
  notes: string;
  /** Vault-relative paths of attached images (see {@link TaskAttachmentService}). */
  attachments: string[];
}

/** An empty details record for a task id that has no stored file yet. */
export function emptyTaskDetails(taskId: string): TaskDetails {
  return { taskId, jira: null, notes: "", attachments: [] };
}

/** Cheap summary a card needs to decide which badges to show, without loading the full record. */
export interface TaskDetailsSummary {
  hasJira: boolean;
  jira: string | null;
  hasNotes: boolean;
  attachmentCount: number;
}

export function summarize(details: TaskDetails): TaskDetailsSummary {
  return {
    hasJira: !!details.jira,
    jira: details.jira,
    hasNotes: details.notes.trim().length > 0,
    attachmentCount: details.attachments.length,
  };
}

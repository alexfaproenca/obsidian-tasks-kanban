import { App, Modal, Notice, TFile } from "obsidian";

import type { Task } from "../services/TasksIntegration";
import type { TasksIntegration } from "../services/TasksIntegration";
import type { TaskFieldEdits } from "../services/TaskEditorService";
import type { TaskDetails } from "../types/TaskDetails";
import { emptyTaskDetails } from "../types/TaskDetails";
import { generateTaskId } from "../utils/taskId";
import { isValidJiraId } from "../utils/jira";
import { TaskAttachments } from "../components/TaskAttachments";

/**
 * Full-detail editor for a single task card, opened on click (see
 * {@link KanbanCard}). Fields that map to Tasks-native syntax (title, status,
 * priority, due date, id) are written back through
 * {@link TaskEditorService.saveTaskFields} so they stay in whatever format
 * (emoji/Dataview) the Tasks plugin is configured for. Everything else
 * (Jira, notes, attachments) is this plugin's own data, read/written through
 * {@link TaskDetailsRepository} and keyed by the task's id — generated on
 * first use if the task doesn't have one yet.
 */
export class TaskDetailsModal extends Modal {
  private readonly task: Task;
  private readonly tasksIntegration: TasksIntegration;
  private details: TaskDetails;

  private titleInput!: HTMLInputElement;
  private statusSelect!: HTMLSelectElement;
  private prioritySelect!: HTMLSelectElement;
  private dueDateInput!: HTMLInputElement;
  private jiraInput!: HTMLInputElement;
  private jiraError!: HTMLElement;
  private notesTextarea!: HTMLTextAreaElement;
  private saveButton!: HTMLButtonElement;
  private attachments!: TaskAttachments;

  constructor(app: App, task: Task, tasksIntegration: TasksIntegration) {
    super(app);
    this.task = task;
    this.tasksIntegration = tasksIntegration;
    this.details = emptyTaskDetails(task.id);
  }

  async onOpen(): Promise<void> {
    if (this.task.id) {
      this.details = await this.tasksIntegration.taskDetailsRepository.get(
        this.task.id,
      );
    }

    const { contentEl } = this;
    contentEl.addClass("tasks-kanban-details-modal");

    this.setTitle(this.task.description || "Task");

    this.renderTitleField(contentEl);
    this.renderStatusAndPriority(contentEl);
    this.renderDueDate(contentEl);
    this.renderJira(contentEl);
    this.renderNotes(contentEl);
    this.renderAttachments(contentEl);
    this.renderFooter(contentEl);
  }

  onClose(): void {
    this.attachments?.destroy();
    this.contentEl.empty();
  }

  private renderTitleField(container: HTMLElement): void {
    const field = container.createDiv({ cls: "tasks-kanban-details-field" });
    field.createEl("label", { text: "Tarefa" });
    this.titleInput = field.createEl("input", {
      type: "text",
      cls: "tasks-kanban-details-input",
    });
    this.titleInput.value = this.task.description;
  }

  private renderStatusAndPriority(container: HTMLElement): void {
    const row = container.createDiv({ cls: "tasks-kanban-details-row" });

    const statusField = row.createDiv({ cls: "tasks-kanban-details-field" });
    statusField.createEl("label", { text: "Status" });
    this.statusSelect = statusField.createEl("select", {
      cls: "tasks-kanban-details-select",
    });
    // Loaded dynamically from the Tasks plugin's own status configuration —
    // never hardcoded, so custom statuses (beyond the five built-ins) show up.
    for (const status of this.tasksIntegration.getStatuses()) {
      const option = this.statusSelect.createEl("option", {
        text: `${describeSymbol(status.symbol)} ${status.name}`,
        value: status.symbol,
      });
      if (status.symbol === this.task.status.symbol) {
        option.selected = true;
      }
    }

    const priorityField = row.createDiv({
      cls: "tasks-kanban-details-field",
    });
    priorityField.createEl("label", { text: "Prioridade" });
    this.prioritySelect = priorityField.createEl("select", {
      cls: "tasks-kanban-details-select",
    });
    for (const option of PRIORITY_OPTIONS) {
      const optionEl = this.prioritySelect.createEl("option", {
        text: option.label,
        value: String(option.value),
      });
      if (option.value === normalizePriority(this.task.priority)) {
        optionEl.selected = true;
      }
    }
  }

  private renderDueDate(container: HTMLElement): void {
    const field = container.createDiv({ cls: "tasks-kanban-details-field" });
    field.createEl("label", { text: "Data de entrega" });
    this.dueDateInput = field.createEl("input", {
      type: "date",
      cls: "tasks-kanban-details-input",
    });
    if (this.task.dueDate) {
      this.dueDateInput.value = this.task.dueDate;
    }
  }

  private renderJira(container: HTMLElement): void {
    const field = container.createDiv({ cls: "tasks-kanban-details-field" });
    field.createEl("label", { text: "Jira" });
    this.jiraInput = field.createEl("input", {
      type: "text",
      cls: "tasks-kanban-details-input",
      attr: { placeholder: "DIG-12345" },
    });
    this.jiraInput.value = this.details.jira ?? "";
    this.jiraError = field.createDiv({
      cls: "tasks-kanban-details-error",
    });
    this.jiraInput.addEventListener("input", () => this.validateJira());
  }

  private renderNotes(container: HTMLElement): void {
    const field = container.createDiv({ cls: "tasks-kanban-details-field" });
    field.createEl("label", { text: "Observações" });
    this.notesTextarea = field.createEl("textarea", {
      cls: "tasks-kanban-details-textarea",
      attr: { rows: "5" },
    });
    this.notesTextarea.value = this.details.notes;
  }

  private renderAttachments(container: HTMLElement): void {
    this.attachments = new TaskAttachments(
      container,
      (path) =>
        this.tasksIntegration.taskAttachmentService.resourcePathFor(path),
      {
        onAdd: (file) => this.addAttachment(file),
        onRemove: (path) => this.removeAttachment(path),
      },
    );
    this.attachments.setAttachments(this.details.attachments);
  }

  private renderFooter(container: HTMLElement): void {
    const footer = container.createDiv({
      cls: "tasks-kanban-details-footer",
    });

    const openNoteButton = footer.createEl("button", {
      text: "Abrir nota de origem",
      cls: "tasks-kanban-details-open-note",
      attr: { type: "button" },
    });
    openNoteButton.addEventListener("click", () => {
      void this.openSourceFile();
    });

    footer.createDiv({ cls: "tasks-kanban-details-footer-spacer" });

    const cancelButton = footer.createEl("button", {
      text: "Cancelar",
      attr: { type: "button" },
    });
    cancelButton.addEventListener("click", () => this.close());

    this.saveButton = footer.createEl("button", {
      text: "Salvar",
      cls: "mod-cta",
      attr: { type: "button" },
    });
    this.saveButton.addEventListener("click", () => {
      void this.save();
    });
  }

  /** Open the task's source file (the Daily Note/note it lives in) in a new leaf. */
  private async openSourceFile(): Promise<void> {
    const filePath = this.task.taskLocation?.path;
    if (!filePath) {
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
      await this.app.workspace.getLeaf().openFile(file);
      this.close();
    }
  }

  /** Validate the Jira field, showing an error and disabling Save on an invalid (non-empty) value. */
  private validateJira(): boolean {
    const value = this.jiraInput.value.trim();
    if (value === "" || isValidJiraId(value)) {
      this.jiraError.setText("");
      this.saveButton.disabled = false;
      return true;
    }
    this.jiraError.setText("Formato esperado: PROJETO-123 (ex: DIG-12345)");
    this.saveButton.disabled = true;
    return false;
  }

  /** Diff the form against the task's current values and write only what changed. */
  private async save(): Promise<void> {
    if (!this.validateJira()) {
      return;
    }

    const edits: TaskFieldEdits = {};

    const newDescription = this.titleInput.value.trim();
    if (newDescription && newDescription !== this.task.description) {
      edits.description = newDescription;
    }

    if (this.statusSelect.value !== this.task.status.symbol) {
      edits.statusSymbol = this.statusSelect.value;
    }

    const newPriority = Number(this.prioritySelect.value);
    if (newPriority !== normalizePriority(this.task.priority)) {
      edits.priority = newPriority;
    }

    const newDueDate = this.dueDateInput.value || null;
    if (newDueDate !== (this.task.dueDate || null)) {
      edits.dueDate = newDueDate;
    }

    const newJira = this.jiraInput.value.trim() || null;
    const newNotes = this.notesTextarea.value;
    const extraDetailsChanged =
      newJira !== this.details.jira || newNotes !== this.details.notes;

    // A task id is only minted the moment it's actually needed to key extra
    // metadata — editing just the Tasks-native fields never adds one.
    if (extraDetailsChanged && !this.task.id) {
      edits.id = generateTaskId(
        this.tasksIntegration
          .getTasks()
          .map((t) => t.id)
          .filter(Boolean),
      );
    }

    if (Object.keys(edits).length > 0) {
      this.saveButton.disabled = true;
      const ok = await this.tasksIntegration.taskEditorService.saveTaskFields(
        this.task,
        edits,
      );
      this.saveButton.disabled = false;

      if (!ok) {
        new Notice(
          "Não foi possível salvar a task — o arquivo pode ter mudado.",
        );
        return;
      }
      if (edits.id) {
        this.task.id = edits.id;
      }
    }

    if (extraDetailsChanged && this.task.id) {
      const updated = {
        ...this.details,
        taskId: this.task.id,
        jira: newJira,
        notes: newNotes,
      };
      try {
        await this.tasksIntegration.taskDetailsRepository.save(updated);
        this.details = updated;
        this.tasksIntegration.notifyDetailsChanged();
      } catch (error) {
        console.error("Failed to save task details:", error);
        new Notice("Não foi possível salvar Jira/observações.");
        return;
      }
    }

    this.close();
  }

  /**
   * Ensure the task has a Tasks-native id, minting and writing one (with the
   * same algorithm Tasks itself uses) if it doesn't. Used by the attachments
   * flow, which — unlike the rest of the form — persists immediately rather
   * than waiting for the Save button, since the file is already written to
   * the vault the moment it's pasted/dropped.
   */
  private async ensureTaskId(): Promise<string | null> {
    if (this.task.id) {
      return this.task.id;
    }
    const newId = generateTaskId(
      this.tasksIntegration
        .getTasks()
        .map((t) => t.id)
        .filter(Boolean),
    );
    const ok = await this.tasksIntegration.taskEditorService.saveTaskFields(
      this.task,
      { id: newId },
    );
    if (!ok) {
      return null;
    }
    this.task.id = newId;
    return newId;
  }

  /** The filename prefix an attachment should use: the (unsaved-form) Jira id if valid, otherwise the task id. */
  private async attachmentIdPrefix(): Promise<string | null> {
    const jira = this.jiraInput.value.trim();
    if (isValidJiraId(jira)) {
      return jira;
    }
    return this.ensureTaskId();
  }

  private async addAttachment(file: File): Promise<void> {
    const prefix = await this.attachmentIdPrefix();
    if (!prefix) {
      new Notice("Não foi possível gerar um identificador para o anexo.");
      return;
    }
    try {
      const path =
        await this.tasksIntegration.taskAttachmentService.saveAttachment(
          file,
          prefix,
        );
      await this.persistAttachments([...this.details.attachments, path]);
    } catch (error) {
      console.error("Failed to save attachment:", error);
      new Notice("Não foi possível salvar o anexo.");
    }
  }

  private async removeAttachment(path: string): Promise<void> {
    await this.persistAttachments(
      this.details.attachments.filter((p) => p !== path),
    );
  }

  /** Persist an updated attachment list against the (possibly just-minted) task id. */
  private async persistAttachments(attachments: string[]): Promise<void> {
    const taskId = await this.ensureTaskId();
    if (!taskId) {
      new Notice("Não foi possível salvar o anexo: sem Task ID.");
      return;
    }
    const updated = { ...this.details, taskId, attachments };
    try {
      await this.tasksIntegration.taskDetailsRepository.save(updated);
      this.details = updated;
      this.tasksIntegration.notifyDetailsChanged();
      this.attachments.setAttachments(attachments);
    } catch (error) {
      console.error("Failed to save attachment reference:", error);
      new Notice("Não foi possível salvar o anexo.");
    }
  }
}

/** Priority dropdown options, in the same order shown across the board's chips. */
const PRIORITY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: "Highest" },
  { value: 1, label: "High" },
  { value: 2, label: "Medium" },
  { value: 3, label: "None" },
  { value: 4, label: "Low" },
  { value: 5, label: "Lowest" },
];

/** Treat a missing priority the same as explicit "None" (3) for form comparisons. */
function normalizePriority(priority: number | null): number {
  return priority === null || priority === undefined ? 3 : priority;
}

/** Render a status symbol for display, making whitespace visible (mirrors SettingsTab). */
function describeSymbol(symbol: string): string {
  if (symbol === " ") {
    return "[ ]";
  }
  return `[${symbol}]`;
}

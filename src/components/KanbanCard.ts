import type { Task } from "../services/TasksIntegration";
import { TasksIntegration } from "../services/TasksIntegration";
import { TaskDetailsModal } from "../modals/TaskDetailsModal";
import { truncate } from "../utils/truncate";
import {
  getDateChips,
  getDependencyChips,
  getPriorityChip,
  stripTags,
  type Chip,
} from "../utils/taskChips";
import type { TaskDetailsSummary } from "../types/TaskDetails";
import { buildJiraUrl } from "../utils/jira";
import { setTooltip } from "obsidian";
import type { App } from "obsidian";

/**
 * The Kanban card component - represents a single task
 */
export class KanbanCard {
  private container: HTMLElement;
  private task: Task;
  private tasksIntegration: TasksIntegration;
  private app: App;
  private detailsSummary: TaskDetailsSummary | undefined;
  private jiraBaseUrl: string;
  private dragStartHandler: ((e: DragEvent) => void) | null = null;
  private clickHandler: ((e: MouseEvent) => void) | null = null;

  constructor(
    container: HTMLElement,
    task: Task,
    tasksIntegration: TasksIntegration,
    detailsSummary?: TaskDetailsSummary,
    jiraBaseUrl: string = "",
  ) {
    this.container = container;
    this.task = task;
    this.tasksIntegration = tasksIntegration;
    this.app = tasksIntegration.app;
    this.detailsSummary = detailsSummary;
    this.jiraBaseUrl = jiraBaseUrl;
  }

  /**
   * Render the card
   */
  render() {
    this.container.empty();
    this.container.addClass("tasks-kanban-card");
    this.container.setAttribute("data-task-id", this.task.id);
    this.container.setAttribute(
      "data-task-path",
      this.task.taskLocation?.path || "",
    );
    this.container.setAttribute("draggable", "true");

    // Header: status + tags
    const headerEl = this.container.createDiv({
      cls: "tasks-kanban-card-header",
    });

    // Status indicator
    const statusEl = headerEl.createSpan({
      cls: "tasks-kanban-card-status",
    });
    statusEl.setText(this.task.status.symbol);
    statusEl.setAttribute("title", this.task.status.name);
    statusEl.setAttribute("data-status-type", this.task.status.type);

    // Tags
    if (this.task.tags && this.task.tags.length > 0) {
      const tagsEl = headerEl.createDiv({
        cls: "tasks-kanban-card-tags",
      });
      for (const tag of this.task.tags) {
        tagsEl.createSpan({
          cls: "tasks-kanban-card-tag",
          text: tag,
        });
      }
    }

    // Content: description
    const fullTitle = stripTags(this.task.description, this.task.tags);
    const descEl = this.container.createDiv({
      cls: "tasks-kanban-card-description",
    });
    const displayText = truncate(fullTitle);
    descEl.setText(displayText);
    if (displayText !== fullTitle) {
      descEl.setAttribute("title", fullTitle);
    }

    // Extra-metadata badges (Jira, notes, attachments) — only when present.
    this.renderDetailsBadges();

    // Footer: metadata chips (priority, dates, dependencies)
    this.renderChips();

    // Add drag start handler
    this.setupDragAndDrop();

    // Click opens the full task-details modal; Ctrl/Cmd+click opens the
    // source file directly (a shortcut this card doesn't otherwise use, and
    // matches the "open in new context" convention Obsidian users expect
    // from Ctrl/Cmd+click elsewhere).
    this.clickHandler = (event: MouseEvent) => {
      event.stopPropagation();
      if (event.ctrlKey || event.metaKey) {
        this.openSourceFile();
        return;
      }
      new TaskDetailsModal(this.app, this.task, this.tasksIntegration).open();
    };
    this.container.addEventListener("click", this.clickHandler);
  }

  /**
   * Render badges for this plugin's own extra metadata (Jira, notes,
   * attachments) — never rendered when none of it is present, and never the
   * full note text (a tooltip covers that), per the "keep cards scannable"
   * requirement.
   */
  private renderDetailsBadges() {
    const summary = this.detailsSummary;
    if (
      !summary ||
      (!summary.hasJira && !summary.hasNotes && summary.attachmentCount === 0)
    ) {
      return;
    }

    const badgesEl = this.container.createDiv({
      cls: "tasks-kanban-card-details-badges",
    });

    if (summary.hasJira && summary.jira) {
      const jiraEl = badgesEl.createSpan({
        cls: "tasks-kanban-card-badge tasks-kanban-card-badge-jira",
        text: `🎫 ${summary.jira}`,
      });
      const url = buildJiraUrl(this.jiraBaseUrl, summary.jira);
      if (url) {
        jiraEl.addClass("tasks-kanban-card-badge-clickable");
        setTooltip(jiraEl, `Abrir ${summary.jira} no Jira`);
        jiraEl.addEventListener("click", (event) => {
          event.stopPropagation();
          window.open(url, "_blank");
        });
      }
    }

    if (summary.hasNotes) {
      const notesEl = badgesEl.createSpan({
        cls: "tasks-kanban-card-badge tasks-kanban-card-badge-notes",
        text: "💬",
      });
      setTooltip(notesEl, "Esta task tem observações");
    }

    if (summary.attachmentCount > 0) {
      const attachmentsEl = badgesEl.createSpan({
        cls: "tasks-kanban-card-badge tasks-kanban-card-badge-attachments",
        text: `🖼 ${summary.attachmentCount}`,
      });
      setTooltip(
        attachmentsEl,
        `${summary.attachmentCount} anexo${summary.attachmentCount > 1 ? "s" : ""}`,
      );
    }
  }

  /**
   * Render the metadata chips row (priority, dates, dependencies). The row is
   * only created when there is at least one chip, so cards without metadata
   * don't gain an empty gap.
   */
  private renderChips() {
    const chips: Chip[] = [];

    const priority = getPriorityChip(this.task.priority);
    if (priority) {
      chips.push(priority);
    }

    chips.push(...getDateChips(this.task));

    const deps = getDependencyChips(
      this.task,
      this.tasksIntegration.getTasks(),
    );
    if (deps.blocked) chips.push(deps.blocked);
    if (deps.dependsOn) chips.push(deps.dependsOn);
    if (deps.id) chips.push(deps.id);

    if (chips.length === 0) {
      return;
    }

    const chipsEl = this.container.createDiv({
      cls: "tasks-kanban-card-chips",
    });
    for (const chip of chips) {
      const chipEl = chipsEl.createSpan({
        cls: [
          "tasks-kanban-card-chip",
          `tasks-kanban-card-chip-${chip.modifier}`,
        ],
        text: `${chip.emoji} ${chip.label}`,
      });
      if (chip.title) {
        setTooltip(chipEl, chip.title);
      }
    }
  }

  /**
   * Set up drag and drop for the card
   */
  private setupDragAndDrop() {
    this.dragStartHandler = (e: DragEvent) => {
      if (!e.dataTransfer) return;

      e.dataTransfer.setData("text/plain", this.task.description);
      e.dataTransfer.setData(
        "application/task-path",
        this.task.taskLocation?.path || "",
      );
      e.dataTransfer.setData(
        "application/task-line",
        String(this.task.taskLocation?.lineNumber ?? -1),
      );

      // Set the drag image (optional visual feedback)
      if (e.target) {
        e.dataTransfer.setDragImage(e.target as HTMLElement, 0, 0);
      }

      // Add visual feedback
      this.container.addClass("tasks-kanban-card-dragging");

      // Required for Firefox
      e.dataTransfer.effectAllowed = "move";
    };

    this.container.addEventListener("dragstart", this.dragStartHandler);

    // Clean up on drag end
    this.container.addEventListener("dragend", () => {
      this.container.removeClass("tasks-kanban-card-dragging");
    });
  }

  /**
   * Open the source file where this task is located
   */
  private openSourceFile() {
    const filePath = this.task.taskLocation?.path;
    if (filePath && this.app) {
      const file = this.app.vault.getFileByPath(filePath);
      if (file) {
        void this.app.workspace.getLeaf().openFile(file);
      }
    }
  }

  /**
   * Clean up the card
   */
  destroy() {
    if (this.dragStartHandler) {
      this.container.removeEventListener("dragstart", this.dragStartHandler);
      this.dragStartHandler = null;
    }

    this.container.removeEventListener("dragend", () => {});

    if (this.clickHandler) {
      this.container.removeEventListener("click", this.clickHandler);
      this.clickHandler = null;
    }

    this.container.remove();
  }

  /**
   * Get the task associated with this card
   */
  getTask(): Task {
    return this.task;
  }
}

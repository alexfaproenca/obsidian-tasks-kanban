import { describe, it, expect, vi, beforeEach } from "vitest";
import { KanbanCard } from "../src/components/KanbanCard";
import type { Task } from "../src/services/TasksIntegration";
import type { TaskDetailsSummary } from "../src/types/TaskDetails";

function baseTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    status: { symbol: " ", name: "Todo", type: "TODO" },
    description: "A task",
    tags: [],
    priority: null,
    dueDate: null,
    startDate: null,
    scheduledDate: null,
    doneDate: null,
    createdDate: null,
    cancelledDate: null,
    recurrence: null,
    dependsOn: [],
    taskLocation: { path: "notes.md", lineNumber: 0 },
    originalMarkdown: "- [ ] A task",
    ...overrides,
  };
}

function mockIntegration() {
  return {
    getTasks: vi.fn().mockReturnValue([]),
    app: {},
  } as any;
}

describe("KanbanCard details badges", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
  });

  it("renders no badge row when there is no extra metadata", () => {
    const card = new KanbanCard(container, baseTask(), mockIntegration());
    card.render();

    expect(
      container.querySelector(".tasks-kanban-card-details-badges"),
    ).toBeNull();
  });

  it("renders no badge row for an empty summary (all falsy fields)", () => {
    const summary: TaskDetailsSummary = {
      hasJira: false,
      jira: null,
      hasNotes: false,
      attachmentCount: 0,
    };
    const card = new KanbanCard(
      container,
      baseTask(),
      mockIntegration(),
      summary,
    );
    card.render();

    expect(
      container.querySelector(".tasks-kanban-card-details-badges"),
    ).toBeNull();
  });

  it("renders only the Jira badge when only Jira is set", () => {
    const summary: TaskDetailsSummary = {
      hasJira: true,
      jira: "DIG-12345",
      hasNotes: false,
      attachmentCount: 0,
    };
    const card = new KanbanCard(
      container,
      baseTask(),
      mockIntegration(),
      summary,
    );
    card.render();

    expect(
      container.querySelector(".tasks-kanban-card-badge-jira")?.textContent,
    ).toBe("🎫 DIG-12345");
    expect(
      container.querySelector(".tasks-kanban-card-badge-notes"),
    ).toBeNull();
    expect(
      container.querySelector(".tasks-kanban-card-badge-attachments"),
    ).toBeNull();
  });

  it("renders the notes badge without the note content itself", () => {
    const summary: TaskDetailsSummary = {
      hasJira: false,
      jira: null,
      hasNotes: true,
      attachmentCount: 0,
    };
    const card = new KanbanCard(
      container,
      baseTask(),
      mockIntegration(),
      summary,
    );
    card.render();

    const badge = container.querySelector(".tasks-kanban-card-badge-notes");
    expect(badge?.textContent).toBe("💬");
  });

  it("renders the attachment count badge", () => {
    const summary: TaskDetailsSummary = {
      hasJira: false,
      jira: null,
      hasNotes: false,
      attachmentCount: 2,
    };
    const card = new KanbanCard(
      container,
      baseTask(),
      mockIntegration(),
      summary,
    );
    card.render();

    expect(
      container.querySelector(".tasks-kanban-card-badge-attachments")
        ?.textContent,
    ).toBe("🖼 2");
  });

  it("renders all three badges together when all are present", () => {
    const summary: TaskDetailsSummary = {
      hasJira: true,
      jira: "DIG-1",
      hasNotes: true,
      attachmentCount: 3,
    };
    const card = new KanbanCard(
      container,
      baseTask(),
      mockIntegration(),
      summary,
    );
    card.render();

    const badges = container.querySelectorAll(
      ".tasks-kanban-card-details-badges .tasks-kanban-card-badge",
    );
    expect(badges.length).toBe(3);
  });

  describe("Jira badge click", () => {
    it("is clickable and opens the browse URL when jiraBaseUrl is configured", () => {
      const summary: TaskDetailsSummary = {
        hasJira: true,
        jira: "DIG-1",
        hasNotes: false,
        attachmentCount: 0,
      };
      const card = new KanbanCard(
        container,
        baseTask(),
        mockIntegration(),
        summary,
        "https://acme.atlassian.net",
      );
      card.render();

      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
      const badge = container.querySelector<HTMLElement>(
        ".tasks-kanban-card-badge-jira",
      )!;
      expect(
        badge.classList.contains("tasks-kanban-card-badge-clickable"),
      ).toBe(true);
      badge.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      expect(openSpy).toHaveBeenCalledWith(
        "https://acme.atlassian.net/browse/DIG-1",
        "_blank",
      );
      openSpy.mockRestore();
    });

    it("is not clickable when no jiraBaseUrl is configured", () => {
      const summary: TaskDetailsSummary = {
        hasJira: true,
        jira: "DIG-1",
        hasNotes: false,
        attachmentCount: 0,
      };
      const card = new KanbanCard(
        container,
        baseTask(),
        mockIntegration(),
        summary,
      );
      card.render();

      const badge = container.querySelector<HTMLElement>(
        ".tasks-kanban-card-badge-jira",
      )!;
      expect(
        badge.classList.contains("tasks-kanban-card-badge-clickable"),
      ).toBe(false);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskEditorService } from "../src/services/TaskEditorService";
import type { Task } from "../src/services/TasksIntegration";
import { TFile } from "obsidian";

const mockApp = {
  vault: {
    read: vi.fn().mockResolvedValue(""),
    modify: vi.fn().mockResolvedValue(undefined),
    getAbstractFileByPath: vi.fn(),
  },
} as any;

const mockTaskUpdater = {
  updateTaskStatus: vi.fn().mockResolvedValue(true),
};

const mockTasksIntegration = {
  getWriteSettings: vi.fn(),
  taskUpdater: mockTaskUpdater,
} as any;

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "",
    status: { symbol: " ", name: "Todo", type: "TODO" },
    description: "Test task",
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
    taskLocation: { path: "/test/file.md", lineNumber: 0 },
    originalMarkdown: "- [ ] Test task",
    ...overrides,
  };
}

function createMockFile(): TFile {
  const file = Object.create(TFile.prototype);
  (file as any).path = "/test/file.md";
  return file as TFile;
}

describe("TaskEditorService", () => {
  let service: TaskEditorService;
  let mockFile: TFile;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFile = createMockFile();
    mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
    mockTasksIntegration.getWriteSettings.mockResolvedValue({
      setDoneDate: true,
      setCancelledDate: true,
      taskFormat: "tasksPluginEmoji",
    });
    mockTaskUpdater.updateTaskStatus.mockResolvedValue(true);
    service = new TaskEditorService(mockApp, mockTasksIntegration);
  });

  describe("status-only edits", () => {
    it("delegates to TaskUpdater.updateTaskStatus and does not touch the file itself", async () => {
      const task = createTask();
      const ok = await service.saveTaskFields(task, { statusSymbol: "x" });

      expect(ok).toBe(true);
      expect(mockTaskUpdater.updateTaskStatus).toHaveBeenCalledWith(task, "x");
      expect(mockApp.vault.read).not.toHaveBeenCalled();
      expect(mockApp.vault.modify).not.toHaveBeenCalled();
    });

    it("is a no-op when the requested status matches the current one", async () => {
      const task = createTask({
        status: { symbol: "x", name: "Done", type: "DONE" },
      });
      const ok = await service.saveTaskFields(task, { statusSymbol: "x" });

      expect(ok).toBe(true);
      expect(mockTaskUpdater.updateTaskStatus).not.toHaveBeenCalled();
    });

    it("returns false and skips other edits when the status update fails", async () => {
      mockTaskUpdater.updateTaskStatus.mockResolvedValue(false);
      const task = createTask();

      const ok = await service.saveTaskFields(task, {
        statusSymbol: "x",
        description: "New title",
      });

      expect(ok).toBe(false);
      expect(mockApp.vault.modify).not.toHaveBeenCalled();
    });

    it("returns true and touches nothing when called with no edits at all", async () => {
      const task = createTask();
      const ok = await service.saveTaskFields(task, {});

      expect(ok).toBe(true);
      expect(mockApp.vault.read).not.toHaveBeenCalled();
    });
  });

  describe("description edits", () => {
    it("replaces the description, preserving trailing metadata", async () => {
      mockApp.vault.read.mockResolvedValue(
        "- [ ] Old title 🔼 📅 2026-08-25 #work",
      );
      const task = createTask();

      const ok = await service.saveTaskFields(task, {
        description: "New title",
      });

      expect(ok).toBe(true);
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockFile,
        "- [ ] New title 🔼 📅 2026-08-25 #work",
      );
    });

    it("replaces inline tags too, since Tasks' description includes them (mirrors task.description, which the modal seeds its title field from)", async () => {
      mockApp.vault.read.mockResolvedValue("- [ ] Old title #work #urgent");
      const task = createTask();

      await service.saveTaskFields(task, { description: "New title #work" });

      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockFile,
        "- [ ] New title #work",
      );
    });

    it("trims the new description", async () => {
      mockApp.vault.read.mockResolvedValue("- [ ] Old title");
      const task = createTask();

      await service.saveTaskFields(task, { description: "  New title  " });

      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockFile,
        "- [ ] New title",
      );
    });
  });

  describe("priority edits (emoji format)", () => {
    it("appends a priority emoji when none is set", async () => {
      mockApp.vault.read.mockResolvedValue("- [ ] Test task");
      const task = createTask();

      await service.saveTaskFields(task, { priority: 2 });

      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockFile,
        "- [ ] Test task 🔼",
      );
    });

    it("replaces an existing priority emoji instead of duplicating it", async () => {
      mockApp.vault.read.mockResolvedValue("- [ ] Test task ⏫");
      const task = createTask({ priority: 1 });

      await service.saveTaskFields(task, { priority: 0 });

      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockFile,
        "- [ ] Test task 🔺",
      );
    });

    it("clears the priority when set to null", async () => {
      mockApp.vault.read.mockResolvedValue("- [ ] Test task 🔺");
      const task = createTask({ priority: 0 });

      await service.saveTaskFields(task, { priority: null });

      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockFile,
        "- [ ] Test task",
      );
    });

    it("clears the priority when set to 3 (None)", async () => {
      mockApp.vault.read.mockResolvedValue("- [ ] Test task 🔽");
      const task = createTask({ priority: 4 });

      await service.saveTaskFields(task, { priority: 3 });

      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockFile,
        "- [ ] Test task",
      );
    });
  });

  describe("priority edits (dataview format)", () => {
    beforeEach(() => {
      mockTasksIntegration.getWriteSettings.mockResolvedValue({
        setDoneDate: true,
        setCancelledDate: true,
        taskFormat: "dataview",
      });
    });

    it("writes `[priority:: high]`", async () => {
      mockApp.vault.read.mockResolvedValue("- [ ] Test task");
      const task = createTask();

      await service.saveTaskFields(task, { priority: 1 });

      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockFile,
        "- [ ] Test task  [priority:: high]",
      );
    });

    it("replaces an existing dataview priority field", async () => {
      mockApp.vault.read.mockResolvedValue("- [ ] Test task  [priority:: low]");
      const task = createTask({ priority: 4 });

      await service.saveTaskFields(task, { priority: 5 });

      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockFile,
        "- [ ] Test task  [priority:: lowest]",
      );
    });
  });

  describe("due date edits", () => {
    it("adds a due date (emoji format)", async () => {
      mockApp.vault.read.mockResolvedValue("- [ ] Test task");
      const task = createTask();

      await service.saveTaskFields(task, { dueDate: "2026-08-25" });

      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockFile,
        "- [ ] Test task 📅 2026-08-25",
      );
    });

    it("replaces an existing due date instead of duplicating it", async () => {
      mockApp.vault.read.mockResolvedValue("- [ ] Test task 📅 2026-01-01");
      const task = createTask({ dueDate: "2026-01-01" });

      await service.saveTaskFields(task, { dueDate: "2026-08-25" });

      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockFile,
        "- [ ] Test task 📅 2026-08-25",
      );
    });

    it("clears the due date when set to null", async () => {
      mockApp.vault.read.mockResolvedValue("- [ ] Test task 📅 2026-08-25");
      const task = createTask({ dueDate: "2026-08-25" });

      await service.saveTaskFields(task, { dueDate: null });

      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockFile,
        "- [ ] Test task",
      );
    });

    it("writes the due date as a dataview field", async () => {
      mockTasksIntegration.getWriteSettings.mockResolvedValue({
        setDoneDate: true,
        setCancelledDate: true,
        taskFormat: "dataview",
      });
      mockApp.vault.read.mockResolvedValue("- [ ] Test task");
      const task = createTask();

      await service.saveTaskFields(task, { dueDate: "2026-08-25" });

      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockFile,
        "- [ ] Test task  [due:: 2026-08-25]",
      );
    });
  });

  describe("id edits", () => {
    it("adds an id (emoji format)", async () => {
      mockApp.vault.read.mockResolvedValue("- [ ] Test task");
      const task = createTask();

      await service.saveTaskFields(task, { id: "abc123" });

      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockFile,
        "- [ ] Test task 🆔 abc123",
      );
    });

    it("writes the id as a dataview field", async () => {
      mockTasksIntegration.getWriteSettings.mockResolvedValue({
        setDoneDate: true,
        setCancelledDate: true,
        taskFormat: "dataview",
      });
      mockApp.vault.read.mockResolvedValue("- [ ] Test task");
      const task = createTask();

      await service.saveTaskFields(task, { id: "abc123" });

      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockFile,
        "- [ ] Test task  [id:: abc123]",
      );
    });
  });

  describe("combined edits", () => {
    it("applies description, priority, and due date in a single write", async () => {
      mockApp.vault.read.mockResolvedValue("- [ ] Old title");
      const task = createTask();

      await service.saveTaskFields(task, {
        description: "New title",
        priority: 0,
        dueDate: "2026-08-25",
      });

      expect(mockApp.vault.modify).toHaveBeenCalledTimes(1);
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockFile,
        "- [ ] New title 🔺 📅 2026-08-25",
      );
    });
  });

  describe("guard clauses", () => {
    it("returns false when the task has no path", async () => {
      const task = createTask({ taskLocation: { path: "", lineNumber: 0 } });
      const ok = await service.saveTaskFields(task, { description: "x" });
      expect(ok).toBe(false);
    });

    it("returns false when the file cannot be found", async () => {
      mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
      const task = createTask();
      const ok = await service.saveTaskFields(task, { description: "x" });
      expect(ok).toBe(false);
    });

    it("returns false when the line number is out of bounds", async () => {
      mockApp.vault.read.mockResolvedValue("only one line");
      const task = createTask({
        taskLocation: { path: "/test/file.md", lineNumber: 5 },
      });
      const ok = await service.saveTaskFields(task, { description: "x" });
      expect(ok).toBe(false);
    });

    it("returns false when the line does not match the task pattern", async () => {
      mockApp.vault.read.mockResolvedValue("not a task line");
      const task = createTask();
      const ok = await service.saveTaskFields(task, { description: "x" });
      expect(ok).toBe(false);
    });
  });
});

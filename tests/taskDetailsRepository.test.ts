import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  TaskDetailsRepository,
  serializeTaskDetails,
  parseTaskDetails,
} from "../src/services/TaskDetailsRepository";
import type { TaskDetails } from "../src/types/TaskDetails";

describe("serializeTaskDetails / parseTaskDetails round-trip", () => {
  it("round-trips a full record", () => {
    const details: TaskDetails = {
      taskId: "abc123",
      jira: "DIG-12345",
      notes:
        "Aguardando o Bruno confirmar qual mensagem será utilizada.\n\nO problema acontece somente em produção.",
      attachments: [
        "DIG-12345-20260821-141501.png",
        "task-abc123-20260821-141821.png",
      ],
    };

    const raw = serializeTaskDetails(details);
    expect(raw).toContain("task_id: abc123");
    expect(raw).toContain("jira: DIG-12345");
    expect(raw).toContain("## Observações");
    expect(raw).toContain("## Anexos");
    expect(raw).toContain("![[DIG-12345-20260821-141501.png]]");

    const parsed = parseTaskDetails(raw, "fallback");
    expect(parsed).toEqual(details);
  });

  it("omits the jira frontmatter line and Anexos section when unset", () => {
    const details: TaskDetails = {
      taskId: "abc123",
      jira: null,
      notes: "Just a note.",
      attachments: [],
    };

    const raw = serializeTaskDetails(details);
    expect(raw).not.toContain("jira:");
    expect(raw).not.toContain("## Anexos");

    const parsed = parseTaskDetails(raw, "fallback");
    expect(parsed).toEqual(details);
  });

  it("omits the Observações section when notes are empty", () => {
    const details: TaskDetails = {
      taskId: "abc123",
      jira: "DIG-1",
      notes: "",
      attachments: ["a.png"],
    };

    const raw = serializeTaskDetails(details);
    expect(raw).not.toContain("## Observações");

    const parsed = parseTaskDetails(raw, "fallback");
    expect(parsed).toEqual(details);
  });

  it("falls back gracefully when frontmatter is missing", () => {
    const parsed = parseTaskDetails("no frontmatter here", "fallback-id");
    expect(parsed).toEqual({
      taskId: "fallback-id",
      jira: null,
      notes: "",
      attachments: [],
    });
  });
});

describe("TaskDetailsRepository", () => {
  const adapter = {
    read: vi.fn(),
    write: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn(),
    mkdir: vi.fn().mockResolvedValue(undefined),
    list: vi.fn(),
  };
  const mockApp = { vault: { adapter } } as any;
  let repo: TaskDetailsRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new TaskDetailsRepository(mockApp);
  });

  it("returns an empty record when no file exists for the task", async () => {
    adapter.read.mockRejectedValue(new Error("ENOENT"));
    const details = await repo.get("abc123");
    expect(details).toEqual({
      taskId: "abc123",
      jira: null,
      notes: "",
      attachments: [],
    });
  });

  it("returns an empty record for an id that sanitizes to nothing (no filesystem access)", async () => {
    const details = await repo.get("../../");
    expect(details.taskId).toBe("../../");
    expect(adapter.read).not.toHaveBeenCalled();
  });

  it("creates the .task-details folder on first save", async () => {
    adapter.exists.mockResolvedValue(false);

    await repo.save({
      taskId: "abc123",
      jira: "DIG-1",
      notes: "",
      attachments: [],
    });

    expect(adapter.mkdir).toHaveBeenCalledWith(".task-details");
    expect(adapter.write).toHaveBeenCalledWith(
      ".task-details/abc123.md",
      expect.stringContaining("task_id: abc123"),
    );
  });

  it("does not recreate the folder when it already exists", async () => {
    adapter.exists.mockResolvedValue(true);

    await repo.save({
      taskId: "abc123",
      jira: null,
      notes: "note",
      attachments: [],
    });

    expect(adapter.mkdir).not.toHaveBeenCalled();
  });

  it("rejects an id that sanitizes to nothing", async () => {
    await expect(
      repo.save({ taskId: "../../", jira: null, notes: "x", attachments: [] }),
    ).rejects.toThrow();
    expect(adapter.write).not.toHaveBeenCalled();
  });

  it("getAll returns an empty map when the folder doesn't exist", async () => {
    adapter.exists.mockResolvedValue(false);
    const all = await repo.getAll();
    expect(all.size).toBe(0);
  });

  it("getAll loads every stored record, keyed by task id", async () => {
    adapter.exists.mockResolvedValue(true);
    adapter.list.mockResolvedValue({
      files: [
        ".task-details/abc123.md",
        ".task-details/def456.md",
        ".task-details/.gitkeep",
      ],
      folders: [],
    });
    adapter.read.mockImplementation((path: string) => {
      if (path === ".task-details/abc123.md") {
        return Promise.resolve("---\ntask_id: abc123\njira: DIG-1\n---\n");
      }
      if (path === ".task-details/def456.md") {
        return Promise.resolve(
          "---\ntask_id: def456\n---\n\n## Observações\n\nSome note\n",
        );
      }
      return Promise.reject(new Error("unexpected path"));
    });

    const all = await repo.getAll();

    expect(all.size).toBe(2);
    expect(all.get("abc123")?.jira).toBe("DIG-1");
    expect(all.get("def456")?.notes).toBe("Some note");
  });

  it("getAll skips a file that fails to read instead of throwing", async () => {
    adapter.exists.mockResolvedValue(true);
    adapter.list.mockResolvedValue({
      files: [".task-details/broken.md"],
      folders: [],
    });
    adapter.read.mockRejectedValue(new Error("corrupt"));

    const all = await repo.getAll();
    expect(all.size).toBe(0);
  });
});

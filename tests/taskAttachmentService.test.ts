import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskAttachmentService } from "../src/services/TaskAttachmentService";
import { TFile } from "obsidian";

const adapter = {
  exists: vi.fn(),
  getResourcePath: vi.fn((p: string) => `app://local/${p}`),
};
const vault = {
  adapter,
  createFolder: vi.fn().mockResolvedValue(undefined),
  createBinary: vi.fn().mockResolvedValue(undefined),
  getAbstractFileByPath: vi.fn(),
};
const fileManager = { trashFile: vi.fn().mockResolvedValue(undefined) };
const metadataCache = {
  resolvedLinks: {} as Record<string, Record<string, number>>,
};
const mockApp = { vault, fileManager, metadataCache } as any;

function makeImageFile(type = "image/png", name = "pasted.png"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

describe("TaskAttachmentService", () => {
  let service: TaskAttachmentService;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter.exists.mockResolvedValue(false);
    metadataCache.resolvedLinks = {};
    service = new TaskAttachmentService(mockApp);
  });

  describe("saveAttachment", () => {
    it("saves under Attachments/Tasks with a sanitised prefix and timestamp", async () => {
      const path = await service.saveAttachment(makeImageFile(), "DIG-12345");

      expect(path).toMatch(/^Attachments\/Tasks\/DIG-12345-\d{8}-\d{6}\.png$/);
      expect(vault.createBinary).toHaveBeenCalledWith(
        path,
        expect.any(ArrayBuffer),
      );
    });

    it("creates the folder when it doesn't exist yet", async () => {
      adapter.exists.mockResolvedValueOnce(false); // folder check
      adapter.exists.mockResolvedValueOnce(false); // unique-path check
      await service.saveAttachment(makeImageFile(), "abc123");
      expect(vault.createFolder).toHaveBeenCalledWith("Attachments/Tasks");
    });

    it("never overwrites: appends -1, -2, … until a free name is found", async () => {
      adapter.exists
        .mockResolvedValueOnce(true) // folder exists
        .mockResolvedValueOnce(true) // base name taken
        .mockResolvedValueOnce(true) // -1 taken
        .mockResolvedValueOnce(false); // -2 free

      const path = await service.saveAttachment(makeImageFile(), "abc123");
      expect(path).toContain("-2.png");
    });

    it("derives the extension from the MIME type", async () => {
      const path = await service.saveAttachment(
        makeImageFile("image/jpeg"),
        "abc123",
      );
      expect(path.endsWith(".jpg")).toBe(true);
    });

    it("sanitises a prefix that isn't already a safe filename component", async () => {
      const path = await service.saveAttachment(
        makeImageFile(),
        "../../etc/passwd",
      );
      expect(path).toMatch(/^Attachments\/Tasks\/etcpasswd-/);
    });
  });

  describe("resourcePathFor", () => {
    it("delegates to the adapter", () => {
      const src = service.resourcePathFor("Attachments/Tasks/a.png");
      expect(src).toBe("app://local/Attachments/Tasks/a.png");
    });
  });

  describe("isReferencedElsewhere", () => {
    it("is false when no note links the path", () => {
      expect(service.isReferencedElsewhere("Attachments/Tasks/a.png")).toBe(
        false,
      );
    });

    it("is true when another note resolves a link to it", () => {
      metadataCache.resolvedLinks = {
        "Daily/2026-08-21.md": { "Attachments/Tasks/a.png": 1 },
      };
      expect(service.isReferencedElsewhere("Attachments/Tasks/a.png")).toBe(
        true,
      );
    });

    it("ignores the excluded source (e.g. the task's own sidecar file)", () => {
      metadataCache.resolvedLinks = {
        ".task-details/abc123.md": { "Attachments/Tasks/a.png": 1 },
      };
      expect(
        service.isReferencedElsewhere(
          "Attachments/Tasks/a.png",
          ".task-details/abc123.md",
        ),
      ).toBe(false);
    });
  });

  describe("deleteFile", () => {
    it("trashes the file via FileManager (respects the user's delete preference)", async () => {
      const file = Object.create(TFile.prototype);
      vault.getAbstractFileByPath.mockReturnValue(file);

      const ok = await service.deleteFile("Attachments/Tasks/a.png");

      expect(ok).toBe(true);
      expect(fileManager.trashFile).toHaveBeenCalledWith(file);
    });

    it("returns false when the path isn't a file", async () => {
      vault.getAbstractFileByPath.mockReturnValue(null);
      const ok = await service.deleteFile("missing.png");
      expect(ok).toBe(false);
      expect(fileManager.trashFile).not.toHaveBeenCalled();
    });
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { generateTaskId, sanitizeTaskId } from "../src/utils/taskId";

describe("generateTaskId", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("produces a 6-character base36 id", () => {
    const id = generateTaskId([]);
    expect(id).toMatch(/^[a-z0-9]{6}$/);
  });

  it("retries until it finds an id not already taken", () => {
    // Computed independently of the mock (pure math), so these are the exact
    // ids the two draws below will produce.
    const collidingId = (0.123456).toString(36).slice(2, 8);
    const freeId = (0.654321).toString(36).slice(2, 8);

    const spy = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0.123456)
      .mockReturnValueOnce(0.654321);

    const id = generateTaskId([collidingId]);

    expect(id).toBe(freeId);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("sanitizeTaskId", () => {
  it("passes through a normal id unchanged", () => {
    expect(sanitizeTaskId("abc123")).toBe("abc123");
  });

  it("strips path-traversal and separator characters", () => {
    expect(sanitizeTaskId("../../etc/passwd")).toBe("etcpasswd");
  });

  it("returns null when nothing safe remains", () => {
    expect(sanitizeTaskId("../../")).toBeNull();
    expect(sanitizeTaskId("")).toBeNull();
  });

  it("caps absurdly long ids", () => {
    const long = "a".repeat(500);
    expect(sanitizeTaskId(long)?.length).toBe(100);
  });
});

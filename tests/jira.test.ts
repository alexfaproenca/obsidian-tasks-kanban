import { describe, it, expect } from "vitest";
import { isValidJiraId, buildJiraUrl } from "../src/utils/jira";

describe("isValidJiraId", () => {
  it.each(["DIG-1234", "DIG-98321", "ABC-1", "PROJECTKEY-999999"])(
    "accepts %s",
    (id) => {
      expect(isValidJiraId(id)).toBe(true);
    },
  );

  it.each(["dig-1234", "DIG1234", "DIG-", "-1234", "DIG-12a4", "", "DIG_1234"])(
    "rejects %s",
    (id) => {
      expect(isValidJiraId(id)).toBe(false);
    },
  );
});

describe("buildJiraUrl", () => {
  it("builds the browse URL", () => {
    expect(buildJiraUrl("https://acme.atlassian.net", "DIG-12345")).toBe(
      "https://acme.atlassian.net/browse/DIG-12345",
    );
  });

  it("trims a trailing slash on the base URL", () => {
    expect(buildJiraUrl("https://acme.atlassian.net/", "DIG-12345")).toBe(
      "https://acme.atlassian.net/browse/DIG-12345",
    );
  });

  it("returns null when the base URL is unset", () => {
    expect(buildJiraUrl("", "DIG-12345")).toBeNull();
    expect(buildJiraUrl("   ", "DIG-12345")).toBeNull();
  });

  it("returns null for an invalid Jira id", () => {
    expect(buildJiraUrl("https://acme.atlassian.net", "not-an-id")).toBeNull();
  });
});

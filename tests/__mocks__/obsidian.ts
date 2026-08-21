// Stub for the obsidian module during tests.
// The real module is provided by the Obsidian runtime.
export class Plugin {}
export class ItemView {}
export class WorkspaceLeaf {}
export class Notice {
  constructor(_message?: string) {}
}
export class App {
  vault = {
    read: async () => "",
    write: async () => {},
    getAbstractFileByPath: () => null,
  };
  workspace = { getLeaf: () => ({ openFile: async () => {} }) };
  metadataCache = {};
}
export class Vault {}
export class Workspace {}
export class MetadataCache {}
export class TFile {}
export function setTooltip() {}

// Minimal Modal stub: enough for components that `extends Modal` to
// instantiate and call open()/close() in tests without a real DOM chrome.
export class Modal {
  app: unknown;
  contentEl: HTMLElement;
  titleEl: HTMLElement;

  constructor(app: unknown) {
    this.app = app;
    this.contentEl = document.createElement("div");
    this.titleEl = document.createElement("div");
  }

  setTitle(title: string): this {
    this.titleEl.setText
      ? this.titleEl.setText(title)
      : (this.titleEl.textContent = title);
    return this;
  }

  open(): void {
    this.onOpen();
  }

  close(): void {
    this.onClose();
  }

  onOpen(): void {}
  onClose(): void {}
}

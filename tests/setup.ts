import { vi } from "vitest";

// Minimal Modal stub: enough for components that `extends Modal` to be
// imported/instantiated in tests without a real Obsidian DOM chrome.
class Modal {
  app: unknown;
  contentEl: HTMLElement;
  titleEl: HTMLElement;

  constructor(app: unknown) {
    this.app = app;
    this.contentEl = document.createElement("div");
    this.titleEl = document.createElement("div");
  }

  setTitle(title: string): this {
    this.titleEl.textContent = title;
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

// Mock Obsidian API
vi.mock("obsidian", () => ({
  Plugin: class {},
  ItemView: class {},
  WorkspaceLeaf: class {},
  Notice: class {},
  App: class {},
  Vault: class {},
  Workspace: class {},
  MetadataCache: class {},
  TFile: class {},
  Modal,
  setTooltip: vi.fn(),
  // Real normalizePath collapses "./"/".." segments and backslashes; tests
  // only exercise already-clean vault-relative paths, so passthrough is fine.
  normalizePath: (path: string) => path,
}));

// Apply polyfills directly to the prototype so every element gets them.
const proto = HTMLElement.prototype as Record<string, unknown>;
if (!proto.empty) {
  proto.empty = function empty() {
    while (this.firstChild) this.removeChild(this.firstChild);
  } as () => void;
}
if (!proto.addClass) {
  proto.addClass = function addClass(cls: string) {
    this.classList.add(cls);
  } as (cls: string) => void;
}
if (!proto.removeClass) {
  proto.removeClass = function removeClass(cls: string) {
    this.classList.remove(cls);
  } as (cls: string) => void;
}
if (!proto.toggleClass) {
  proto.toggleClass = function toggleClass(cls: string, force?: boolean) {
    this.classList.toggle(cls, force);
  } as (cls: string, force?: boolean) => void;
}
if (!proto.setText) {
  proto.setText = function setText(text: string) {
    this.textContent = text;
  } as (text: string) => void;
}
if (!proto.createDiv) {
  proto.createDiv = function createDiv(opts?: {
    cls?: string;
    text?: string;
  }): HTMLDivElement {
    const div = document.createElement("div");
    if (opts?.cls) div.className = opts.cls;
    if (opts?.text) div.textContent = opts.text;
    this.appendChild(div);
    return div;
  } as (opts?: { cls?: string; text?: string }) => HTMLDivElement;
}
if (!proto.createSpan) {
  proto.createSpan = function createSpan(opts?: {
    cls?: string;
    text?: string;
  }): HTMLSpanElement {
    const span = document.createElement("span");
    if (opts?.cls) span.className = opts.cls;
    if (opts?.text) span.textContent = opts.text;
    this.appendChild(span);
    return span;
  } as (opts?: { cls?: string; text?: string }) => HTMLSpanElement;
}
if (!proto.createEl) {
  proto.createEl = function createEl(
    tag: string,
    opts?: {
      cls?: string;
      text?: string;
      attr?: Record<string, string>;
      type?: string;
    },
  ): HTMLElement {
    const el = document.createElement(tag);
    if (opts?.cls) el.className = opts.cls;
    if (opts?.text) el.textContent = opts.text;
    if (opts?.type) el.setAttribute("type", opts.type);
    if (opts?.attr) {
      for (const [key, value] of Object.entries(opts.attr)) {
        el.setAttribute(key, String(value));
      }
    }
    this.appendChild(el);
    return el;
  } as (tag: string, opts?: unknown) => HTMLElement;
}

// Global test setup
afterEach(() => {
  vi.clearAllMocks();
});

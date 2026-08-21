/**
 * Callbacks a host (the task details modal) supplies to react to attachment
 * changes. Both may be async (they persist to the vault/repository); the
 * component just calls them and lets the host update {@link setAttachments}
 * once the change is durable.
 */
export interface TaskAttachmentsCallbacks {
  /** A new image was pasted or dropped. */
  onAdd(file: File): void | Promise<void>;
  /**
   * The user removed an attachment's *reference* on this task. Never implies
   * deleting the underlying file — see the module doc on
   * {@link TaskAttachmentService.deleteFile} for why that's a separate,
   * explicit action this UI doesn't currently expose.
   */
  onRemove(path: string): void | Promise<void>;
}

/**
 * The attachments area of {@link TaskDetailsModal}: a paste/drop zone plus a
 * thumbnail grid for already-attached images. Click a thumbnail to preview it
 * full-size; click its × to remove the reference (the file itself is left
 * alone — see {@link TaskAttachmentsCallbacks.onRemove}).
 */
export class TaskAttachments {
  private readonly zone: HTMLElement;
  private readonly thumbsEl: HTMLElement;
  private readonly resolvePath: (path: string) => string;
  private readonly callbacks: TaskAttachmentsCallbacks;

  private readonly pasteHandler: (e: ClipboardEvent) => void;
  private readonly dragOverHandler: (e: DragEvent) => void;
  private readonly dragLeaveHandler: (e: DragEvent) => void;
  private readonly dropHandler: (e: DragEvent) => void;
  private previewOverlay: HTMLElement | null = null;

  constructor(
    container: HTMLElement,
    resolvePath: (path: string) => string,
    callbacks: TaskAttachmentsCallbacks,
  ) {
    this.resolvePath = resolvePath;
    this.callbacks = callbacks;

    const field = container.createDiv({ cls: "tasks-kanban-details-field" });
    field.createEl("label", { text: "Anexos / Prints" });

    this.zone = field.createDiv({ cls: "tasks-kanban-attachments-zone" });
    this.zone.createDiv({
      cls: "tasks-kanban-attachments-hint",
      text: "Cole uma imagem aqui com Ctrl+V, ou arraste e solte",
    });
    this.thumbsEl = this.zone.createDiv({
      cls: "tasks-kanban-attachments-thumbs",
    });

    // Paste is listened on the document (not just this zone) so Ctrl+V works
    // anywhere in the open modal — but only image files are intercepted, so
    // pasting text into the title/notes fields is completely unaffected.
    this.pasteHandler = (e: ClipboardEvent) => {
      const files = imageFilesFrom(e.clipboardData);
      if (files.length === 0) {
        return;
      }
      e.preventDefault();
      for (const file of files) {
        void this.callbacks.onAdd(file);
      }
    };
    document.addEventListener("paste", this.pasteHandler);

    this.dragOverHandler = (e: DragEvent) => {
      e.preventDefault();
      this.zone.addClass("tasks-kanban-attachments-zone-drag-over");
    };
    this.dragLeaveHandler = () => {
      this.zone.removeClass("tasks-kanban-attachments-zone-drag-over");
    };
    this.dropHandler = (e: DragEvent) => {
      e.preventDefault();
      this.zone.removeClass("tasks-kanban-attachments-zone-drag-over");
      const files = imageFilesFrom(e.dataTransfer);
      for (const file of files) {
        void this.callbacks.onAdd(file);
      }
    };
    this.zone.addEventListener("dragover", this.dragOverHandler);
    this.zone.addEventListener("dragleave", this.dragLeaveHandler);
    this.zone.addEventListener("drop", this.dropHandler);
  }

  /** Rebuild the thumbnail grid for the given vault-relative attachment paths. */
  setAttachments(paths: string[]): void {
    this.thumbsEl.empty();
    for (const path of paths) {
      this.renderThumb(path);
    }
  }

  private renderThumb(path: string): void {
    const thumb = this.thumbsEl.createDiv({
      cls: "tasks-kanban-attachment-thumb",
    });
    const img = thumb.createEl("img", {
      attr: { src: this.resolvePath(path), alt: path },
    });
    img.addEventListener("click", () => this.openPreview(path));

    const removeButton = thumb.createEl("button", {
      cls: "tasks-kanban-attachment-remove",
      text: "×",
      attr: { type: "button", "aria-label": "Remover anexo" },
    });
    removeButton.addEventListener("click", (e) => {
      e.stopPropagation();
      void this.callbacks.onRemove(path);
    });
  }

  private openPreview(path: string): void {
    this.closePreview();
    const overlay = document.body.createDiv({
      cls: "tasks-kanban-attachment-preview",
    });
    overlay.createEl("img", { attr: { src: this.resolvePath(path) } });
    overlay.addEventListener("click", () => this.closePreview());
    this.previewOverlay = overlay;
  }

  private closePreview(): void {
    this.previewOverlay?.remove();
    this.previewOverlay = null;
  }

  destroy(): void {
    document.removeEventListener("paste", this.pasteHandler);
    this.zone.removeEventListener("dragover", this.dragOverHandler);
    this.zone.removeEventListener("dragleave", this.dragLeaveHandler);
    this.zone.removeEventListener("drop", this.dropHandler);
    this.closePreview();
  }
}

/** Extract every image `File` out of a paste/drop `DataTransfer`-like payload. */
function imageFilesFrom(data: DataTransfer | null): File[] {
  if (!data) {
    return [];
  }
  const files: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        files.push(file);
      }
    }
  }
  if (files.length === 0) {
    for (const file of Array.from(data.files ?? [])) {
      if (file.type.startsWith("image/")) {
        files.push(file);
      }
    }
  }
  return files;
}

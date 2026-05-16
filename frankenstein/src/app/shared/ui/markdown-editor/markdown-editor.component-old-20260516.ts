import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { marked } from 'marked';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-markdown-editor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './markdown-editor.component.html',
  host: { class: 'flex flex-col min-h-0 flex-1' },
})
export class MarkdownEditorComponent {
  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();
  @Input() placeholder = 'Écrivez votre document en Markdown ici...';
  @Input() minRows = 16;

  readonly editorId = 'md-' + Math.random().toString(36).substring(2, 9);

  isPreviewMode = false;
  livePreviewHtml: SafeHtml = '';

  constructor(private sanitizer: DomSanitizer) {}

  onInput(event: Event) {
    const v = (event.target as HTMLTextAreaElement).value;
    this.value = v;
    this.valueChange.emit(v);
  }

  async togglePreview() {
    this.isPreviewMode = !this.isPreviewMode;
    if (this.isPreviewMode) {
      const html = await marked(this.value);
      this.livePreviewHtml = this.sanitizer.bypassSecurityTrustHtml(html);
    }
  }

  insertMarkdown(before: string, after = '') {
    const textarea = document.getElementById(this.editorId) as HTMLTextAreaElement;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = this.value.substring(start, end);
    const newValue =
      this.value.substring(0, start) + before + selected + after + this.value.substring(end);
    this.value = newValue;
    this.valueChange.emit(newValue);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }
}

import { Component, Input, Output, EventEmitter } from '@angular/core';
import { NgClass } from '@angular/common';

import { marked } from 'marked';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
    selector: 'app-markdown-editor',
    imports: [NgClass],
    templateUrl: './markdown-editor.component.html',
    host: { class: 'flex flex-col min-h-0 flex-1' }
})
export class MarkdownEditorComponent {
  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();
  @Input() placeholder = 'Écrivez votre document en Markdown ici...';
  @Input() minRows = 16;

  readonly editorId = 'md-' + Math.random().toString(36).substring(2, 9);

  isPreviewMode = false;
  livePreviewHtml: SafeHtml = '';
  activeStyles: Record<string, boolean> = {};

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

  // Toggle sticky : si texte sélectionné → entoure sans activer sticky.
  // Sinon → insère le marqueur et bascule l'état actif.
  toggleInlineStyle(styleKey: string, marker: string) {
    const textarea = document.getElementById(this.editorId) as HTMLTextAreaElement;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start !== end) {
      // Texte sélectionné : entourer et ne pas activer le sticky
      const selected = this.value.substring(start, end);
      const newValue = this.value.substring(0, start) + marker + selected + marker + this.value.substring(end);
      this.value = newValue;
      this.valueChange.emit(newValue);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + marker.length, start + marker.length + selected.length);
      });
      return;
    }

    // Pas de sélection : toggle sticky + insérer marqueur ouvrant ou fermant
    this.activeStyles = { ...this.activeStyles, [styleKey]: !this.activeStyles[styleKey] };
    const newValue = this.value.substring(0, start) + marker + this.value.substring(start);
    this.value = newValue;
    this.valueChange.emit(newValue);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + marker.length, start + marker.length);
    });
  }

}

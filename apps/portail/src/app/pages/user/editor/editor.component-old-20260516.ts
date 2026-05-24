import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { marked } from 'marked';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MarkdownEditorComponent } from '../../../shared/ui/markdown-editor/markdown-editor.component';

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [CommonModule, MarkdownEditorComponent],
  templateUrl: './editor.component.html',
  styleUrl: './editor.component.scss'
})
export class EditorComponent {
  markdownContent = '';
  renderedHtml = signal<SafeHtml>('');
  isValidated = signal(false);

  constructor(private router: Router, private sanitizer: DomSanitizer) {}

  async validate(): Promise<void> {
    const html = await marked(this.markdownContent);
    this.renderedHtml.set(this.sanitizer.bypassSecurityTrustHtml(html));
    this.isValidated.set(true);
  }

  goBack(): void {
    this.router.navigate(['/home']);
  }
}

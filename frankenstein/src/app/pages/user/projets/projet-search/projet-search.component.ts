import { Component, signal, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SearchService, SearchResult } from '../search.service';

@Component({
  selector: 'app-projet-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="projet-search">
      <div class="projet-search__bar">
        <span class="material-symbols-outlined opacity-60">search</span>
        <input type="text"
               [(ngModel)]="query"
               (ngModelChange)="onQueryChange($event)"
               (keydown.escape)="reset()"
               placeholder="Rechercher dans le contenu de tous les projets..."
               class="flex-1 bg-transparent outline-none border-0 text-sm" />
        @if (loading()) {
          <span class="material-symbols-outlined animate-spin opacity-60">progress_activity</span>
        }
        @if (query && !loading()) {
          <button type="button" class="opacity-60 hover:opacity-100" (click)="reset()" title="Effacer">
            <span class="material-symbols-outlined text-base">close</span>
          </button>
        }
      </div>

      @if (showResults()) {
        <div class="projet-search__panel">
          @if (results().length === 0 && !loading() && query.length >= 2) {
            <div class="projet-search__empty">
              Aucun résultat pour <strong>«{{ query }}»</strong>
            </div>
          }
          @if (results().length > 0) {
            <div class="projet-search__meta">
              {{ results().length }} résultat{{ results().length > 1 ? 's' : '' }}{{ truncated() ? ' (limités à 50)' : '' }}
            </div>
            @for (r of results(); track r.projectId + ':' + r.fileId + ':' + $index) {
              <button type="button"
                      class="projet-search__item"
                      (click)="goToResult(r)">
                <div class="projet-search__item-head">
                  <span class="projet-search__project">{{ r.projectName }}</span>
                  @if (r.sectionPath.length > 0) {
                    <span class="projet-search__sep">›</span>
                    @for (p of r.sectionPath; track p; let last = $last) {
                      <span>{{ p }}</span>
                      @if (!last) { <span class="projet-search__sep">›</span> }
                    }
                  }
                  <span class="projet-search__count">{{ r.matchCount }}×</span>
                </div>
                <div class="projet-search__excerpt" [innerHTML]="highlight(r.excerpt)"></div>
              </button>
            }
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .projet-search { position: relative; }

    .projet-search__bar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      transition: border-color 0.12s;
      &:focus-within { border-color: rgba(59, 130, 246, 0.4); }
    }

    .projet-search__panel {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      z-index: 50;
      max-height: 480px;
      overflow-y: auto;
      background: var(--surface, #1f2937);
      color: var(--text, #e5e7eb);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.4);
    }

    .projet-search__meta {
      padding: 0.5rem 0.75rem;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      opacity: 0.55;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .projet-search__empty {
      padding: 1rem;
      text-align: center;
      opacity: 0.65;
      font-size: 13px;
    }

    .projet-search__item {
      display: block;
      width: 100%;
      text-align: left;
      padding: 0.6rem 0.75rem;
      background: transparent;
      border: 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      color: inherit;
      cursor: pointer;
      transition: background-color 0.1s;
      &:hover { background: rgba(59, 130, 246, 0.08); }
      &:last-child { border-bottom: 0; }
    }

    .projet-search__item-head {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 12px;
      opacity: 0.7;
      margin-bottom: 0.25rem;
      flex-wrap: wrap;
    }

    .projet-search__project { font-weight: 600; color: rgb(147, 197, 253); }
    .projet-search__sep { opacity: 0.45; }
    .projet-search__count {
      margin-left: auto;
      background: rgba(59, 130, 246, 0.15);
      color: rgb(147, 197, 253);
      padding: 0.05rem 0.4rem;
      border-radius: 8px;
      font-size: 10px;
      font-weight: 600;
    }

    .projet-search__excerpt {
      font-size: 12.5px;
      line-height: 1.45;
      opacity: 0.85;
      ::ng-deep mark {
        background: rgba(245, 158, 11, 0.35);
        color: inherit;
        padding: 0 2px;
        border-radius: 2px;
      }
    }

    :host-context(.light) .projet-search__bar { background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.08); }
    :host-context(.light) .projet-search__panel { background: #fff; color: #111827; border-color: rgba(0,0,0,0.08); }
    :host-context(.light) .projet-search__item-head { opacity: 0.65; }
    :host-context(.light) .projet-search__project { color: rgb(37, 99, 235); }
  `]
})
export class ProjetSearchComponent {
  query = '';
  results = signal<SearchResult[]>([]);
  loading = signal(false);
  truncated = signal(false);
  showResults = signal(false);

  private debounceHandle: any = null;
  private currentSeq = 0;

  private search = inject(SearchService);
  private router = inject(Router);

  onQueryChange(v: string) {
    this.query = v;
    clearTimeout(this.debounceHandle);
    if (v.trim().length < 2) {
      this.results.set([]);
      this.showResults.set(false);
      return;
    }
    this.showResults.set(true);
    this.loading.set(true);
    const seq = ++this.currentSeq;
    this.debounceHandle = setTimeout(async () => {
      try {
        const resp = await this.search.search(v.trim());
        if (seq !== this.currentSeq) return;
        this.results.set(resp.results);
        this.truncated.set(resp.truncated);
      } catch {
        if (seq === this.currentSeq) this.results.set([]);
      } finally {
        if (seq === this.currentSeq) this.loading.set(false);
      }
    }, 300);
  }

  reset() {
    this.query = '';
    this.results.set([]);
    this.showResults.set(false);
    clearTimeout(this.debounceHandle);
  }

  goToResult(r: SearchResult) {
    this.router.navigate(['/projets', r.projectId], {
      queryParams: r.sectionId ? { section: r.sectionId } : undefined
    });
    this.showResults.set(false);
  }

  highlight(text: string): string {
    if (!this.query) return this.escapeHtml(text);
    const escapedQuery = this.query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(${escapedQuery})`, 'gi');
    return this.escapeHtml(text).replace(re, '<mark>$1</mark>');
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

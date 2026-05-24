import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CahierRecetteService } from './cahier-recette.service';
import { CahierRecetteComponent } from './cahier-recette.component';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService } from '../../core/services/config.service';
import type { TestCase, PageTestSuggestion } from './cahier-recette.types';

type WidgetPhase = 'idle' | 'popup' | 'analyzing';

@Component({
  selector: 'wo-cahier-recette-widget',
  standalone: true,
  imports: [CommonModule, FormsModule, CahierRecetteComponent],
  templateUrl: './cahier-recette-widget.component.html',
  styleUrl: './cahier-recette-widget.component.scss'
})
export class CahierRecetteWidgetComponent implements OnInit {
  @ViewChild('mainModal') mainModal!: CahierRecetteComponent;

  phase: WidgetPhase = 'idle';
  pageTests: TestCase[] = [];
  suggestions: PageTestSuggestion[] = [];
  analyzingError = '';
  analyzingRaw = '';
  streamOutput = '';
  showRaw = false;
  importingIds = new Set<number>();
  importedIds = new Set<number>();
  importCategoryName = '';
  importStatus: 'idle' | 'saving' | 'saved' | 'error' = 'idle';
  importSaveError = '';

  readonly exclusionOptions: { key: string; label: string; selector: string; icon: string }[] = [
    { key: 'header',  label: 'Header',            selector: 'header, [role="banner"]',                                          icon: 'web_asset' },
    { key: 'footer',  label: 'Footer',            selector: 'footer, [role="contentinfo"]',                                    icon: 'web_asset_off' },
    { key: 'nav',     label: 'Navigation',        selector: 'nav, [role="navigation"]',                                        icon: 'menu' },
    { key: 'aside',   label: 'Barre latérale',    selector: 'aside, [role="complementary"]',                                   icon: 'view_sidebar' },
    { key: 'widgets', label: 'Widgets flottants', selector: 'wo-ticket-widget, wo-cahier-recette-widget, wo-tools-panel',       icon: 'widgets' },
  ];

  private readonly EXCLUSIONS_KEY = 'frankenstein_recette_exclusions';

  exclusions: Record<string, boolean> = {
    header: true,
    footer: true,
    nav: false,
    aside: false,
    widgets: true,
  };

  constructor(
    public svc: CahierRecetteService,
    private auth: AuthService,
    public configService: ConfigService
  ) {}

  ngOnInit() {
    try {
      const saved = localStorage.getItem(this.EXCLUSIONS_KEY);
      if (saved) this.exclusions = { ...this.exclusions, ...JSON.parse(saved) };
    } catch {}
  }

  saveExclusions() {
    try { localStorage.setItem(this.EXCLUSIONS_KEY, JSON.stringify(this.exclusions)); } catch {}
  }

  async openPopup() {
    if (this.configService.activeTool() === 'recette') {
      this.closePopup();
      return;
    }
    this.configService.setActiveTool('recette');
    this.suggestions = [];
    this.analyzingError = '';
    this.importedIds.clear();
    await this.svc.loadAll();
    this.pageTests = this.svc.getTestsForPage(window.location.href);
  }

  closePopup() {
    this.configService.setActiveTool('none');
  }

  openMain() {
    this.closePopup();
    this.mainModal.open();
  }

  get currentAiInfo(): { providerLabel: string; model: string } {
    const prefs = this.getAiPrefs();
    const base = prefs.provider.split('-')[0];
    const providerLabel = base === 'gemini' ? 'Gemini CLI' : base === 'claude' ? 'Claude Code' : prefs.provider;
    return { providerLabel, model: prefs.model };
  }

  private getFilteredPageContent(): string {
    const clone = document.body.cloneNode(true) as HTMLElement;
    this.exclusionOptions
      .filter(opt => this.exclusions[opt.key])
      .forEach(opt => clone.querySelectorAll(opt.selector).forEach(el => el.remove()));
    return clone.innerText.substring(0, 3000);
  }

  private getAiPrefs(): { provider: string; model: string } {
    try {
      const userId = this.auth.currentUser()?.id || 'guest';
      const raw = localStorage.getItem(`frankenstein_ai_prefs_${userId}`);
      if (raw) {
        const prefs = JSON.parse(raw);
        if (prefs.provider && prefs.model) return prefs;
      }
    } catch {}
    return { provider: 'claude-api', model: 'claude-sonnet-4-6' };
  }

  async analyzePage() {
    this.phase = 'analyzing';
    this.analyzingError = '';
    this.analyzingRaw = '';
    this.streamOutput = '';
    this.showRaw = false;
    this.suggestions = [];
    const pageTitle = document.title;
    const pageContent = this.getFilteredPageContent();
    const aiPrefs = this.getAiPrefs();
    const activeExclusions = this.exclusionOptions
      .filter(opt => this.exclusions[opt.key])
      .map(opt => opt.label);
    try {
      const result = await this.svc.analyzePage(
        window.location.href,
        pageTitle,
        pageContent,
        aiPrefs.provider,
        aiPrefs.model,
        activeExclusions,
        (chunk) => { this.streamOutput += chunk; }
      );
      this.suggestions = result.suggestions;
      this.analyzingRaw = result.rawText;
      if (this.suggestions.length > 0) {
        this.importCategoryName = `Analyse IA — ${pageTitle}`;
        this.importStatus = 'idle';
        this.importSaveError = '';
      }
      if (this.suggestions.length === 0 && this.analyzingRaw) {
        this.analyzingError = 'L\'IA n\'a retourné aucune suggestion. Voir la réponse brute ci-dessous.';
      }
    } catch (e: any) {
      const err = e?.error;
      this.analyzingError = err?.error || (typeof err === 'string' ? err : null) || e?.message || 'Erreur lors de l\'analyse.';
      this.analyzingRaw = err?.raw || '';
    }
    this.phase = 'popup';
  }

  private async resolveCategory(): Promise<string> {
    const name = this.importCategoryName.trim() || 'Analyse IA';
    const existing = this.svc.categories().find(c => c.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
    const created = await this.svc.createCategory({ name, description: 'Générée par analyse IA', icon: 'psychology', color: 'violet' });
    return created.id;
  }

  async saveAllSuggestions() {
    if (this.importStatus === 'saving') return;
    this.importStatus = 'saving';
    this.importSaveError = '';
    try {
      const categoryId = await this.resolveCategory();
      await this.svc.importTests(this.suggestions.map(s => ({
        name: s.name,
        categoryId,
        priority: s.priority,
        status: 'draft' as const,
        tags: [...s.tags],
        targetPages: [...s.targetPages],
        estimatedMinutes: s.estimatedMinutes,
        dependsOn: [],
        steps: [...s.steps],
        preconditions: s.preconditions,
        description: s.description
      })));
      this.importStatus = 'saved';
    } catch (e: any) {
      this.importStatus = 'error';
      this.importSaveError = e?.error?.error || e?.message || 'Erreur lors de l\'enregistrement.';
    }
  }

  priorityBadgeCls(p: string): string {
    return ({
      critique: 'bg-red-500/20 text-red-400',
      haute:    'bg-orange-500/20 text-orange-400',
      normale:  'bg-blue-500/20 text-blue-400',
      basse:    'bg-gray-500/20 text-gray-400'
    } as Record<string, string>)[p] ?? 'bg-gray-500/20 text-gray-400';
  }

  priorityLabel(p: string): string {
    return ({ critique: 'Critique', haute: 'Haute', normale: 'Normale', basse: 'Basse' } as Record<string, string>)[p] ?? p;
  }

  priorityDotCls(p: string): string {
    return ({
      critique: 'bg-red-400',
      haute:    'bg-orange-400',
      normale:  'bg-blue-400',
      basse:    'bg-gray-400'
    } as Record<string, string>)[p] ?? 'bg-gray-400';
  }
}

import {
  Component, OnInit, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CahierRecetteService } from './cahier-recette.service';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService } from '../../core/services/config.service';
import type {
  TestCase, TestCategory, Campaign, TestRun, TestResult,
  ContextVariable, TestTemplate, RunScope, Environment,
  TestStep, TestPriority, TestStatus, RunDiff, ResultStatus
} from './cahier-recette.types';

type Tab = 'catalogue' | 'campagnes' | 'lancer' | 'rapports' | 'avance';

@Component({
  selector: 'wo-cahier-recette',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cahier-recette.component.html',
  styleUrl: './cahier-recette.component.scss'
})
export class CahierRecetteComponent implements OnInit {
  isOpen = false;
  tab: Tab = 'catalogue';
  loading = false;

  // ── Catalogue ─────────────────────────────────────────────────────────────
  selectedCategoryId = '';
  testSearch = '';
  testStatusFilter: '' | TestStatus = '';
  testPriorityFilter: '' | TestPriority = '';
  tagFilter = '';
  showCatModal = false;
  catForm: Partial<TestCategory> = {};
  catEditing: TestCategory | null = null;
  catSaving = false;
  showTestModal = false;
  testForm: Partial<TestCase> & { stepsText?: string } = {};
  testEditing: TestCase | null = null;
  testSaving = false;
  showTestDetail: TestCase | null = null;
  deletingCatId: string | null = null;
  deletingTestId: string | null = null;

  // ── Campagnes ─────────────────────────────────────────────────────────────
  selectedCampaign: Campaign | null = null;
  showCampaignModal = false;
  campaignForm: Partial<Campaign> & { testIds: string[]; tags: string[] } = { testIds: [], tags: [] };
  campaignEditing: Campaign | null = null;
  campaignSaving = false;
  deletingCampaignId: string | null = null;
  campaignTagInput = '';
  campTestSearch = '';

  // ── Lancer ────────────────────────────────────────────────────────────────
  runConfig = {
    name: '',
    siteName: 'Frankenstein Junior',
    siteUrl: 'http://localhost:4200',
    browser: 'Chrome',
    environment: 'local' as Environment,
    testerName: '',
    aiProvider: 'claude-api',
    aiModel: 'claude-sonnet-4-6',
    scope: 'all' as RunScope,
    campaignId: '',
    selectedTags: [] as string[],
    selectedTestIds: [] as string[]
  };
  runError = '';
  showLiveProgress = false;
  liveResultDetail: TestResult | null = null;
  runLaunchSelSearch = '';

  // ── Rapports ──────────────────────────────────────────────────────────────
  selectedRun: TestRun | null = null;
  loadingRun = false;
  runDetailResultFilter: '' | ResultStatus = '';
  compareRunAId = '';
  compareRunBId = '';
  runDiff: RunDiff | null = null;
  loadingDiff = false;

  // ── Avancé ────────────────────────────────────────────────────────────────
  showVarModal = false;
  varForm: Partial<ContextVariable> = {};
  varEditing: ContextVariable | null = null;
  varSaving = false;
  deletingVarId: string | null = null;
  webhookSecret = '';
  webhookLoading = false;
  showWebhookSecret = false;
  templateCategoryFilter = '';
  advancedSubTab: 'variables' | 'templates' | 'webhook' | 'tags' = 'variables';

  readonly tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'catalogue', label: 'Catalogue', icon: 'folder_open' },
    { id: 'campagnes', label: 'Campagnes', icon: 'collections_bookmark' },
    { id: 'lancer',    label: 'Lancer',    icon: 'play_circle' },
    { id: 'rapports',  label: 'Rapports',  icon: 'bar_chart' },
    { id: 'avance',    label: 'Avancé',    icon: 'tune' }
  ];

  readonly scopeOptions: { value: RunScope; label: string; icon: string }[] = [
    { value: 'all',       label: 'Tous les tests actifs', icon: 'select_all' },
    { value: 'campaign',  label: 'Par campagne',          icon: 'collections_bookmark' },
    { value: 'tags',      label: 'Par tags',              icon: 'label' },
    { value: 'selection', label: 'Sélection manuelle',    icon: 'checklist' },
    { value: 'replay',    label: 'Replay échoués',        icon: 'replay' }
  ];

  readonly resultFilters: { v: '' | ResultStatus; label: string }[] = [
    { v: '',        label: 'Tous' },
    { v: 'passed',  label: 'Réussis' },
    { v: 'failed',  label: 'Échoués' },
    { v: 'skipped', label: 'Ignorés' },
    { v: 'blocked', label: 'Bloqués' }
  ];

  readonly advancedSubTabs: { id: 'variables' | 'templates' | 'webhook' | 'tags'; label: string; icon: string }[] = [
    { id: 'variables', label: 'Variables', icon: 'data_object' },
    { id: 'templates', label: 'Templates', icon: 'description' },
    { id: 'webhook',   label: 'Webhook',   icon: 'webhook' },
    { id: 'tags',      label: 'Tags',      icon: 'label' }
  ];

  readonly browsers = ['Chrome', 'Firefox', 'Safari', 'Edge', 'Opera'];
  readonly environments: { value: Environment; label: string }[] = [
    { value: 'local',      label: 'Local (localhost)' },
    { value: 'staging',    label: 'Staging' },
    { value: 'production', label: 'Production' },
    { value: 'custom',     label: 'Personnalisé' }
  ];
  readonly categoryIcons = ['layers', 'lock', 'person', 'settings', 'dashboard', 'search', 'build', 'star', 'check_circle', 'mail', 'shopping_cart', 'notifications', 'cloud', 'code', 'devices'];
  readonly categoryColors = ['teal', 'blue', 'green', 'violet', 'amber', 'red', 'orange', 'cyan', 'purple', 'pink'];
  readonly templateCategories = [
    { value: '', label: 'Tous' },
    { value: 'auth', label: 'Authentification' },
    { value: 'crud', label: 'CRUD' },
    { value: 'navigation', label: 'Navigation' },
    { value: 'forms', label: 'Formulaires' },
    { value: 'responsive', label: 'Responsive' },
    { value: 'accessibility', label: 'Accessibilité' }
  ];

  constructor(
    public svc: CahierRecetteService,
    public auth: AuthService,
    public configService: ConfigService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.runConfig.testerName = this.auth.currentUser()?.username || '';
  }

  // ── Open/Close ────────────────────────────────────────────────────────────

  async open() {
    this.isOpen = true;
    this.loading = true;
    this.tab = 'catalogue';
    await this.svc.loadAll();
    this.loading = false;
    if (this.svc.categories().length > 0 && !this.selectedCategoryId) {
      this.selectedCategoryId = this.svc.categories()[0].id;
    }
  }

  close() {
    if (this.svc.isRunning()) return;
    this.isOpen = false;
  }

  switchTab(t: Tab) {
    this.tab = t;
  }

  // ── Computed getters ──────────────────────────────────────────────────────

  get selectedCategory(): TestCategory | undefined {
    return this.svc.categories().find(c => c.id === this.selectedCategoryId);
  }

  get filteredTests(): TestCase[] {
    return this.svc.tests().filter(t => {
      if (t.categoryId !== this.selectedCategoryId) return false;
      if (this.testStatusFilter && t.status !== this.testStatusFilter) return false;
      if (this.testPriorityFilter && t.priority !== this.testPriorityFilter) return false;
      if (this.tagFilter && !t.tags.includes(this.tagFilter)) return false;
      if (this.testSearch) {
        const s = this.testSearch.toLowerCase();
        if (!t.name.toLowerCase().includes(s) && !(t.description || '').toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }

  get estimatedMinutes(): number {
    return this.svc.estimateDuration(this.selectedTestsForRun.map(t => t.id));
  }

  get selectedTestsForRun(): TestCase[] {
    if (this.runConfig.scope === 'all') return this.svc.tests().filter(t => t.status === 'active');
    if (this.runConfig.scope === 'campaign' && this.runConfig.campaignId) {
      const camp = this.svc.campaigns().find(c => c.id === this.runConfig.campaignId);
      return this.svc.tests().filter(t => camp?.testIds.includes(t.id));
    }
    if (this.runConfig.scope === 'tags') {
      return this.svc.tests().filter(t => t.status === 'active' && t.tags.some(tag => this.runConfig.selectedTags.includes(tag)));
    }
    if (this.runConfig.scope === 'selection' || this.runConfig.scope === 'replay') {
      return this.svc.tests().filter(t => this.runConfig.selectedTestIds.includes(t.id));
    }
    return [];
  }

  get filteredRunTests(): TestCase[] {
    if (!this.runLaunchSelSearch) return this.svc.tests().filter(t => t.status === 'active');
    const s = this.runLaunchSelSearch.toLowerCase();
    return this.svc.tests().filter(t => t.status === 'active' && t.name.toLowerCase().includes(s));
  }

  get campFilteredTests(): TestCase[] {
    if (!this.campTestSearch) return this.svc.tests();
    const s = this.campTestSearch.toLowerCase();
    return this.svc.tests().filter(t => t.name.toLowerCase().includes(s));
  }

  get filteredRunDetail(): TestResult[] {
    if (!this.selectedRun) return [];
    if (!this.runDetailResultFilter) return this.selectedRun.results;
    return this.selectedRun.results.filter(r => r.status === this.runDetailResultFilter);
  }

  get filteredTemplates(): TestTemplate[] {
    if (!this.templateCategoryFilter) return this.svc.templates();
    return this.svc.templates().filter(t => t.category === this.templateCategoryFilter);
  }

  // ── Catalogue CRUD ────────────────────────────────────────────────────────

  openCreateCategory() {
    this.catEditing = null;
    this.catForm = { name: '', description: '', icon: 'layers', color: 'teal', order: this.svc.categories().length + 1 };
    this.showCatModal = true;
  }

  openEditCategory(cat: TestCategory, e: Event) {
    e.stopPropagation();
    this.catEditing = cat;
    this.catForm = { ...cat };
    this.showCatModal = true;
  }

  async saveCategory() {
    if (!this.catForm.name?.trim()) return;
    this.catSaving = true;
    try {
      if (this.catEditing) {
        await this.svc.updateCategory(this.catEditing.id, this.catForm);
      } else {
        const cat = await this.svc.createCategory(this.catForm);
        this.selectedCategoryId = (cat as any).id || '';
      }
      this.showCatModal = false;
    } finally { this.catSaving = false; }
  }

  async deleteCategory(id: string, e: Event) {
    e.stopPropagation();
    this.deletingCatId = id;
  }

  async confirmDeleteCategory() {
    if (!this.deletingCatId) return;
    await this.svc.deleteCategory(this.deletingCatId);
    if (this.selectedCategoryId === this.deletingCatId) {
      this.selectedCategoryId = this.svc.categories()[0]?.id || '';
    }
    this.deletingCatId = null;
  }

  openCreateTest() {
    this.testEditing = null;
    this.testForm = {
      name: '', description: '', categoryId: this.selectedCategoryId,
      priority: 'normale', status: 'active', tags: [], targetPages: [],
      estimatedMinutes: 5, dependsOn: [], steps: [], preconditions: '',
      stepsText: ''
    };
    this.showTestModal = true;
  }

  openEditTest(t: TestCase) {
    this.testEditing = t;
    this.testForm = {
      ...t,
      tags: [...t.tags],
      targetPages: [...t.targetPages],
      dependsOn: [...t.dependsOn],
      stepsText: t.steps.map(s => `${s.page}|${s.action}|${s.element}|${s.expected}`).join('\n')
    };
    this.showTestModal = true;
  }

  parseSteps(text: string): TestStep[] {
    return (text || '').split('\n').filter(l => l.includes('|')).map((line, i) => {
      const parts = line.split('|');
      return {
        order: i + 1,
        page:     (parts[0] || '').trim(),
        action:   (parts[1] || '').trim(),
        element:  (parts[2] || '').trim(),
        expected: (parts[3] || '').trim()
      };
    });
  }

  async saveTest() {
    if (!this.testForm.name?.trim()) return;
    this.testSaving = true;
    const steps = this.parseSteps(this.testForm.stepsText || '');
    const { stepsText, ...rest } = this.testForm as any;
    const payload = { ...rest, steps };
    try {
      if (this.testEditing) {
        await this.svc.updateTest(this.testEditing.id, payload);
      } else {
        await this.svc.createTest(payload);
      }
      this.showTestModal = false;
    } finally { this.testSaving = false; }
  }

  async deleteTest(id: string) {
    this.deletingTestId = id;
  }

  async confirmDeleteTest() {
    if (!this.deletingTestId) return;
    await this.svc.deleteTest(this.deletingTestId);
    if (this.showTestDetail?.id === this.deletingTestId) this.showTestDetail = null;
    this.deletingTestId = null;
  }

  addTag(form: Partial<TestCase>, tag: string) {
    const tags = form.tags || [];
    if (tag.trim() && !tags.includes(tag.trim())) tags.push(tag.trim());
    form.tags = [...tags];
  }

  removeTag(form: Partial<TestCase>, tag: string) {
    form.tags = (form.tags || []).filter(t => t !== tag);
  }

  addTargetPage(form: Partial<TestCase>, page: string) {
    const pages = form.targetPages || [];
    if (page.trim() && !pages.includes(page.trim())) pages.push(page.trim());
    form.targetPages = [...pages];
  }

  removeTargetPage(form: Partial<TestCase>, page: string) {
    form.targetPages = (form.targetPages || []).filter(p => p !== page);
  }

  // ── Campaigns CRUD ────────────────────────────────────────────────────────

  openCreateCampaign() {
    this.campaignEditing = null;
    this.campaignForm = { name: '', description: '', testIds: [], tags: [] };
    this.campaignTagInput = '';
    this.showCampaignModal = true;
  }

  openEditCampaign(c: Campaign) {
    this.campaignEditing = c;
    this.campaignForm = { ...c, testIds: [...c.testIds], tags: [...c.tags] };
    this.campaignTagInput = '';
    this.showCampaignModal = true;
  }

  async saveCampaign() {
    if (!this.campaignForm.name?.trim()) return;
    this.campaignSaving = true;
    try {
      if (this.campaignEditing) {
        await this.svc.updateCampaign(this.campaignEditing.id, this.campaignForm);
        if (this.selectedCampaign?.id === this.campaignEditing.id) {
          this.selectedCampaign = this.svc.campaigns().find(c => c.id === this.campaignEditing!.id) || null;
        }
      } else {
        await this.svc.createCampaign(this.campaignForm);
      }
      this.showCampaignModal = false;
    } finally { this.campaignSaving = false; }
  }

  async deleteCampaign(id: string) {
    this.deletingCampaignId = id;
  }

  async confirmDeleteCampaign() {
    if (!this.deletingCampaignId) return;
    await this.svc.deleteCampaign(this.deletingCampaignId);
    if (this.selectedCampaign?.id === this.deletingCampaignId) this.selectedCampaign = null;
    this.deletingCampaignId = null;
  }

  toggleTestInCampaign(testId: string) {
    const ids = [...(this.campaignForm.testIds || [])];
    const idx = ids.indexOf(testId);
    if (idx >= 0) ids.splice(idx, 1); else ids.push(testId);
    this.campaignForm = { ...this.campaignForm, testIds: ids };
  }

  addCampaignTag() {
    const t = this.campaignTagInput.trim();
    if (!t) return;
    const tags = [...(this.campaignForm.tags || [])];
    if (!tags.includes(t)) tags.push(t);
    this.campaignForm = { ...this.campaignForm, tags };
    this.campaignTagInput = '';
  }

  removeCampaignTag(tag: string) {
    this.campaignForm = { ...this.campaignForm, tags: (this.campaignForm.tags || []).filter(t => t !== tag) };
  }

  campaignTestCount(c: Campaign): number {
    return c.testIds.length;
  }

  campaignDuration(c: Campaign): number {
    return this.svc.estimateDuration(c.testIds);
  }

  // ── Run Launch ────────────────────────────────────────────────────────────

  toggleTag(tag: string) {
    const idx = this.runConfig.selectedTags.indexOf(tag);
    if (idx >= 0) this.runConfig.selectedTags.splice(idx, 1);
    else this.runConfig.selectedTags.push(tag);
    this.runConfig.selectedTags = [...this.runConfig.selectedTags];
  }

  toggleTestSelection(id: string) {
    const idx = this.runConfig.selectedTestIds.indexOf(id);
    if (idx >= 0) this.runConfig.selectedTestIds.splice(idx, 1);
    else this.runConfig.selectedTestIds.push(id);
    this.runConfig.selectedTestIds = [...this.runConfig.selectedTestIds];
  }

  launchRun() {
    if (!this.runConfig.name.trim()) { this.runError = 'Donnez un nom au run.'; return; }
    if ((this.runConfig.scope === 'selection' || this.runConfig.scope === 'replay') && this.runConfig.selectedTestIds.length === 0) {
      this.runError = 'Sélectionnez au moins un test.'; return;
    }
    if (this.runConfig.scope === 'campaign' && !this.runConfig.campaignId) {
      this.runError = 'Sélectionnez une campagne.'; return;
    }
    if (this.runConfig.scope === 'tags' && this.runConfig.selectedTags.length === 0) {
      this.runError = 'Sélectionnez au moins un tag.'; return;
    }
    this.runError = '';
    this.showLiveProgress = true;
    this.liveResultDetail = null;

    this.svc.launchRun(this.runConfig, {
      onComplete: async (data) => {
        await this.loadRunDetail(data.runId);
        this.showLiveProgress = false;
        this.tab = 'rapports';
      },
      onError: (err) => {
        this.runError = err;
        this.showLiveProgress = false;
      }
    });
  }

  abortRun() {
    this.svc.abortRun();
    this.showLiveProgress = false;
  }

  runProgressPct(): number {
    const p = this.svc.runProgress();
    if (!p || p.total === 0) return 0;
    return Math.round((p.current / p.total) * 100);
  }

  resultColor(status: string): string {
    return { passed: 'green', failed: 'red', skipped: 'gray', blocked: 'orange' }[status] ?? 'gray';
  }

  resultIcon(status: string): string {
    return { passed: 'check_circle', failed: 'cancel', skipped: 'remove_circle', blocked: 'block' }[status] ?? 'help';
  }

  // ── Rapports ──────────────────────────────────────────────────────────────

  async loadRunDetail(id: string) {
    this.loadingRun = true;
    this.selectedRun = null;
    this.runDiff = null;
    try { this.selectedRun = await this.svc.getRun(id); } finally { this.loadingRun = false; }
  }

  async deleteRun(id: string) {
    if (this.selectedRun?.id === id) this.selectedRun = null;
    await this.svc.deleteRun(id);
  }

  async replayRun(run: TestRun) {
    const ids = await this.svc.getReplayIds(run.id);
    if (ids.length === 0) return;
    this.runConfig.scope = 'replay';
    this.runConfig.selectedTestIds = ids;
    this.runConfig.name = `Replay – ${run.name}`;
    this.tab = 'lancer';
    this.showLiveProgress = false;
  }

  async compareRuns() {
    if (!this.compareRunAId || !this.compareRunBId) return;
    this.loadingDiff = true;
    this.runDiff = null;
    try { this.runDiff = await this.svc.compareRuns(this.compareRunAId, this.compareRunBId); }
    finally { this.loadingDiff = false; }
  }

  exportRun(format: 'json' | 'md') {
    if (!this.selectedRun) return;
    window.open(this.svc.exportRunUrl(this.selectedRun.id, format), '_blank');
  }

  testNameById(id: string): string {
    return this.svc.tests().find(t => t.id === id)?.name || id;
  }

  scoreClass(score: number): string {
    if (score >= 90) return 'text-green-400';
    if (score >= 70) return 'text-yellow-400';
    return 'text-red-400';
  }

  scoreBgClass(score: number): string {
    if (score >= 90) return 'bg-green-500';
    if (score >= 70) return 'bg-yellow-500';
    return 'bg-red-500';
  }

  scoreSparklinePts(): string {
    const hist = this.svc.scoreHistory();
    if (hist.length < 2) return '';
    const W = 160, H = 32;
    return hist.map((h, i) => {
      const x = (i / (hist.length - 1)) * W;
      const y = H - (h.score / 100) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  // ── Variables ─────────────────────────────────────────────────────────────

  openCreateVar() {
    this.varEditing = null;
    this.varForm = { name: '', value: '', description: '' };
    this.showVarModal = true;
  }

  openEditVar(v: ContextVariable) {
    this.varEditing = v;
    this.varForm = { ...v };
    this.showVarModal = true;
  }

  async saveVar() {
    if (!this.varForm.name?.trim()) return;
    this.varSaving = true;
    try {
      if (this.varEditing) await this.svc.updateVariable(this.varEditing.id, this.varForm);
      else await this.svc.createVariable(this.varForm);
      this.showVarModal = false;
    } finally { this.varSaving = false; }
  }

  deleteVar(id: string) { this.deletingVarId = id; }

  async confirmDeleteVar() {
    if (!this.deletingVarId) return;
    await this.svc.deleteVariable(this.deletingVarId);
    this.deletingVarId = null;
  }

  // ── Webhook ───────────────────────────────────────────────────────────────

  async loadWebhookSecret() {
    this.webhookLoading = true;
    this.webhookSecret = await this.svc.getWebhookSecret();
    this.showWebhookSecret = true;
    this.webhookLoading = false;
  }

  async regenerateWebhookSecret() {
    this.webhookLoading = true;
    this.webhookSecret = await this.svc.regenerateWebhookSecret();
    this.webhookLoading = false;
  }

  webhookUrl(): string {
    const env = this.configService.cliConfig().availableProviders;
    return `${window.location.origin}/api/recette/webhook/trigger`;
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  async importTemplate(t: TestTemplate) {
    const testCase: Partial<TestCase> = {
      name: t.name,
      categoryId: this.selectedCategoryId || this.svc.categories()[0]?.id || '',
      priority: 'normale',
      status: 'draft',
      tags: [...t.tags],
      targetPages: [],
      estimatedMinutes: t.estimatedMinutes,
      dependsOn: [],
      steps: [...t.steps],
      preconditions: t.preconditions,
      description: t.description
    };
    await this.svc.importTests([testCase]);
    this.tab = 'catalogue';
  }

  // ── Helpers CSS ───────────────────────────────────────────────────────────

  catColorCls(color: string): string {
    const map: Record<string, string> = {
      teal:   'text-teal-400',   blue:   'text-blue-400',
      green:  'text-green-400',  red:    'text-red-400',
      amber:  'text-amber-400',  orange: 'text-orange-400',
      violet: 'text-violet-400', purple: 'text-purple-400',
      cyan:   'text-cyan-400',   pink:   'text-pink-400'
    };
    return map[color] || 'text-teal-400';
  }

  catBgCls(color: string): string {
    const map: Record<string, string> = {
      teal:   'bg-teal-500/20 border-teal-500/30',   blue:   'bg-blue-500/20 border-blue-500/30',
      green:  'bg-green-500/20 border-green-500/30',  red:    'bg-red-500/20 border-red-500/30',
      amber:  'bg-amber-500/20 border-amber-500/30',  orange: 'bg-orange-500/20 border-orange-500/30',
      violet: 'bg-violet-500/20 border-violet-500/30',purple: 'bg-purple-500/20 border-purple-500/30',
      cyan:   'bg-cyan-500/20 border-cyan-500/30',    pink:   'bg-pink-500/20 border-pink-500/30'
    };
    return map[color] || 'bg-teal-500/20 border-teal-500/30';
  }

  priorityColor(p: string): string {
    return { critique: 'text-red-400', haute: 'text-orange-400', normale: 'text-blue-400', basse: 'text-gray-400' }[p] ?? 'text-gray-400';
  }

  priorityBadgeCls(p: string): string {
    return {
      critique: 'bg-red-500/20 text-red-400 border border-red-500/30',
      haute:    'bg-orange-500/20 text-orange-400 border border-orange-500/30',
      normale:  'bg-blue-500/20 text-blue-400 border border-blue-500/30',
      basse:    'bg-gray-500/20 text-gray-400 border border-gray-500/30'
    }[p] ?? 'bg-gray-500/20 text-gray-400';
  }

  statusBadgeCls(s: string): string {
    return {
      active:     'bg-green-500/20 text-green-400 border border-green-500/30',
      draft:      'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
      deprecated: 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
    }[s] ?? 'bg-gray-500/20 text-gray-400';
  }

  resultBadgeCls(s: string): string {
    return {
      passed:  'bg-green-500/20 text-green-400 border border-green-500/30',
      failed:  'bg-red-500/20 text-red-400 border border-red-500/30',
      skipped: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
      blocked: 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
    }[s] ?? 'bg-gray-500/20 text-gray-400';
  }

  statusLabel(s: string): string {
    return { active: 'Actif', draft: 'Brouillon', deprecated: 'Obsolète' }[s] ?? s;
  }

  priorityLabel(p: string): string {
    return { critique: 'Critique', haute: 'Haute', normale: 'Normale', basse: 'Basse' }[p] ?? p;
  }

  resultLabel(s: string): string {
    return { passed: 'Réussi', failed: 'Échoué', skipped: 'Ignoré', blocked: 'Bloqué' }[s] ?? s;
  }

  openDoc() { window.open('/cahier-recette-doc', '_blank'); }

  formatDate(d: string): string {
    try { return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return d; }
  }

  trackById(_i: number, item: { id: string }) { return item.id; }
}

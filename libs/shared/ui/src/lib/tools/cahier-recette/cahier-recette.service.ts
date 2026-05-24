import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService, ConfigService, API_DATA_URL, API_EXECUTOR_URL } from '@worganic/portail-core/data-access';
import type {
  TestCase, TestCategory, Campaign, TestRun, ContextVariable,
  TestTemplate, RunProgress, TestResult, RunDiff, PageTestSuggestion
} from './cahier-recette.types';

@Injectable({ providedIn: 'root' })
export class CahierRecetteService {

  private apiUrl = inject(API_DATA_URL);
  private executorUrl = inject(API_EXECUTOR_URL);

  // ── Données en mémoire ──────────────────────────────────────────────────────
  categories  = signal<TestCategory[]>([]);
  tests       = signal<TestCase[]>([]);
  campaigns   = signal<Campaign[]>([]);
  runs        = signal<TestRun[]>([]);
  variables   = signal<ContextVariable[]>([]);
  templates   = signal<TestTemplate[]>([]);

  // ── État du run en cours ────────────────────────────────────────────────────
  runProgress = signal<RunProgress | null>(null);
  isRunning   = signal<boolean>(false);

  private runAbort: AbortController | null = null;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    public  configService: ConfigService
  ) {}

  // ── Chargement ──────────────────────────────────────────────────────────────

  async loadAll() {
    await Promise.all([
      this.loadCategories(),
      this.loadTests(),
      this.loadCampaigns(),
      this.loadRuns(),
      this.loadVariables(),
      this.loadTemplates()
    ]);
  }

  async loadCategories() {
    try {
      const d: any = await this.http.get(`${this.apiUrl}/api/recette/categories`, { headers: this.auth.getAuthHeaders() }).toPromise();
      this.categories.set((d.categories || []).sort((a: TestCategory, b: TestCategory) => a.order - b.order));
    } catch {}
  }

  async loadTests() {
    try {
      const d: any = await this.http.get(`${this.apiUrl}/api/recette/tests`, { headers: this.auth.getAuthHeaders() }).toPromise();
      this.tests.set(d.tests || []);
    } catch {}
  }

  async loadCampaigns() {
    try {
      const d: any = await this.http.get(`${this.apiUrl}/api/recette/campaigns`, { headers: this.auth.getAuthHeaders() }).toPromise();
      this.campaigns.set(d.campaigns || []);
    } catch {}
  }

  async loadRuns() {
    try {
      const d: any = await this.http.get(`${this.apiUrl}/api/recette/runs`, { headers: this.auth.getAuthHeaders() }).toPromise();
      this.runs.set((d.runs || []).reverse());
    } catch {}
  }

  async loadVariables() {
    try {
      const d: any = await this.http.get(`${this.apiUrl}/api/recette/variables`, { headers: this.auth.getAuthHeaders() }).toPromise();
      this.variables.set(d.variables || []);
    } catch {}
  }

  async loadTemplates() {
    try {
      const d: any = await this.http.get(`${this.apiUrl}/api/recette/templates`, { headers: this.auth.getAuthHeaders() }).toPromise();
      this.templates.set(d.templates || []);
    } catch {}
  }

  // ── Catégories ──────────────────────────────────────────────────────────────

  async createCategory(data: Partial<TestCategory>): Promise<TestCategory> {
    const r: any = await this.http.post(`${this.apiUrl}/api/recette/categories`, data, { headers: this.auth.getAuthHeaders() }).toPromise();
    await this.loadCategories();
    return r;
  }

  async updateCategory(id: string, data: Partial<TestCategory>): Promise<TestCategory> {
    const r: any = await this.http.put(`${this.apiUrl}/api/recette/categories/${id}`, data, { headers: this.auth.getAuthHeaders() }).toPromise();
    await this.loadCategories();
    return r;
  }

  async deleteCategory(id: string): Promise<void> {
    await this.http.delete(`${this.apiUrl}/api/recette/categories/${id}`, { headers: this.auth.getAuthHeaders() }).toPromise();
    await this.loadCategories();
  }

  // ── Tests ────────────────────────────────────────────────────────────────────

  async createTest(data: Partial<TestCase>): Promise<TestCase> {
    const r: any = await this.http.post(`${this.apiUrl}/api/recette/tests`, data, { headers: this.auth.getAuthHeaders() }).toPromise();
    await this.loadTests();
    return r;
  }

  async updateTest(id: string, data: Partial<TestCase>): Promise<TestCase> {
    const r: any = await this.http.put(`${this.apiUrl}/api/recette/tests/${id}`, data, { headers: this.auth.getAuthHeaders() }).toPromise();
    await this.loadTests();
    return r;
  }

  async deleteTest(id: string): Promise<void> {
    await this.http.delete(`${this.apiUrl}/api/recette/tests/${id}`, { headers: this.auth.getAuthHeaders() }).toPromise();
    await this.loadTests();
  }

  async importTests(tests: Partial<TestCase>[]): Promise<void> {
    await this.http.post(`${this.apiUrl}/api/recette/tests/import`, { tests }, { headers: this.auth.getAuthHeaders() }).toPromise();
    await this.loadTests();
  }

  // ── Campagnes ────────────────────────────────────────────────────────────────

  async createCampaign(data: Partial<Campaign>): Promise<Campaign> {
    const r: any = await this.http.post(`${this.apiUrl}/api/recette/campaigns`, data, { headers: this.auth.getAuthHeaders() }).toPromise();
    await this.loadCampaigns();
    return r;
  }

  async updateCampaign(id: string, data: Partial<Campaign>): Promise<Campaign> {
    const r: any = await this.http.put(`${this.apiUrl}/api/recette/campaigns/${id}`, data, { headers: this.auth.getAuthHeaders() }).toPromise();
    await this.loadCampaigns();
    return r;
  }

  async deleteCampaign(id: string): Promise<void> {
    await this.http.delete(`${this.apiUrl}/api/recette/campaigns/${id}`, { headers: this.auth.getAuthHeaders() }).toPromise();
    await this.loadCampaigns();
  }

  // ── Variables ────────────────────────────────────────────────────────────────

  async createVariable(data: Partial<ContextVariable>): Promise<ContextVariable> {
    const r: any = await this.http.post(`${this.apiUrl}/api/recette/variables`, data, { headers: this.auth.getAuthHeaders() }).toPromise();
    await this.loadVariables();
    return r;
  }

  async updateVariable(id: string, data: Partial<ContextVariable>): Promise<ContextVariable> {
    const r: any = await this.http.put(`${this.apiUrl}/api/recette/variables/${id}`, data, { headers: this.auth.getAuthHeaders() }).toPromise();
    await this.loadVariables();
    return r;
  }

  async deleteVariable(id: string): Promise<void> {
    await this.http.delete(`${this.apiUrl}/api/recette/variables/${id}`, { headers: this.auth.getAuthHeaders() }).toPromise();
    await this.loadVariables();
  }

  // ── Runs ─────────────────────────────────────────────────────────────────────

  async getRun(id: string): Promise<TestRun> {
    return await this.http.get<TestRun>(`${this.apiUrl}/api/recette/runs/${id}`, { headers: this.auth.getAuthHeaders() }).toPromise() as TestRun;
  }

  async deleteRun(id: string): Promise<void> {
    await this.http.delete(`${this.apiUrl}/api/recette/runs/${id}`, { headers: this.auth.getAuthHeaders() }).toPromise();
    await this.loadRuns();
  }

  async compareRuns(a: string, b: string): Promise<RunDiff> {
    return await this.http.get<RunDiff>(`${this.apiUrl}/api/recette/runs/compare?a=${a}&b=${b}`, { headers: this.auth.getAuthHeaders() }).toPromise() as RunDiff;
  }

  async getReplayIds(runId: string): Promise<string[]> {
    const r: any = await this.http.post(`${this.apiUrl}/api/recette/runs/replay/${runId}`, {}, { headers: this.auth.getAuthHeaders() }).toPromise();
    return r.testIds || [];
  }

  exportRunUrl(runId: string, format: 'json' | 'md'): string {
    return `${this.apiUrl}/api/recette/runs/${runId}/export?format=${format}`;
  }

  // ── Lancement SSE ────────────────────────────────────────────────────────────

  launchRun(config: any, callbacks: {
    onStart?: (data: any) => void;
    onTestStart?: (data: any) => void;
    onTestResult?: (data: any) => void;
    onComplete?: (data: any) => void;
    onError?: (err: string) => void;
  }): void {
    if (this.isRunning()) return;
    this.isRunning.set(true);
    this.runProgress.set(null);
    this.runAbort = new AbortController();

    const token = this.auth.getToken();
    fetch(`${this.apiUrl}/api/recette/runs/launch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(config),
      signal: this.runAbort.signal
    }).then(async response => {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          const eventMatch = part.match(/^event: (\w+)/m);
          const dataMatch  = part.match(/^data: (.+)/m);
          if (!eventMatch || !dataMatch) continue;
          const event = eventMatch[1];
          let data: any;
          try { data = JSON.parse(dataMatch[1]); } catch { continue; }

          switch (event) {
            case 'start':
              this.runProgress.set({ runId: data.runId, current: 0, total: data.total, currentTestId: '', currentTestName: '', partialResults: [], status: 'running' });
              callbacks.onStart?.(data);
              break;
            case 'test-start':
              this.runProgress.update(p => p ? { ...p, current: data.index, currentTestId: data.testId, currentTestName: data.name } : p);
              callbacks.onTestStart?.(data);
              break;
            case 'test-result':
              this.runProgress.update(p => p ? { ...p, partialResults: [...p.partialResults, data.result] } : p);
              callbacks.onTestResult?.(data);
              break;
            case 'complete':
              this.runProgress.update(p => p ? { ...p, status: 'complete' } : p);
              callbacks.onComplete?.(data);
              this.isRunning.set(false);
              this.loadRuns();
              break;
          }
        }
      }
    }).catch(err => {
      if (err.name !== 'AbortError') {
        this.isRunning.set(false);
        callbacks.onError?.(err.message);
      }
    });
  }

  abortRun() {
    this.runAbort?.abort();
    this.isRunning.set(false);
  }

  // ── Analyse de page ──────────────────────────────────────────────────────────

  async analyzePage(pageUrl: string, pageTitle: string, pageContent: string, aiProvider: string, aiModel: string, exclusions: string[] = [], onChunk?: (chunk: string) => void): Promise<{ suggestions: PageTestSuggestion[]; rawText: string }> {
    const exclusionNote = exclusions.length > 0
      ? `\nIMPORTANT — Les zones suivantes ont été exclues du contenu et ne doivent PAS faire l'objet de tests : ${exclusions.join(', ')}. Concentre-toi uniquement sur le contenu principal et fonctionnel de la page.\n`
      : '';

    const prompt = `Tu es un expert QA. Analyse cette page Angular et génère des cas de tests QA exhaustifs.

Page : "${pageTitle}" (${pageUrl})
Contenu visible (zones exclues retirées) : ${(pageContent || '').slice(0, 3000)}
${exclusionNote}
Génère entre 3 et 8 cas de tests couvrant les fonctionnalités visibles.
Réponds UNIQUEMENT en JSON valide, sans markdown.

Format :
{
  "suggestions": [
    {
      "name": "string",
      "categoryName": "string",
      "description": "string",
      "priority": "critique|haute|normale|basse",
      "tags": ["string"],
      "targetPages": ["${pageUrl}"],
      "preconditions": "string",
      "estimatedMinutes": number,
      "steps": [
        { "order": number, "page": "${pageUrl}", "action": "string", "element": "string", "expected": "string" }
      ]
    }
  ]
}`;

    const response = await fetch(`${this.executorUrl}/execute-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stepId: 'recette-analyze-page', content: prompt, provider: aiProvider, model: aiModel })
    });

    if (!response.ok) throw new Error(`Executor inaccessible (${response.status}). Vérifiez que l'application bureau est lancée.`);

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullOutput = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const part of parts) {
        const dataMatch = part.match(/^data: (.+)/m);
        if (!dataMatch) continue;
        try {
          const data = JSON.parse(dataMatch[1]);
          if (data.type === 'stdout') { fullOutput += data.message; onChunk?.(data.message); }
          else if (data.type === 'stderr') { onChunk?.(`[stderr] ${data.message}`); }
          else if (data.type === 'info' || data.type === 'start') { onChunk?.(data.message); }
        } catch {}
      }
    }

    const stripMarkdown = (text: string) => text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
    const cleaned = stripMarkdown(fullOutput);

    let suggestions: PageTestSuggestion[] = [];
    try {
      const jsonStart = cleaned.indexOf('{');
      const jsonEnd = cleaned.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const parsed = JSON.parse(cleaned.substring(jsonStart, jsonEnd + 1));
        suggestions = parsed.suggestions || [];
      }
    } catch (e: any) {
      throw new Error(`Erreur parsing JSON: ${e.message}. Réponse brute: ${fullOutput.substring(0, 500)}`);
    }

    return { suggestions, rawText: fullOutput };
  }

  // ── Webhook ──────────────────────────────────────────────────────────────────

  async getWebhookSecret(): Promise<string> {
    const r: any = await this.http.get(`${this.apiUrl}/api/recette/webhook/secret`, { headers: this.auth.getAuthHeaders() }).toPromise();
    return r.secret || '';
  }

  async regenerateWebhookSecret(): Promise<string> {
    const r: any = await this.http.post(`${this.apiUrl}/api/recette/webhook/regenerate`, {}, { headers: this.auth.getAuthHeaders() }).toPromise();
    return r.secret || '';
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  getTestsForCategory(categoryId: string): TestCase[] {
    return this.tests().filter(t => t.categoryId === categoryId);
  }

  getTestsForPage(pageUrl: string): TestCase[] {
    const path = new URL(pageUrl, 'http://x').pathname;
    return this.tests().filter(t =>
      t.status === 'active' &&
      (t.targetPages || []).some(p => {
        const tp = p.split('?')[0];
        return path === tp || path.startsWith(tp + '/') || tp === '*';
      })
    );
  }

  estimateDuration(testIds: string[]): number {
    return this.tests()
      .filter(t => testIds.includes(t.id))
      .reduce((sum, t) => sum + (t.estimatedMinutes || 1), 0);
  }

  scoreHistory(): { date: string; score: number; name: string }[] {
    return this.runs()
      .filter(r => r.status === 'completed')
      .slice(0, 20)
      .map(r => ({ date: r.date, score: r.summary.score, name: r.name }))
      .reverse();
  }

  allTags(): string[] {
    const tagSet = new Set<string>();
    this.tests().forEach(t => (t.tags || []).forEach(tag => tagSet.add(tag)));
    return [...tagSet].sort();
  }
}

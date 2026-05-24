// ─── Types de base ────────────────────────────────────────────────────────────

export type TestPriority = 'critique' | 'haute' | 'normale' | 'basse';
export type TestStatus   = 'active' | 'draft' | 'deprecated';
export type RunStatus    = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type ResultStatus = 'passed' | 'failed' | 'skipped' | 'blocked';
export type RunScope     = 'all' | 'campaign' | 'tags' | 'selection' | 'replay';
export type Environment  = 'local' | 'staging' | 'production' | 'custom';
export type TemplateCategory = 'auth' | 'crud' | 'navigation' | 'forms' | 'responsive' | 'accessibility';

// ─── Étape de test ────────────────────────────────────────────────────────────

export interface TestStep {
  order: number;
  page: string;        // Chemin / URL de la page (ex: /login)
  action: string;      // Action à effectuer (humain)
  element: string;     // Élément cible (sélecteur, label visible)
  expected: string;    // Résultat attendu
}

// ─── Cas de test ──────────────────────────────────────────────────────────────

export interface TestCase {
  id: string;
  categoryId: string;
  name: string;
  description?: string;
  priority: TestPriority;
  status: TestStatus;
  preconditions?: string;
  tags: string[];
  targetPages: string[];     // Pages couvertes (matching pour le widget flottant)
  estimatedMinutes: number;
  dependsOn: string[];       // H: IDs des tests dont ce test dépend
  steps: TestStep[];
  createdAt: string;
  updatedAt: string;
}

// ─── Catégorie ────────────────────────────────────────────────────────────────

export interface TestCategory {
  id: string;
  name: string;
  description?: string;
  icon: string;
  color: string;   // tailwind color name: blue, green, violet, amber, teal, red, orange, cyan
  order: number;
}

// ─── Campagne ────────────────────────────────────────────────────────────────

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  testIds: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── Variable de contexte (G) ─────────────────────────────────────────────────

export interface ContextVariable {
  id: string;
  name: string;          // Ex: BASE_URL
  value: string;         // Ex: https://app.frankenstein.fr
  description?: string;
}

// ─── Template de test (E) ─────────────────────────────────────────────────────

export interface TestTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  tags: string[];
  estimatedMinutes: number;
  steps: TestStep[];
  preconditions?: string;
}

// ─── Résultats d'exécution ───────────────────────────────────────────────────

export interface StepResult {
  order: number;
  status: ResultStatus;
  actual: string;
  note: string;
  durationMs?: number;
}

export interface TestResult {
  testId: string;
  status: ResultStatus;
  score: number;          // 0–100
  aiComment: string;
  durationMs: number;
  steps: StepResult[];
  blockedBy?: string;     // H: ID du test bloquant
}

export interface RunSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
  score: number;          // 0–100 = passed / (total - skipped - blocked)
  durationMs: number;
}

// ─── Exécution (Run) ─────────────────────────────────────────────────────────

export interface TestRun {
  id: string;
  name: string;
  date: string;
  siteName: string;
  siteUrl: string;
  browser: string;
  environment: string;
  testerName: string;
  aiProvider: string;
  aiModel: string;
  scope: RunScope;
  campaignId?: string;
  testIds: string[];
  tags: string[];
  variables: ContextVariable[];
  status: RunStatus;
  summary: RunSummary;
  results: TestResult[];
  webhookTriggered?: boolean;
}

// ─── Progression en temps réel ───────────────────────────────────────────────

export interface RunProgress {
  runId: string;
  current: number;
  total: number;
  currentTestId: string;
  currentTestName: string;
  partialResults: TestResult[];
  status: 'running' | 'complete' | 'error';
  errorMessage?: string;
}

// ─── Comparaison de runs (C) ─────────────────────────────────────────────────

export interface RunDiff {
  runAId: string;
  runBId: string;
  regressions: string[];    // testIds passés en FAILED
  fixes: string[];          // testIds passés en PASSED
  unchanged: string[];
  scoreA: number;
  scoreB: number;
  scoreDelta: number;
}

// ─── Suggestion d'analyse de page (widget flottant) ──────────────────────────

export interface PageTestSuggestion {
  name: string;
  categoryName: string;
  description: string;
  priority: TestPriority;
  tags: string[];
  targetPages: string[];
  steps: TestStep[];
  preconditions?: string;
  estimatedMinutes: number;
}

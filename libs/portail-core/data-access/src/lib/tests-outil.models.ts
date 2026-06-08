export type TestCriticality = 'bloquant' | 'majeur' | 'mineur';
export type TestStatus = 'draft' | 'active' | 'archived';
export type TestResultStatus = 'pass' | 'fail' | 'skip' | 'pending';
export type TestGenerationSource = 'edition' | 'mockup' | 'ia';
export type TestRunMode = 'auto' | 'manual';
export type GoNoGo = 'GO' | 'NO-GO';

export interface TestStep {
  order: number;
  action: string;
  expected: string;
}

export interface TestCase {
  id: string;
  categoryId: string;
  title: string;
  description?: string;
  criticality: TestCriticality;
  status: TestStatus;
  source: TestGenerationSource | 'manual';
  sourceRef?: string;
  url?: string;
  steps: TestStep[];
  createdAt: string;
  updatedAt: string;
}

export interface TestCategory {
  id: string;
  name: string;
  order: number;
}

export interface TestSuite {
  projectId: string;
  categories: TestCategory[];
  cases: TestCase[];
  updatedAt: string;
}

export interface TestRunResult {
  caseId: string;
  status: TestResultStatus;
  notes?: string;
  testedBy?: string;
  testedAt?: string;
  aiComment?: string;
}

export interface TestRunSummary {
  total: number;
  pass: number;
  fail: number;
  skip: number;
  pending: number;
  score: number;
  goNoGo: GoNoGo;
  durationMs: number;
}

export interface TestRun {
  id: string;
  projectId: string;
  date: string;
  mode: TestRunMode;
  status: 'running' | 'completed' | 'cancelled';
  testerName?: string;
  targetUrl?: string;
  comment?: string;
  caseIds: string[];
  results: TestRunResult[];
  summary: TestRunSummary;
  createdAt: string;
}

export interface TestGenerateResponse {
  generated: Partial<TestCase>[];
  message?: string;
}

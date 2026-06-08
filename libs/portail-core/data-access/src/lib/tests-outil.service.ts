import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { API_DATA_URL } from './tokens';
import { AuthService } from './auth.service';
import {
  TestSuite,
  TestRun,
  TestGenerateResponse,
  TestRunResult,
  TestRunMode,
  TestGenerationSource,
} from './tests-outil.models';

@Injectable({ providedIn: 'root' })
export class TestsOutilService {
  private apiUrl = inject(API_DATA_URL);
  private auth = inject(AuthService);
  private http = inject(HttpClient);

  private h() { return this.auth.getAuthHeaders(); }
  private base(id: string) { return `${this.apiUrl}/api/projets-tests/${id}`; }

  getSuite(projectId: string): Promise<TestSuite> {
    return firstValueFrom(
      this.http.get<TestSuite>(`${this.base(projectId)}/suite`, { headers: this.h() })
    );
  }

  saveSuite(projectId: string, suite: Partial<TestSuite>): Promise<TestSuite> {
    return firstValueFrom(
      this.http.put<TestSuite>(`${this.base(projectId)}/suite`, suite, { headers: this.h() })
    );
  }

  generateCases(projectId: string, source: TestGenerationSource): Promise<TestGenerateResponse> {
    return firstValueFrom(
      this.http.post<TestGenerateResponse>(
        `${this.base(projectId)}/suite/generate`,
        { source },
        { headers: this.h() }
      )
    );
  }

  getEditionSections(projectId: string): Promise<{ id: string; name: string; depth: number }[]> {
    return firstValueFrom(
      this.http.get<{ sections: { id: string; name: string; depth: number }[] }>(
        `${this.base(projectId)}/edition/sections`,
        { headers: this.h() }
      )
    ).then(r => r.sections);
  }

  generateAITests(projectId: string, sectionId: string, sectionName: string): Promise<TestGenerateResponse> {
    return firstValueFrom(this.generateAITestsObs(projectId, sectionId, sectionName));
  }

  generateAITestsObs(projectId: string, sectionId: string, sectionName: string): Observable<TestGenerateResponse> {
    return this.http.post<TestGenerateResponse>(
      `${this.base(projectId)}/suite/generate`,
      { source: 'ia', sectionId, sectionName },
      { headers: this.h() }
    );
  }

  getRuns(projectId: string): Promise<{ runs: Omit<TestRun, 'results'>[] }> {
    return firstValueFrom(
      this.http.get<{ runs: Omit<TestRun, 'results'>[] }>(`${this.base(projectId)}/runs`, { headers: this.h() })
    );
  }

  getRun(projectId: string, runId: string): Promise<TestRun> {
    return firstValueFrom(
      this.http.get<TestRun>(`${this.base(projectId)}/runs/${runId}`, { headers: this.h() })
    );
  }

  deleteRun(projectId: string, runId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.base(projectId)}/runs/${runId}`, { headers: this.h() })
    );
  }

  launchManualRun(projectId: string, config: {
    testerName: string;
    caseIds?: string[];
    comment?: string;
  }): Promise<{ runId: string }> {
    return firstValueFrom(
      this.http.post<{ runId: string }>(
        `${this.base(projectId)}/runs/launch`,
        { mode: 'manual' as TestRunMode, ...config },
        { headers: this.h() }
      )
    );
  }

  updateRun(projectId: string, runId: string, patch: {
    results?: TestRunResult[];
    status?: TestRun['status'];
  }): Promise<TestRun> {
    return firstValueFrom(
      this.http.put<TestRun>(`${this.base(projectId)}/runs/${runId}`, patch, { headers: this.h() })
    );
  }

  /** SSE stream pour l'exécution automatique IA */
  launchAutoRun(projectId: string, config: {
    targetUrl?: string;
    caseIds?: string[];
    comment?: string;
  }): Observable<{ event: string; data: unknown }> {
    return new Observable(observer => {
      const token = this.auth.getToken();
      const params = new URLSearchParams();
      if (config.targetUrl) params.set('targetUrl', config.targetUrl);
      if (config.caseIds?.length) params.set('caseIds', config.caseIds.join(','));
      if (config.comment) params.set('comment', config.comment);
      if (token) params.set('token', token);

      const url = `${this.base(projectId)}/runs/launch?${params}`;
      const es = new EventSource(url);

      es.onmessage = (e) => {
        try { observer.next({ event: 'message', data: JSON.parse(e.data) }); }
        catch { observer.next({ event: 'message', data: e.data }); }
      };

      ['start', 'case-start', 'case-result', 'complete', 'error'].forEach(ev => {
        es.addEventListener(ev, (e: Event) => {
          try { observer.next({ event: ev, data: JSON.parse((e as MessageEvent).data) }); }
          catch { observer.next({ event: ev, data: (e as MessageEvent).data }); }
          if (ev === 'complete' || ev === 'error') {
            es.close();
            observer.complete();
          }
        });
      });

      es.onerror = () => { es.close(); observer.error('SSE connection error'); };

      return () => es.close();
    });
  }
}

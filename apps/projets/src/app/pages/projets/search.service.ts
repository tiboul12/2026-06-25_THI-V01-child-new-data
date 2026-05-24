import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService, API_DATA_URL } from '@worganic/portail-core/data-access';

export interface SearchResult {
  projectId: string;
  projectName: string;
  sectionId: string;
  sectionName: string;
  sectionPath: string[];
  fileId: string;
  fileName: string;
  excerpt: string;
  matchCount: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  truncated: boolean;
}

@Injectable({ providedIn: 'root' })
export class SearchService {
  private apiUrl = inject(API_DATA_URL);
  constructor(private http: HttpClient, private auth: AuthService) {}

  search(q: string, projectId?: string): Promise<SearchResponse> {
    let params = new HttpParams().set('q', q);
    if (projectId) params = params.set('projectId', projectId);
    return firstValueFrom(
      this.http.get<SearchResponse>(`${this.apiUrl}/api/search`, { headers: this.auth.getAuthHeaders(), params })
    );
  }
}

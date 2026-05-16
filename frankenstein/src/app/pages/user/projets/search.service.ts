import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';

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

const API = environment.apiDataUrl;

@Injectable({ providedIn: 'root' })
export class SearchService {
  constructor(private http: HttpClient, private auth: AuthService) {}

  search(q: string, projectId?: string): Promise<SearchResponse> {
    let params = new HttpParams().set('q', q);
    if (projectId) params = params.set('projectId', projectId);
    return firstValueFrom(
      this.http.get<SearchResponse>(`${API}/api/search`, { headers: this.auth.getAuthHeaders(), params })
    );
  }
}

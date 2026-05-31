import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_DATA_URL } from './tokens';
import { AuthService } from './auth.service';

export interface DocCategory {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  createdByUsername: string;
  createdAt: string;
}

export interface DocDocument {
  id: string;
  categoryId: string | null;
  title: string;
  description: string;
  text: string;
  isPublic: boolean;
  createdBy: string;
  createdByUsername: string;
  updatedBy: string | null;
  updatedByUsername: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private apiUrl = inject(API_DATA_URL);
  constructor(private http: HttpClient, private auth: AuthService) {}

  private headers() { return this.auth.getAuthHeaders(); }

  getCategories(): Promise<DocCategory[]> {
    return firstValueFrom(
      this.http.get<DocCategory[]>(`${this.apiUrl}/api/doc-categories`, { headers: this.headers() })
    );
  }

  createCategory(data: { name: string; description: string }): Promise<DocCategory> {
    return firstValueFrom(
      this.http.post<DocCategory>(`${this.apiUrl}/api/doc-categories`, data, { headers: this.headers() })
    );
  }

  getDocuments(): Promise<DocDocument[]> {
    return firstValueFrom(
      this.http.get<DocDocument[]>(`${this.apiUrl}/api/documents`, { headers: this.headers() })
    );
  }
}

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { AuthService } from '../../../../core/services/auth.service';

export interface ProjectComment {
  id: string;
  projectId: string;
  folderId: string;
  userId: string;
  username: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

const API = environment.apiDataUrl;

@Injectable({ providedIn: 'root' })
export class ProjectCommentsService {
  constructor(private http: HttpClient, private auth: AuthService) {}

  private h() { return this.auth.getAuthHeaders(); }

  list(projectId: string, folderId?: string): Promise<ProjectComment[]> {
    const params: any = {};
    if (folderId) params.folderId = folderId;
    return firstValueFrom(
      this.http.get<{ comments: ProjectComment[] }>(`${API}/api/project-comments/${projectId}`, { headers: this.h(), params })
    ).then(r => r.comments);
  }

  counts(projectId: string): Promise<Record<string, number>> {
    return firstValueFrom(
      this.http.get<{ counts: Record<string, number> }>(`${API}/api/project-comments/${projectId}/counts`, { headers: this.h() })
    ).then(r => r.counts);
  }

  add(projectId: string, folderId: string, text: string): Promise<ProjectComment> {
    return firstValueFrom(
      this.http.post<{ comment: ProjectComment }>(`${API}/api/project-comments/${projectId}`, { folderId, text }, { headers: this.h() })
    ).then(r => r.comment);
  }

  remove(projectId: string, commentId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<{ success: boolean }>(`${API}/api/project-comments/${projectId}/${commentId}`, { headers: this.h() })
    ).then(() => undefined);
  }
}

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

export interface ProjectStep {
  id: string;
  projectId: string;
  stepNumber: number;
  content: string;
  linkedDocId: string | null;
  linkedDocTitle: string | null;
  result: string | null;
  resultStatus: 'pending' | 'success' | 'error';
  userId: string;
  username: string;
  notes: string | null;
  createdAt: string;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  content: string;
  status: 'draft' | 'published';
  userId: string;
  linkedDocId?: string | null;
  _ownerUsername?: string | null;
  createdAt: string;
  updatedAt: string;
  backupType?: 'github' | 'gitlab' | 'ftp' | 'googledrive' | null;
  backupServer?: string | null;
  backupPassword?: string | null;
  backupDirectory?: string | null;
  backupOwnerType?: string | null;
  backupRepoName?: string | null;
  backupVisibility?: string | null;
}

const API = environment.apiDataUrl;

@Injectable({ providedIn: 'root' })
export class ProjectService {
  constructor(private http: HttpClient, private auth: AuthService) {}

  private headers() { return this.auth.getAuthHeaders(); }

  getProjects(): Promise<Project[]> {
    return firstValueFrom(
      this.http.get<Project[]>(`${API}/api/frank/projects`, { headers: this.headers() })
    );
  }

  getProject(id: string): Promise<Project> {
    return firstValueFrom(
      this.http.get<Project>(`${API}/api/frank/projects/${id}`, { headers: this.headers() })
    );
  }

  createProject(data: { title: string; content?: string; status?: string }): Promise<Project> {
    return firstValueFrom(
      this.http.post<Project>(`${API}/api/frank/projects`, data, { headers: this.headers() })
    );
  }

  updateProject(id: string, data: Partial<Pick<Project, 'title' | 'description' | 'status' | 'backupType' | 'backupServer' | 'backupPassword' | 'backupDirectory' | 'backupOwnerType' | 'backupRepoName' | 'backupVisibility'>>): Promise<Project> {
    return firstValueFrom(
      this.http.put<Project>(`${API}/api/frank/projects/${id}`, data, { headers: this.headers() })
    );
  }

  deleteProject(id: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${API}/api/frank/projects/${id}`, { headers: this.headers() })
    );
  }

  getSteps(projectId: string): Promise<ProjectStep[]> {
    return firstValueFrom(
      this.http.get<ProjectStep[]>(`${API}/api/frank/projects/${projectId}/steps`, { headers: this.headers() })
    );
  }

  createStep(projectId: string, data: { content: string; linkedDocId?: string | null; linkedDocTitle?: string | null; notes?: string }): Promise<ProjectStep> {
    return firstValueFrom(
      this.http.post<ProjectStep>(`${API}/api/frank/projects/${projectId}/steps`, data, { headers: this.headers() })
    );
  }

  updateStep(projectId: string, stepId: string, data: { content?: string; linkedDocId?: string | null; linkedDocTitle?: string | null; result?: string; resultStatus?: string; notes?: string }): Promise<ProjectStep> {
    return firstValueFrom(
      this.http.put<ProjectStep>(`${API}/api/frank/projects/${projectId}/steps/${stepId}`, data, { headers: this.headers() })
    );
  }

  deleteStep(projectId: string, stepId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${API}/api/frank/projects/${projectId}/steps/${stepId}`, { headers: this.headers() })
    );
  }
}

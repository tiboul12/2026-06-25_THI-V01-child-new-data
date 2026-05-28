import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_DATA_URL } from './tokens';
import { AuthService } from './auth.service';

export interface FileNode {
  id: string;
  type: 'file' | 'folder';
  name: string;
  path: string;
  order: number;
  fileType?: 'text' | 'image';
  content?: string;
  children?: FileNode[];
}

export interface ProjectFilesConfig {
  projectName: string;
  createdAt: string;
  updatedAt: string;
  gitRemoteUrl?: string | null;
  structure: FileNode[];
}

export type EnsureLocalStatus = 'ready' | 'cloned' | 'no-remote';
export interface EnsureLocalResult {
  status: EnsureLocalStatus;
  message?: string;
  gitRemoteUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class ProjectFilesService {
  private apiUrl = inject(API_DATA_URL);
  constructor(private http: HttpClient, private auth: AuthService) {}

  private h() { return this.auth.getAuthHeaders(); }

  getProjects(): Promise<Array<{ name: string; projectName: string; gitRemoteUrl: string | null; localExists: boolean }>> {
    return firstValueFrom(this.http.get<any[]>(`${this.apiUrl}/api/file-projects`, { headers: this.h() }));
  }

  getConfig(name: string): Promise<ProjectFilesConfig> {
    return firstValueFrom(this.http.get<ProjectFilesConfig>(`${this.apiUrl}/api/file-projects/${name}`, { headers: this.h() }));
  }

  ensureLocal(name: string): Promise<EnsureLocalResult> {
    return firstValueFrom(this.http.post<EnsureLocalResult>(`${this.apiUrl}/api/file-projects/${name}/ensure-local`, {}, { headers: this.h() }));
  }

  getFiles(name: string): Promise<{ success: boolean; project: string; files: FileNode[] }> {
    return firstValueFrom(this.http.get<any>(`${this.apiUrl}/api/file-projects/${name}/files`, { headers: this.h() }));
  }

  createProject(projectName: string, folderName: string): Promise<any> {
    return firstValueFrom(this.http.post(`${this.apiUrl}/api/file-projects`, { projectName, folderName }, { headers: this.h() }));
  }

  deleteProject(name: string): Promise<any> {
    return firstValueFrom(this.http.delete(`${this.apiUrl}/api/file-projects/${name}`, { headers: this.h() }));
  }

  createFile(projectName: string, data: { name: string; parentId?: string; content?: string }): Promise<FileNode> {
    return firstValueFrom(this.http.post<FileNode>(`${this.apiUrl}/api/file-projects/${projectName}/files`, data, { headers: this.h() }));
  }

  updateFile(projectName: string, fileId: string, content: string, folderId?: string, publish = false): Promise<any> {
    return firstValueFrom(this.http.put(`${this.apiUrl}/api/file-projects/${projectName}/files/${fileId}`, { content, folderId: folderId ?? null, publish }, { headers: this.h() }));
  }

  renameFile(projectName: string, fileId: string, name: string): Promise<FileNode> {
    return firstValueFrom(this.http.patch<FileNode>(`${this.apiUrl}/api/file-projects/${projectName}/files/${fileId}`, { name }, { headers: this.h() }));
  }

  deleteFile(projectName: string, fileId: string): Promise<any> {
    return firstValueFrom(this.http.delete(`${this.apiUrl}/api/file-projects/${projectName}/files/${fileId}`, { headers: this.h() }));
  }

  createFolder(projectName: string, data: { name: string; parentId?: string }): Promise<FileNode> {
    return firstValueFrom(this.http.post<FileNode>(`${this.apiUrl}/api/file-projects/${projectName}/folders`, data, { headers: this.h() }));
  }

  renameFolder(projectName: string, folderId: string, name: string): Promise<FileNode> {
    return firstValueFrom(this.http.patch<FileNode>(`${this.apiUrl}/api/file-projects/${projectName}/folders/${folderId}`, { name }, { headers: this.h() }));
  }

  deleteFolder(projectName: string, folderId: string): Promise<any> {
    return firstValueFrom(this.http.delete(`${this.apiUrl}/api/file-projects/${projectName}/folders/${folderId}`, { headers: this.h() }));
  }

  updateStructure(projectName: string, structure: FileNode[]): Promise<any> {
    return firstValueFrom(this.http.put(`${this.apiUrl}/api/file-projects/${projectName}/structure`, { structure }, { headers: this.h() }));
  }

  moveFile(projectName: string, fileId: string, targetFolderId: string | null): Promise<any> {
    return firstValueFrom(this.http.post(`${this.apiUrl}/api/file-projects/${projectName}/move-file`, { fileId, targetFolderId }, { headers: this.h() }));
  }

  moveFolder(projectName: string, folderId: string, targetParentId: string | null): Promise<any> {
    return firstValueFrom(this.http.post(`${this.apiUrl}/api/file-projects/${projectName}/move-folder`, { folderId, targetParentId }, { headers: this.h() }));
  }

  uploadImage(projectName: string, file: File, parentId: string | null): Promise<FileNode> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        try {
          const node = await firstValueFrom(this.http.post<FileNode>(
            `${this.apiUrl}/api/file-projects/${projectName}/upload-image`,
            { name: file.name, parentId, data: base64, mimeType: file.type },
            { headers: this.h() }
          ));
          resolve(node);
        } catch (e) { reject(e); }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  getImageUrl(projectName: string, imagePath: string): string {
    return `${this.apiUrl}/data/projets/${projectName}/${imagePath}`;
  }

  isImageFile(name: string): boolean {
    return /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(name);
  }

  flattenFiles(nodes: FileNode[], depth = 0): FileNode[] {
    const result: FileNode[] = [];
    for (const node of nodes) {
      if (node.type === 'file') {
        result.push({ ...node, order: depth });
      } else if (node.children) {
        result.push(...this.flattenFiles(node.children, depth + 1));
      }
    }
    return result;
  }

  autoSync(name: string): Promise<{ success: boolean; status: string; ahead?: number; behind?: number; newCommits?: number; changedFiles?: string[] }> {
    return firstValueFrom(this.http.post<any>(`${this.apiUrl}/api/file-projects/${name}/auto-sync`, {}, { headers: this.h() }));
  }

  ftpSync(name: string): Promise<{ success: boolean; status: string; uploaded: number; errors: any[] }> {
    return firstValueFrom(this.http.post<any>(`${this.apiUrl}/api/file-projects/${name}/ftp-sync`, {}, { headers: this.h() }));
  }

  getGithubReachable(): Promise<{ reachable: boolean; reason?: string }> {
    return firstValueFrom(this.http.get<any>(`${this.apiUrl}/api/github/reachable`, { headers: this.h() }));
  }

  openFolder(name: string): Promise<{ success: boolean }> {
    return firstValueFrom(this.http.post<any>(`${this.apiUrl}/api/file-projects/${name}/open-folder`, {}, { headers: this.h() }));
  }
}

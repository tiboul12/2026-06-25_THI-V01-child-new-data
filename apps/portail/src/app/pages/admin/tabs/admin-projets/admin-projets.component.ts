import { Component, OnInit, Output, EventEmitter, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ProjectService, Project } from '@worganic/portail-core/data-access';
import { AuthService } from '@worganic/portail-core/data-access';
import { WoActionHistoryService } from '@worganic/portail-core/data-access';

@Component({
  selector: 'app-admin-projets',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-projets.component.html',
})
export class AdminProjetsComponent implements OnInit {
  @Output() count = new EventEmitter<number>();

  projects = signal<Project[]>([]);
  loadingProjects = signal(true);
  projectsError = signal('');
  deletingProjectId = signal<string | null>(null);

  editingProject = signal<Project | null>(null);
  editTitle = '';
  editStatus: 'draft' | 'published' = 'draft';
  savingProject = signal(false);

  editingIa = signal<Project | null>(null);
  editIaInstructions = '';
  savingIa = signal(false);

  editingBackup = signal<Project | null>(null);
  backupType: 'github' | 'gitlab' | 'ftp' | 'googledrive' | '' = '';
  backupServer = '';
  backupUsername = '';
  backupPassword = '';
  backupPort: number | null = null;
  backupDirectory = '';
  backupOwnerType = '';
  backupRepoName = '';
  backupVisibility = '';
  savingBackup = signal(false);
  testingFtp = signal(false);
  ftpTestResult = signal<{ success: boolean; message: string; directory?: { accessible: boolean; files?: number; error?: string } | null } | null>(null);

  private woHistory = inject(WoActionHistoryService);

  constructor(
    private projectService: ProjectService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadProjects();
  }

  async loadProjects() {
    this.loadingProjects.set(true);
    this.projectsError.set('');
    try {
      const list = await this.projectService.getProjects();
      this.projects.set(list);
      this.count.emit(list.length);
    } catch (e: any) {
      this.projectsError.set(e?.error?.error || 'Erreur chargement projets');
    } finally {
      this.loadingProjects.set(false);
    }
  }

  openEditProject(project: Project) {
    this.editingProject.set(project);
    this.editTitle = project.title;
    this.editStatus = project.status;
  }

  closeEditProject() {
    this.editingProject.set(null);
  }

  async saveProject() {
    const proj = this.editingProject();
    if (!proj || !this.editTitle.trim()) return;
    this.savingProject.set(true);
    const beforeState = { title: proj.title, status: proj.status };
    const newTitle = this.editTitle.trim();
    try {
      await this.projectService.updateProject(proj.id, {
        title: newTitle,
        status: this.editStatus
      });
      this.woHistory.track({
        section: 'projets',
        actionType: 'update',
        label: `Modification du projet «${newTitle}» (admin)`,
        entityType: 'project',
        entityId: proj.id,
        entityLabel: newTitle,
        beforeState: beforeState,
        afterState: { title: newTitle, status: this.editStatus },
        undoable: true,
        undoAction: { endpoint: `/api/frank/projects/${proj.id}`, method: 'PUT', payload: beforeState }
      }).catch(() => {});
      this.closeEditProject();
      await this.loadProjects();
    } catch (e: any) {
      this.projectsError.set(e?.error?.error || 'Erreur sauvegarde');
    } finally {
      this.savingProject.set(false);
    }
  }

  openEditIa(project: Project) {
    this.editingIa.set(project);
    this.editIaInstructions = project.iaInstructions || '';
  }

  closeEditIa() {
    this.editingIa.set(null);
  }

  async saveIa() {
    const proj = this.editingIa();
    if (!proj) return;
    this.savingIa.set(true);
    try {
      await this.projectService.updateProject(proj.id, {
        iaInstructions: this.editIaInstructions.trim() || null
      });
      this.closeEditIa();
      await this.loadProjects();
    } catch (e: any) {
      this.projectsError.set(e?.error?.error || 'Erreur sauvegarde instructions IA');
    } finally {
      this.savingIa.set(false);
    }
  }

  openEditBackup(project: Project) {
    this.editingBackup.set(project);
    this.backupType = (project.backupType as any) || '';
    this.backupServer = project.backupServer || '';
    this.backupUsername = project.backupUsername || '';
    this.backupPassword = project.backupPassword || '';
    this.backupPort = project.backupPort || null;
    this.backupDirectory = project.backupDirectory || '';
    this.backupOwnerType = project.backupOwnerType || '';
    this.backupRepoName = project.backupRepoName || '';
    this.backupVisibility = project.backupVisibility || '';
    this.ftpTestResult.set(null);
  }

  closeEditBackup() {
    this.editingBackup.set(null);
    this.ftpTestResult.set(null);
  }

  async saveBackup() {
    const proj = this.editingBackup();
    if (!proj) return;
    this.savingBackup.set(true);
    try {
      await this.projectService.updateProject(proj.id, {
        backupType: this.backupType || null,
        backupServer: this.backupServer || null,
        backupUsername: this.backupUsername || null,
        backupPassword: this.backupPassword || null,
        backupPort: this.backupPort || null,
        backupDirectory: this.backupDirectory || null,
        backupOwnerType: this.backupOwnerType || null,
        backupRepoName: this.backupRepoName || null,
        backupVisibility: this.backupVisibility || null
      });
      this.closeEditBackup();
      await this.loadProjects();
    } catch (e: any) {
      this.projectsError.set(e?.error?.error || 'Erreur sauvegarde backup');
    } finally {
      this.savingBackup.set(false);
    }
  }

  async testFtpConnection() {
    const proj = this.editingBackup();
    if (!proj || !this.backupServer || !this.backupUsername || !this.backupPassword) return;
    this.testingFtp.set(true);
    this.ftpTestResult.set(null);
    try {
      const result = await this.projectService.testFtp(proj.id, {
        host: this.backupServer,
        username: this.backupUsername,
        password: this.backupPassword,
        port: this.backupPort,
        directory: this.backupDirectory || null
      });
      this.ftpTestResult.set(result);
    } catch (e: any) {
      this.ftpTestResult.set({ success: false, message: e?.error?.error || 'Erreur serveur' });
    } finally {
      this.testingFtp.set(false);
    }
  }

  backupTypeLabel(type: string | null | undefined): string {
    const labels: Record<string, string> = { github: 'GitHub', gitlab: 'GitLab', ftp: 'FTP', googledrive: 'Google Drive' };
    return type ? (labels[type] || type) : '—';
  }

  openProject(id: string) {
    this.router.navigate(['/projets', id]);
  }

  confirmDeleteProject(id: string) { this.deletingProjectId.set(id); }
  cancelDeleteProject() { this.deletingProjectId.set(null); }

  async deleteProject(id: string) {
    const proj = this.projects().find(p => p.id === id);
    try {
      await this.projectService.deleteProject(id);
      this.woHistory.track({
        section: 'projets',
        actionType: 'delete',
        label: `Suppression du projet «${proj?.title || id}» (admin)`,
        entityType: 'project',
        entityId: id,
        entityLabel: proj?.title,
        beforeState: proj ? { title: proj.title, status: proj.status } : undefined,
        undoable: false
      }).catch(() => {});
      this.deletingProjectId.set(null);
      await this.loadProjects();
    } catch (e: any) {
      this.projectsError.set(e?.error?.error || 'Erreur suppression');
      this.deletingProjectId.set(null);
    }
  }

  statusLabel(status: string): string {
    return status === 'published' ? 'Publié' : 'Brouillon';
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
}

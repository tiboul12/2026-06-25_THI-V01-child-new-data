import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WorgHelpTriggerComponent } from '@worganic/shared/ui';
import { Router } from '@angular/router';
import { ProjectService, Project } from '@worganic/portail-core/data-access';
import { ProjectFilesService } from '@worganic/portail-core/data-access';
import { WoActionHistoryService } from '@worganic/portail-core/data-access';
import { ProjetSearchComponent } from './projet-search/projet-search.component';

@Component({
  selector: 'app-projets',
  standalone: true,
  imports: [CommonModule, FormsModule, WorgHelpTriggerComponent, ProjetSearchComponent],
  templateUrl: './projets.component.html',
  styleUrl: './projets.component.scss'
})
export class ProjetsComponent implements OnInit {
  projects = signal<Project[]>([]);
  loading = signal(true);
  error = signal('');

  // Modale nouveau projet
  showNewModal = signal(false);
  newTitle = '';
  newContent = '';
  creating = signal(false);

  // Édition inline
  editingId = signal<string | null>(null);
  editTitle = '';
  editContent = '';
  saving = signal(false);

  // Confirmation suppression
  deletingId = signal<string | null>(null);

  githubReachable = signal<boolean | null>(null);
  projectsWithRemote = signal<Set<string>>(new Set());

  private woHistory = inject(WoActionHistoryService);

  constructor(
    private projectService: ProjectService,
    private projectFilesService: ProjectFilesService,
    private router: Router
  ) {}

  async ngOnInit() {
    await this.loadProjects();
    this.checkGithubStatus();
  }

  async loadProjects() {
    this.loading.set(true);
    this.error.set('');
    try {
      const list = await this.projectService.getProjects();
      this.projects.set(list);
      // Charger la liste des projets avec un remote git pour afficher le badge
      this.projectFilesService.getProjects().then(fileProjects => {
        const withRemote = new Set(
          fileProjects.filter(p => p.gitRemoteUrl).map(p => p.name)
        );
        this.projectsWithRemote.set(withRemote);
      }).catch(() => {});
    } catch (e: any) {
      this.error.set(e?.error?.error || 'Erreur lors du chargement des projets');
    } finally {
      this.loading.set(false);
    }
  }

  private async checkGithubStatus() {
    try {
      const result = await this.projectFilesService.getGithubReachable();
      this.githubReachable.set(result.reachable);
    } catch {
      this.githubReachable.set(null);
    }
  }

  hasGithubWarning(projectId: string): boolean {
    const project = this.projects().find(p => p.id === projectId);
    if (project?.backupType && project.backupType !== 'github') return false;
    return this.projectsWithRemote().has(projectId) && this.githubReachable() === false;
  }

  openNewModal() {
    this.newTitle = '';
    this.newContent = '';
    this.showNewModal.set(true);
  }

  closeNewModal() {
    this.showNewModal.set(false);
  }

  async createProject() {
    if (!this.newTitle.trim()) return;
    this.creating.set(true);
    const title = this.newTitle.trim();
    try {
      const project = await this.projectService.createProject({
        title,
        content: this.newContent,
        status: 'draft'
      });
      this.woHistory.track({
        section: 'projets',
        actionType: 'create',
        label: `Création du projet «${title}»`,
        entityType: 'project',
        entityId: project.id,
        entityLabel: title,
        afterState: { title, status: 'draft' },
        undoable: true,
        undoAction: { endpoint: `/api/frank/projects/${project.id}`, method: 'DELETE' }
      }).catch(() => {});
      this.closeNewModal();
      this.router.navigate(['/projets', project.id]);
    } catch (e: any) {
      this.error.set(e?.error?.error || 'Erreur lors de la création');
    } finally {
      this.creating.set(false);
    }
  }

  openProject(id: string) {
    this.router.navigate(['/projets', id]);
  }

  startEdit(project: Project, event: Event) {
    event.stopPropagation();
    this.editingId.set(project.id);
    this.editTitle = project.title;
    this.editContent = project.description || '';
  }

  cancelEdit(event: Event) {
    event.stopPropagation();
    this.editingId.set(null);
  }

  async saveEdit(id: string, event: Event) {
    event.stopPropagation();
    if (!this.editTitle.trim()) return;
    this.saving.set(true);
    this.error.set('');
    const before = this.projects().find(p => p.id === id);
    const beforeState = before ? { title: before.title, description: before.description || '' } : undefined;
    const newTitle = this.editTitle.trim();
    try {
      await this.projectService.updateProject(id, {
        title: newTitle,
        description: this.editContent
      });
      this.woHistory.track({
        section: 'projets',
        actionType: 'update',
        label: `Modification du projet «${newTitle}»`,
        entityType: 'project',
        entityId: id,
        entityLabel: newTitle,
        beforeState: beforeState,
        afterState: { title: newTitle, description: this.editContent },
        undoable: !!beforeState,
        undoAction: beforeState ? { endpoint: `/api/frank/projects/${id}`, method: 'PUT', payload: beforeState } : undefined
      }).catch(() => {});
      this.editingId.set(null);
      await this.loadProjects();
    } catch (e: any) {
      this.error.set(e?.error?.error || 'Erreur lors de la sauvegarde');
    } finally {
      this.saving.set(false);
    }
  }

  confirmDelete(id: string, event: Event) {
    event.stopPropagation();
    this.deletingId.set(id);
  }

  cancelDelete() {
    this.deletingId.set(null);
  }

  async deleteProject(id: string) {
    const proj = this.projects().find(p => p.id === id);
    try {
      await this.projectService.deleteProject(id);
      this.woHistory.track({
        section: 'projets',
        actionType: 'delete',
        label: `Suppression du projet «${proj?.title || id}»`,
        entityType: 'project',
        entityId: id,
        entityLabel: proj?.title,
        beforeState: proj ? { title: proj.title, description: proj.description, status: proj.status } : undefined,
        undoable: false
      }).catch(() => {});
      this.deletingId.set(null);
      await this.loadProjects();
    } catch (e: any) {
      this.error.set(e?.error?.error || 'Erreur lors de la suppression');
      this.deletingId.set(null);
    }
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  statusLabel(status: string): string {
    return status === 'published' ? 'Publié' : 'Brouillon';
  }

  backupLabel(type: string | null | undefined): string {
    const labels: Record<string, string> = { github: 'GitHub', gitlab: 'GitLab', ftp: 'FTP', googledrive: 'Google Drive' };
    return type ? (labels[type] || type) : '';
  }

  backupIcon(type: string | null | undefined): string {
    const icons: Record<string, string> = { github: 'code', gitlab: 'merge', ftp: 'dns', googledrive: 'add_to_drive' };
    return type ? (icons[type] || 'cloud') : '';
  }
}

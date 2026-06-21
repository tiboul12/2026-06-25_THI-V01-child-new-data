import { Component, OnInit, Output, EventEmitter, signal, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { navigateToProjets } from '../../../../shared/utils/navigate-to-projets';
import { ProjectService, Project } from '@worganic/portail-core/data-access';
import { ProjectFilesService } from '@worganic/portail-core/data-access';
import { AuthService } from '@worganic/portail-core/data-access';
import { WoActionHistoryService } from '@worganic/portail-core/data-access';
import { DocumentService, DocCategory, DocDocument } from '@worganic/portail-core/data-access';

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
  initialPushPending = signal<Project | null>(null);
  initialPushStatus = signal<'idle' | 'pushing' | 'done' | 'error'>('idle');
  initialPushResult = signal<{ uploaded?: number; pushed?: boolean; error?: string } | null>(null);

  activeSubTab = signal<'projets' | 'ia-instructions'>('projets');
  iaCategory = signal<DocCategory | null>(null);
  iaDocuments = signal<DocDocument[]>([]);
  loadingIaDocs = signal(false);
  iaDocsError = signal('');
  applyingDoc = signal<DocDocument | null>(null);
  applyTargetProjectId = '';
  applyingToProject = signal(false);
  showDocPicker = signal(false);

  private woHistory = inject(WoActionHistoryService);
  private documentService = inject(DocumentService);

  private route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private projectService: ProjectService,
    private projectFilesService: ProjectFilesService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadProjects();

    // Routing par segment : /admin/projets/:subtab
    this.route.params.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const subtab = params['subtab'] as 'projets' | 'ia-instructions';
      if (!subtab) {
        this.router.navigate(['/admin', 'projets', 'projets'], { replaceUrl: true });
        return;
      }
      if ((subtab === 'projets' || subtab === 'ia-instructions') && subtab !== this.activeSubTab()) {
        this.activateSubTabInternal(subtab);
      }
    });
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
    this.editingIa.set(null);
    this.showDocPicker.set(false);
    this.editingBackup.set(null);
    this.ftpTestResult.set(null);
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
    this.editingProject.set(null);
    this.editingBackup.set(null);
    this.ftpTestResult.set(null);
    this.editingIa.set(project);
    this.editIaInstructions = project.iaInstructions || '';
    this.showDocPicker.set(false);
    if (this.iaDocuments().length === 0) this.loadIaDocuments();
  }

  closeEditIa() {
    this.editingIa.set(null);
    this.showDocPicker.set(false);
  }

  async switchSubTab(tab: 'projets' | 'ia-instructions') {
    this.activateSubTabInternal(tab);
    this.router.navigate(['/admin', 'projets', tab]);
  }

  private async activateSubTabInternal(tab: 'projets' | 'ia-instructions') {
    this.activeSubTab.set(tab);
    if (tab === 'ia-instructions') await this.loadIaDocuments();
  }

  async loadIaDocuments() {
    this.loadingIaDocs.set(true);
    this.iaDocsError.set('');
    try {
      const cats = await this.documentService.getCategories();
      let cat = cats.find(c => c.name === 'Instructions IA') ?? null;
      if (!cat) {
        cat = await this.documentService.createCategory({
          name: 'Instructions IA',
          description: 'Modèles d\'instructions système réutilisables pour les projets IA'
        });
      }
      this.iaCategory.set(cat);
      const all = await this.documentService.getDocuments();
      this.iaDocuments.set(all.filter(d => d.categoryId === cat!.id));
    } catch (e: any) {
      this.iaDocsError.set(e?.error?.error || 'Erreur chargement instructions');
    } finally {
      this.loadingIaDocs.set(false);
    }
  }

  openApplyDoc(doc: DocDocument) {
    this.applyingDoc.set(doc);
    this.applyTargetProjectId = '';
  }

  closeApplyDoc() {
    this.applyingDoc.set(null);
  }

  async applyDoc() {
    const doc = this.applyingDoc();
    if (!doc || !this.applyTargetProjectId) return;
    this.applyingToProject.set(true);
    try {
      await this.projectService.updateProject(this.applyTargetProjectId, { iaInstructions: doc.text });
      this.closeApplyDoc();
      await this.loadProjects();
    } catch (e: any) {
      this.iaDocsError.set(e?.error?.error || 'Erreur application de l\'instruction');
    } finally {
      this.applyingToProject.set(false);
    }
  }

  loadDocIntoIa(doc: DocDocument) {
    this.editIaInstructions = doc.text;
    this.showDocPicker.set(false);
  }

  goToDocuments() {
    this.router.navigate(['/documents']);
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
    this.editingProject.set(null);
    this.editingIa.set(null);
    this.showDocPicker.set(false);
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
    const wasNoBackup = !proj.backupType;
    const isNewBackup = wasNoBackup && !!this.backupType;
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
      // Proposer le transfert initial si c'est la première configuration d'un backup
      if (isNewBackup) {
        this.initialPushPending.set(proj);
        this.initialPushStatus.set('idle');
        this.initialPushResult.set(null);
      }
    } catch (e: any) {
      this.projectsError.set(e?.error?.error || 'Erreur sauvegarde backup');
    } finally {
      this.savingBackup.set(false);
    }
  }

  dismissInitialPush() {
    this.initialPushPending.set(null);
    this.initialPushStatus.set('idle');
    this.initialPushResult.set(null);
  }

  async runInitialBackupPush() {
    const proj = this.initialPushPending();
    if (!proj) return;
    this.initialPushStatus.set('pushing');
    this.initialPushResult.set(null);
    try {
      const result = await this.projectFilesService.initialBackupPush(proj.id);
      this.initialPushResult.set(result);
      this.initialPushStatus.set(result.success ? 'done' : 'error');
    } catch (e: any) {
      this.initialPushResult.set({ error: e?.error?.error || 'Erreur lors du transfert' });
      this.initialPushStatus.set('error');
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
    navigateToProjets(`projets/${id}`);
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

  rowStyle(project: Project): Record<string, string> {
    if (this.editingIa()?.id === project.id) {
      return { background: 'rgba(139,92,246,0.15)', borderLeft: '3px solid rgba(139,92,246,0.8)' };
    }
    if (this.editingProject()?.id === project.id || this.editingBackup()?.id === project.id) {
      return { background: 'rgba(139,92,246,0.08)', borderLeft: '3px solid rgba(139,92,246,0.4)' };
    }
    return {};
  }

  statusLabel(status: string): string {
    return status === 'published' ? 'Publié' : 'Brouillon';
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
}

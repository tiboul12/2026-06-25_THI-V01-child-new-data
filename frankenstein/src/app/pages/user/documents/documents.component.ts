import { Component, OnInit, signal, inject } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { MarkdownEditorComponent } from '../../../shared/ui/markdown-editor/markdown-editor.component';
import { environment } from '../../../../environments/environment';
import { WoActionHistoryService } from '../../../core/services/wo-action-history.service';

const API = environment.apiDataUrl;

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

@Component({
    selector: 'app-documents',
    imports: [FormsModule, MarkdownEditorComponent],
    templateUrl: './documents.component.html',
    styleUrl: './documents.component.scss'
})
export class DocumentsComponent implements OnInit {

  activeTab = signal<'categories' | 'documents'>('categories');

  // ── Catégories ──────────────────────────────────────────────
  categories = signal<DocCategory[]>([]);
  loadingCategories = signal(true);
  categoriesError = signal('');
  deletingCategoryId = signal<string | null>(null);

  editingCategory = signal<DocCategory | null>(null);
  showNewCategoryForm = signal(false);
  savingCategory = signal(false);

  catName = '';
  catDescription = '';

  // ── Documents ───────────────────────────────────────────────
  documents = signal<DocDocument[]>([]);
  loadingDocuments = signal(true);
  documentsError = signal('');
  deletingDocumentId = signal<string | null>(null);

  editingDocument = signal<DocDocument | null>(null);
  showNewDocumentForm = signal(false);
  savingDocument = signal(false);

  docTitle = '';
  docDescription = '';
  docCategoryId = '';
  docText = '';
  docIsPublic = true;

  private woHistory = inject(WoActionHistoryService);

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  get currentUser() { return this.authService.currentUser(); }
  get isAdmin() { return this.currentUser?.role === 'admin'; }

  private get authHeaders() {
    const token = this.authService.getToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
  }

  async ngOnInit() {
    const params = this.route.snapshot.queryParamMap;
    const tab = (params.get('tab') as 'categories' | 'documents') || 'categories';
    this.activeTab.set(tab);
    await Promise.all([this.loadCategories(), this.loadDocuments()]);
  }

  setTab(tab: 'categories' | 'documents') {
    this.activeTab.set(tab);
    this.router.navigate([], { queryParams: { tab }, replaceUrl: true });
  }

  // ── Catégories ──────────────────────────────────────────────

  async loadCategories() {
    this.loadingCategories.set(true);
    this.categoriesError.set('');
    try {
      const res = await fetch(`${API}/api/doc-categories`, { headers: this.authHeaders });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur');
      this.categories.set(await res.json());
    } catch (e: any) {
      this.categoriesError.set(e?.message || 'Erreur chargement catégories');
    } finally {
      this.loadingCategories.set(false);
    }
  }

  openNewCategoryForm() {
    this.catName = '';
    this.catDescription = '';
    this.editingCategory.set(null);
    this.showNewCategoryForm.set(true);
  }

  openEditCategory(cat: DocCategory) {
    this.catName = cat.name;
    this.catDescription = cat.description;
    this.showNewCategoryForm.set(false);
    this.editingCategory.set(cat);
  }

  closeCategory() {
    this.editingCategory.set(null);
    this.showNewCategoryForm.set(false);
  }

  async saveCategory() {
    if (!this.catName.trim()) return;
    this.savingCategory.set(true);
    this.categoriesError.set('');
    const editing = this.editingCategory();
    try {
      if (editing) {
        const before = { name: editing.name, description: editing.description };
        const res = await fetch(`${API}/api/doc-categories/${editing.id}`, {
          method: 'PUT',
          headers: this.authHeaders,
          body: JSON.stringify({ name: this.catName, description: this.catDescription })
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Erreur');
        this.woHistory.track({
          section: 'documents', subsection: 'categories', actionType: 'update',
          label: `Modification de la catégorie «${this.catName}»`,
          entityType: 'category', entityId: editing.id, entityLabel: this.catName,
          beforeState: before,
          afterState: { name: this.catName, description: this.catDescription },
          undoable: true,
          undoAction: { endpoint: `/api/doc-categories/${editing.id}`, method: 'PUT', payload: before }
        }).catch(() => {});
      } else {
        const res = await fetch(`${API}/api/doc-categories`, {
          method: 'POST',
          headers: this.authHeaders,
          body: JSON.stringify({ name: this.catName, description: this.catDescription })
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Erreur');
        const created = await res.json();
        this.woHistory.track({
          section: 'documents', subsection: 'categories', actionType: 'create',
          label: `Création de la catégorie «${this.catName}»`,
          entityType: 'category', entityId: created.id, entityLabel: this.catName,
          afterState: { name: this.catName, description: this.catDescription },
          undoable: true,
          undoAction: { endpoint: `/api/doc-categories/${created.id}`, method: 'DELETE' }
        }).catch(() => {});
      }
      this.closeCategory();
      await this.loadCategories();
    } catch (e: any) {
      this.categoriesError.set(e?.message || 'Erreur sauvegarde');
    } finally {
      this.savingCategory.set(false);
    }
  }

  confirmDeleteCategory(id: string) { this.deletingCategoryId.set(id); }
  cancelDeleteCategory() { this.deletingCategoryId.set(null); }

  async deleteCategory(id: string) {
    const cat = this.categories().find(c => c.id === id);
    try {
      const res = await fetch(`${API}/api/doc-categories/${id}`, {
        method: 'DELETE',
        headers: this.authHeaders
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur');
      this.woHistory.track({
        section: 'documents', subsection: 'categories', actionType: 'delete',
        label: `Suppression de la catégorie «${cat?.name}»`,
        entityType: 'category', entityId: id, entityLabel: cat?.name,
        beforeState: cat ? { name: cat.name, description: cat.description } : undefined,
        undoable: false
      }).catch(() => {});
      this.deletingCategoryId.set(null);
      await this.loadCategories();
    } catch (e: any) {
      this.categoriesError.set(e?.message || 'Erreur suppression');
      this.deletingCategoryId.set(null);
    }
  }

  canEditCategory(cat: DocCategory): boolean {
    return this.isAdmin || cat.createdBy === this.currentUser?.id;
  }

  // ── Documents ───────────────────────────────────────────────

  async loadDocuments() {
    this.loadingDocuments.set(true);
    this.documentsError.set('');
    try {
      const res = await fetch(`${API}/api/documents`, { headers: this.authHeaders });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur');
      this.documents.set(await res.json());
    } catch (e: any) {
      this.documentsError.set(e?.message || 'Erreur chargement documents');
    } finally {
      this.loadingDocuments.set(false);
    }
  }

  openNewDocumentForm() {
    this.docTitle = '';
    this.docDescription = '';
    this.docCategoryId = '';
    this.docText = '';
    this.docIsPublic = true;
    this.editingDocument.set(null);
    this.showNewDocumentForm.set(true);
  }

  openEditDocument(doc: DocDocument) {
    this.docTitle = doc.title;
    this.docDescription = doc.description;
    this.docCategoryId = doc.categoryId || '';
    this.docText = doc.text;
    this.docIsPublic = doc.isPublic;
    this.showNewDocumentForm.set(false);
    this.editingDocument.set(doc);
  }

  closeDocument() {
    this.editingDocument.set(null);
    this.showNewDocumentForm.set(false);
  }

  async saveDocument() {
    if (!this.docTitle.trim()) return;
    this.savingDocument.set(true);
    this.documentsError.set('');
    const editing = this.editingDocument();
    try {
      const payload = {
        title: this.docTitle,
        description: this.docDescription,
        categoryId: this.docCategoryId || null,
        text: this.docText,
        isPublic: this.docIsPublic
      };
      if (editing) {
        const before = { title: editing.title, description: editing.description, categoryId: editing.categoryId, isPublic: editing.isPublic };
        const res = await fetch(`${API}/api/documents/${editing.id}`, {
          method: 'PUT',
          headers: this.authHeaders,
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Erreur');
        const catName = this.getCategoryName(this.docCategoryId || null);
        this.woHistory.track({
          section: 'documents', subsection: 'documents', actionType: 'update',
          label: `Modification du document «${this.docTitle}»`,
          entityType: 'document', entityId: editing.id, entityLabel: this.docTitle,
          beforeState: before,
          afterState: { title: this.docTitle, description: this.docDescription, categoryId: this.docCategoryId, isPublic: this.docIsPublic },
          context: this.docCategoryId ? { categoryId: this.docCategoryId, categoryName: catName } : undefined,
          undoable: true,
          undoAction: { endpoint: `/api/documents/${editing.id}`, method: 'PUT', payload: before }
        }).catch(() => {});
      } else {
        const res = await fetch(`${API}/api/documents`, {
          method: 'POST',
          headers: this.authHeaders,
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Erreur');
        const created = await res.json();
        const catName = this.getCategoryName(this.docCategoryId || null);
        this.woHistory.track({
          section: 'documents', subsection: 'documents', actionType: 'create',
          label: `Création du document «${this.docTitle}»`,
          entityType: 'document', entityId: created.id, entityLabel: this.docTitle,
          afterState: { title: this.docTitle, description: this.docDescription, categoryId: this.docCategoryId, isPublic: this.docIsPublic },
          context: this.docCategoryId ? { categoryId: this.docCategoryId, categoryName: catName } : undefined,
          undoable: true,
          undoAction: { endpoint: `/api/documents/${created.id}`, method: 'DELETE' }
        }).catch(() => {});
      }
      this.closeDocument();
      await this.loadDocuments();
    } catch (e: any) {
      this.documentsError.set(e?.message || 'Erreur sauvegarde');
    } finally {
      this.savingDocument.set(false);
    }
  }

  confirmDeleteDocument(id: string) { this.deletingDocumentId.set(id); }
  cancelDeleteDocument() { this.deletingDocumentId.set(null); }

  async deleteDocument(id: string) {
    const doc = this.documents().find(d => d.id === id);
    try {
      const res = await fetch(`${API}/api/documents/${id}`, {
        method: 'DELETE',
        headers: this.authHeaders
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur');
      const catName = doc?.categoryId ? this.getCategoryName(doc.categoryId) : undefined;
      this.woHistory.track({
        section: 'documents', subsection: 'documents', actionType: 'delete',
        label: `Suppression du document «${doc?.title}»`,
        entityType: 'document', entityId: id, entityLabel: doc?.title,
        beforeState: doc ? { title: doc.title, description: doc.description, categoryId: doc.categoryId, isPublic: doc.isPublic } : undefined,
        context: doc?.categoryId ? { categoryId: doc.categoryId, categoryName: catName } : undefined,
        undoable: false
      }).catch(() => {});
      this.deletingDocumentId.set(null);
      await this.loadDocuments();
    } catch (e: any) {
      this.documentsError.set(e?.message || 'Erreur suppression');
      this.deletingDocumentId.set(null);
    }
  }

  canEditDocument(doc: DocDocument): boolean {
    return this.isAdmin || doc.createdBy === this.currentUser?.id;
  }

  // ── Helpers ─────────────────────────────────────────────────

  getCategoryName(id: string | null): string {
    if (!id) return '—';
    return this.categories().find(c => c.id === id)?.name || '—';
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  formatDateTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }
}

import {
  Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef, NgZone, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService } from '../../core/services/config.service';
import { environment } from '../../../environments/environment';
import html2canvas from 'html2canvas';

const API = environment.apiDataUrl;

type TicketType = 'bug' | 'amelioration' | 'ui' | 'contenu' | 'performance';
type Priority   = 'critique' | 'haute' | 'normale' | 'basse';
type Phase      = 'idle' | 'capturing' | 'form' | 'list';

interface WidgetTicket {
  id: string;
  createdAt: string;
  updatedAt?: string | null;
  userId: string;
  username: string;
  title: string;
  description: string;
  url: string;
  type: string;
  priority: string;
  status: string;
  resolutionComment: string;
  screenshotFile?: string | null;
  commentCount?: number;
}

interface TicketComment {
  id: string;
  ticketId: string;
  userId: string;
  username: string;
  text: string;
  createdAt: string;
}

@Component({
    selector: 'wo-ticket-widget',
    imports: [CommonModule, FormsModule],
    templateUrl: './ticket-widget.component.html',
    styleUrl: './ticket-widget.component.scss'
})
export class TicketWidgetComponent implements OnDestroy {
  @ViewChild('bgCanvas')   bgCanvasRef!:   ElementRef<HTMLCanvasElement>;
  @ViewChild('drawCanvas') drawCanvasRef!: ElementRef<HTMLCanvasElement>;

  public configService = inject(ConfigService);
  private http = inject(HttpClient);
  public auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  private zone = inject(NgZone);

  phase: Phase = 'idle';
  showModal = false;
  modalPhase: 'form' | 'list' = 'form';

  // Capture
  screenshotDataUrl: string | null = null;

  // Dessin
  canvasMode: 'none' | 'freehand' | 'rect' = 'none';
  selectedColor: 'white' | 'red' | 'black' = 'red';
  isDrawing = false;
  lastX = 0;
  lastY = 0;
  rectStart: { x: number; y: number } | null = null;
  private drawSnapshot: ImageData | null = null;

  // Formulaire
  form = {
    title:       '',
    url:         '',
    description: '',
    priority:    'normale' as Priority,
    type:        'bug'     as TicketType
  };

  // Soumission
  saving = false;
  error  = '';

  // Liste des tickets
  listTickets: WidgetTicket[] = [];
  listLoading  = false;
  listError    = '';
  listSearch   = '';
  listStatus   = '';
  listTypeFilter = '';
  listViewMode: 'grouped' | 'all' = 'grouped';
  showTermine = false;
  expandedTicketId: string | null = null;

  // Édition ticket
  editingTicket: WidgetTicket | null = null;
  editForm = { title: '', description: '', url: '', type: 'bug' as TicketType, priority: 'normale' as Priority, status: 'signale', resolutionComment: '' };
  editSaving = false;
  editError = '';

  // Suppression
  confirmDeleteId: string | null = null;
  deleting = false;

  // Commentaires
  comments: TicketComment[] = [];
  commentsLoading = false;
  commentText = '';
  commentSaving = false;
  commentError = '';

  readonly typeOptions: { value: TicketType; label: string; icon: string }[] = [
    { value: 'bug',         label: 'Bug',          icon: 'bug_report'  },
    { value: 'amelioration',label: 'Amélioration', icon: 'lightbulb'   },
    { value: 'ui',          label: 'Interface',    icon: 'palette'     },
    { value: 'contenu',     label: 'Contenu',      icon: 'article'     },
    { value: 'performance', label: 'Performance',  icon: 'speed'       }
  ];

  readonly priorityOptions: { value: Priority; label: string }[] = [
    { value: 'critique', label: 'Critique' },
    { value: 'haute',    label: 'Haute'    },
    { value: 'normale',  label: 'Normale'  },
    { value: 'basse',    label: 'Basse'    }
  ];

  readonly statusOptions: { value: string; label: string }[] = [
    { value: 'signale',         label: 'Signalé'         },
    { value: 'prise_en_compte', label: 'Pris en compte'  },
    { value: 'en_cours',        label: 'En cours'        },
    { value: 'termine',         label: 'Terminé'         }
  ];

  constructor() {}

  ngOnDestroy() {}

  // ── Ouverture ────────────────────────────────────────────────────────────

  async openWidget() {
    this.configService.setActiveTool('tickets');
    this.phase       = 'capturing';
    this.form.url    = window.location.href;
    this.error       = '';
    this.canvasMode  = 'none';
    this.rectStart   = null;
    this.drawSnapshot = null;

    await new Promise(r => setTimeout(r, 150));

    try {
      const canvas = await html2canvas(document.body, {
        scale:        0.75,
        useCORS:      true,
        logging:      false,
        windowWidth:  document.documentElement.scrollWidth,
        windowHeight: document.documentElement.scrollHeight,
        ignoreElements: (el) => el.tagName === 'WO-TICKET-WIDGET'
      });
      this.screenshotDataUrl = canvas.toDataURL('image/png');
    } catch (e) {
      console.error('[TicketWidget] html2canvas error:', e);
      this.screenshotDataUrl = null;
    }

    this.phase = 'form';
    this.cdr.detectChanges();
    setTimeout(() => this.initCanvases(), 80);
  }

  openDoc() {
    window.open('/ticket-widget-doc', '_blank');
  }

  openAsModal() {
    this.modalPhase = this.phase === 'list' ? 'list' : 'form';
    this.showModal = true;
    this.configService.setActiveTool('none');
    if (this.modalPhase === 'form') {
      setTimeout(() => this.initCanvases(), 100);
    }
  }

  // ── Liste ─────────────────────────────────────────────────────────────

  async openList() {
    this.configService.setActiveTool('tickets');
    this.phase      = 'list';
    this.listSearch = '';
    this.listStatus = '';
    this.listTypeFilter = '';
    this.expandedTicketId = null;
    this.editingTicket = null;
    this.confirmDeleteId = null;
    await this.loadTickets();
  }

  async loadTickets() {
    this.listLoading = true;
    this.listError   = '';
    try {
      const data: any = await this.http.get(`${API}/api/tickets`).toPromise();
      this.listTickets = data.tickets || [];
    } catch {
      this.listError = 'Impossible de charger les tickets.';
    } finally {
      this.listLoading = false;
    }
  }

  private readonly OLD_MS = 5 * 24 * 60 * 60 * 1000;

  isOld(t: WidgetTicket): boolean {
    return (Date.now() - new Date(t.createdAt).getTime()) > this.OLD_MS;
  }

  get stats() {
    const c = (s: string) => this.listTickets.filter(t => t.status === s).length;
    const o = (s: string) => this.listTickets.filter(t => t.status === s && this.isOld(t)).length;
    return {
      en_cours:        { total: c('en_cours'),        old: o('en_cours')        },
      prise_en_compte: { total: c('prise_en_compte'), old: o('prise_en_compte') },
      signale:         { total: c('signale'),         old: o('signale')         },
      termine:         { total: c('termine'),         old: o('termine')         },
    };
  }

  private get filteredBySearchAndType(): WidgetTicket[] {
    return this.listTickets.filter(t => {
      if (this.listTypeFilter && t.type !== this.listTypeFilter) return false;
      if (this.listSearch) {
        const s = this.listSearch.toLowerCase();
        if (!t.title.toLowerCase().includes(s) && !t.description.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }

  get filteredList(): WidgetTicket[] {
    return this.filteredBySearchAndType.filter(t =>
      !this.listStatus || t.status === this.listStatus
    );
  }

  get groupEnCours():        WidgetTicket[] { return this.filteredBySearchAndType.filter(t => t.status === 'en_cours'); }
  get groupPriseEnCompte():  WidgetTicket[] { return this.filteredBySearchAndType.filter(t => t.status === 'prise_en_compte'); }
  get groupSignale():        WidgetTicket[] { return this.filteredBySearchAndType.filter(t => t.status === 'signale'); }
  get groupTermine():        WidgetTicket[] { return this.filteredBySearchAndType.filter(t => t.status === 'termine'); }

  async toggleTicket(ticket: WidgetTicket) {
    if (this.expandedTicketId === ticket.id) {
      this.expandedTicketId = null;
      this.editingTicket = null;
      this.confirmDeleteId = null;
      this.comments = [];
      this.commentText = '';
    } else {
      this.expandedTicketId = ticket.id;
      this.editingTicket = null;
      this.confirmDeleteId = null;
      this.comments = [];
      this.commentText = '';
      this.commentError = '';
      await this.loadComments(ticket.id);
    }
  }

  listScreenshotUrl(ticket: WidgetTicket): string {
    return `${API}/api/tickets/${ticket.id}/screenshot`;
  }

  listStatusLabel(status: string): string {
    return { signale: 'Signalé', prise_en_compte: 'Pris en compte', en_cours: 'En cours', termine: 'Terminé' }[status] ?? status;
  }

  listStatusColor(status: string): string {
    return { signale: 'gray', prise_en_compte: 'yellow', en_cours: 'blue', termine: 'green' }[status] ?? 'gray';
  }

  listTypeIcon(type: string): string {
    return { bug: 'bug_report', amelioration: 'lightbulb', ui: 'palette', contenu: 'article', performance: 'speed' }[type] ?? 'category';
  }

  listTypeColor(type: string): string {
    return { bug: 'red', amelioration: 'blue', ui: 'purple', contenu: 'green', performance: 'orange' }[type] ?? 'gray';
  }

  listTypeLabel(type: string): string {
    return { bug: 'Bug', amelioration: 'Amélioration', ui: 'Interface', contenu: 'Contenu', performance: 'Perf.' }[type] ?? type;
  }

  priorityColor(p: string): string {
    return { critique: 'red', haute: 'orange', normale: 'blue', basse: 'gray' }[p] ?? 'gray';
  }

  priorityLabel(p: string): string {
    return { critique: 'Critique', haute: 'Haute', normale: 'Normale', basse: 'Basse' }[p] ?? p;
  }

  formatListDate(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    } catch { return ''; }
  }

  formatDateTime(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  }

  isOwner(ticket: WidgetTicket): boolean {
    return this.auth.currentUser()?.id === ticket.userId;
  }

  isAdmin(): boolean {
    return this.auth.currentUser()?.role === 'admin';
  }

  // ── Édition ──────────────────────────────────────────────────────────────

  openEditTicket(ticket: WidgetTicket) {
    this.editingTicket = ticket;
    this.editForm = {
      title: ticket.title,
      description: ticket.description,
      url: ticket.url,
      type: ticket.type as TicketType,
      priority: ticket.priority as Priority,
      status: ticket.status,
      resolutionComment: ticket.resolutionComment || ''
    };
    this.editError = '';
  }

  closeEditTicket() {
    this.editingTicket = null;
    this.editError = '';
  }

  async saveEditTicket() {
    if (!this.editingTicket) return;
    this.editSaving = true;
    this.editError = '';
    try {
      const updated: any = await this.http.put(
        `${API}/api/tickets/${this.editingTicket.id}`,
        this.editForm
      ).toPromise();
      // Mettre à jour dans la liste locale
      const idx = this.listTickets.findIndex(t => t.id === this.editingTicket!.id);
      if (idx !== -1) {
        this.listTickets[idx] = { ...this.listTickets[idx], ...this.editForm };
      }
      this.editingTicket = null;
    } catch (e: any) {
      this.editError = e?.error?.error || 'Erreur lors de la sauvegarde';
    } finally {
      this.editSaving = false;
    }
  }

  // ── Suppression ──────────────────────────────────────────────────────────

  confirmDelete(id: string) {
    this.confirmDeleteId = id;
  }

  cancelDelete() {
    this.confirmDeleteId = null;
  }

  async doDelete() {
    if (!this.confirmDeleteId) return;
    this.deleting = true;
    try {
      await this.http.delete(`${API}/api/tickets/${this.confirmDeleteId}`).toPromise();
      this.listTickets = this.listTickets.filter(t => t.id !== this.confirmDeleteId);
      this.confirmDeleteId = null;
      this.expandedTicketId = null;
    } catch (e: any) {
      this.listError = e?.error?.error || 'Erreur suppression';
      this.confirmDeleteId = null;
    } finally {
      this.deleting = false;
    }
  }

  // ── Commentaires ─────────────────────────────────────────────────────────

  async loadComments(ticketId: string) {
    this.commentsLoading = true;
    try {
      const data: any = await this.http.get(`${API}/api/tickets/${ticketId}/comments`).toPromise();
      this.comments = data.comments || [];
    } catch {
      this.comments = [];
    } finally {
      this.commentsLoading = false;
    }
  }

  async addComment() {
    if (!this.commentText.trim() || !this.expandedTicketId) return;
    this.commentSaving = true;
    this.commentError = '';
    try {
      const comment: any = await this.http.post(
        `${API}/api/tickets/${this.expandedTicketId}/comments`,
        { text: this.commentText.trim() }
      ).toPromise();
      this.comments.push(comment);
      this.commentText = '';
      // Mettre à jour le compteur dans la liste
      const idx = this.listTickets.findIndex(t => t.id === this.expandedTicketId);
      if (idx !== -1) this.listTickets[idx].commentCount = (this.listTickets[idx].commentCount || 0) + 1;
    } catch (e: any) {
      this.commentError = e?.error?.error || 'Erreur envoi commentaire';
    } finally {
      this.commentSaving = false;
    }
  }

  async deleteComment(commentId: string) {
    try {
      await this.http.delete(`${API}/api/tickets/comments/${commentId}`).toPromise();
      this.comments = this.comments.filter(c => c.id !== commentId);
      const idx = this.listTickets.findIndex(t => t.id === this.expandedTicketId);
      if (idx !== -1) this.listTickets[idx].commentCount = Math.max(0, (this.listTickets[idx].commentCount || 1) - 1);
    } catch { /* silencieux */ }
  }

  close() {
    this.configService.setActiveTool('none');
    this.phase             = 'idle';
    this.screenshotDataUrl = null;
    this.canvasMode        = 'none';
    this.isDrawing         = false;
    this.rectStart         = null;
    this.drawSnapshot      = null;
    this.saving            = false;
    this.error             = '';
    this.listTickets       = [];
    this.listError         = '';
    this.expandedTicketId  = null;
    this.editingTicket     = null;
    this.confirmDeleteId   = null;
    this.comments          = [];
    this.commentText       = '';
    this.form = { title: '', url: '', description: '', priority: 'normale', type: 'bug' };
  }

  // ── Canvas ───────────────────────────────────────────────────────────────

  private initCanvases() {
    if (!this.screenshotDataUrl || !this.bgCanvasRef || !this.drawCanvasRef) return;

    const bg   = this.bgCanvasRef.nativeElement;
    const draw = this.drawCanvasRef.nativeElement;
    const img  = new Image();

    img.onload = () => {
      const W = 1000;
      const H = Math.round(img.naturalHeight * (W / img.naturalWidth));

      [bg, draw].forEach(c => {
        c.width  = W;
        c.height = H;
        c.style.width  = W + 'px';
        c.style.height = H + 'px';
      });

      bg.getContext('2d')!.drawImage(img, 0, 0, W, H);
      this.cdr.detectChanges();
    };
    img.src = this.screenshotDataUrl;
  }

  setDrawMode(mode: 'freehand' | 'rect') {
    this.canvasMode = this.canvasMode === mode ? 'none' : mode;
    this.rectStart = null;
    this.drawSnapshot = null;
  }

  clearDrawing() {
    if (!this.drawCanvasRef) return;
    const c = this.drawCanvasRef.nativeElement;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
  }

  // ── Événements souris ────────────────────────────────────────────────────

  onMouseDown(e: MouseEvent) {
    if (this.canvasMode === 'none') return;
    this.isDrawing = true;
    const p = this.getMousePos(e);
    this.lastX = p.x; this.lastY = p.y;
    if (this.canvasMode === 'rect') {
      this.rectStart = p;
      const ctx = this.drawCanvasRef.nativeElement.getContext('2d')!;
      const c = this.drawCanvasRef.nativeElement;
      this.drawSnapshot = ctx.getImageData(0, 0, c.width, c.height);
    }
  }

  onMouseMove(e: MouseEvent) {
    if (!this.isDrawing || this.canvasMode === 'none') return;
    const p = this.getMousePos(e);
    if (this.canvasMode === 'rect' && this.rectStart) {
      const ctx = this.drawCanvasRef.nativeElement.getContext('2d')!;
      const c = this.drawCanvasRef.nativeElement;
      if (this.drawSnapshot) ctx.putImageData(this.drawSnapshot, 0, 0);
      ctx.strokeStyle = this.getStrokeColor();
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(
        this.rectStart.x, this.rectStart.y,
        p.x - this.rectStart.x, p.y - this.rectStart.y
      );
      ctx.setLineDash([]);
    } else {
      this.drawLine(this.lastX, this.lastY, p.x, p.y);
      this.lastX = p.x; this.lastY = p.y;
    }
  }

  onMouseUp(e?: MouseEvent) {
    if (this.canvasMode === 'rect' && this.isDrawing && this.rectStart && e) {
      const p = this.getMousePos(e);
      const ctx = this.drawCanvasRef.nativeElement.getContext('2d')!;
      if (this.drawSnapshot) ctx.putImageData(this.drawSnapshot, 0, 0);
      ctx.strokeStyle = this.getStrokeColor();
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);
      ctx.strokeRect(
        this.rectStart.x, this.rectStart.y,
        p.x - this.rectStart.x, p.y - this.rectStart.y
      );
      ctx.setLineDash([]);
      this.rectStart = null;
      this.drawSnapshot = null;
    }
    this.isDrawing = false;
  }

  // ── Événements tactile ───────────────────────────────────────────────────

  onTouchStart(e: TouchEvent) {
    if (this.canvasMode === 'none') return;
    e.preventDefault();
    this.isDrawing = true;
    const p = this.getTouchPos(e.touches[0]);
    this.lastX = p.x; this.lastY = p.y;
    if (this.canvasMode === 'rect') {
      this.rectStart = p;
      const ctx = this.drawCanvasRef.nativeElement.getContext('2d')!;
      const c = this.drawCanvasRef.nativeElement;
      this.drawSnapshot = ctx.getImageData(0, 0, c.width, c.height);
    }
  }

  onTouchMove(e: TouchEvent) {
    if (!this.isDrawing || this.canvasMode === 'none') return;
    e.preventDefault();
    const p = this.getTouchPos(e.touches[0]);
    if (this.canvasMode === 'rect' && this.rectStart) {
      const ctx = this.drawCanvasRef.nativeElement.getContext('2d')!;
      if (this.drawSnapshot) ctx.putImageData(this.drawSnapshot, 0, 0);
      ctx.strokeStyle = this.getStrokeColor();
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(
        this.rectStart.x, this.rectStart.y,
        p.x - this.rectStart.x, p.y - this.rectStart.y
      );
      ctx.setLineDash([]);
    } else {
      this.drawLine(this.lastX, this.lastY, p.x, p.y);
      this.lastX = p.x; this.lastY = p.y;
    }
  }

  onTouchEnd(e?: TouchEvent) {
    if (this.canvasMode === 'rect' && this.isDrawing && this.rectStart && e && e.changedTouches.length) {
      const p = this.getTouchPos(e.changedTouches[0]);
      const ctx = this.drawCanvasRef.nativeElement.getContext('2d')!;
      if (this.drawSnapshot) ctx.putImageData(this.drawSnapshot, 0, 0);
      ctx.strokeStyle = this.getStrokeColor();
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);
      ctx.strokeRect(
        this.rectStart.x, this.rectStart.y,
        p.x - this.rectStart.x, p.y - this.rectStart.y
      );
      ctx.setLineDash([]);
      this.rectStart = null;
      this.drawSnapshot = null;
    }
    this.isDrawing = false;
  }

  // ── Helpers dessin ───────────────────────────────────────────────────────

  private getMousePos(e: MouseEvent): { x: number; y: number } {
    const c    = this.drawCanvasRef.nativeElement;
    const rect = c.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (c.width  / rect.width),
      y: (e.clientY - rect.top)  * (c.height / rect.height)
    };
  }

  private getTouchPos(t: Touch): { x: number; y: number } {
    const c    = this.drawCanvasRef.nativeElement;
    const rect = c.getBoundingClientRect();
    return {
      x: (t.clientX - rect.left) * (c.width  / rect.width),
      y: (t.clientY - rect.top)  * (c.height / rect.height)
    };
  }

  private getStrokeColor(): string {
    if (this.selectedColor === 'white') return 'rgba(255,255,255,0.97)';
    if (this.selectedColor === 'black') return 'rgba(0,0,0,0.90)';
    return 'rgba(239,68,68,0.90)';
  }

  private drawLine(x1: number, y1: number, x2: number, y2: number) {
    const ctx = this.drawCanvasRef.nativeElement.getContext('2d')!;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = this.getStrokeColor();
    ctx.lineWidth  = 5;
    ctx.lineCap    = 'round';
    ctx.lineJoin   = 'round';
    ctx.stroke();
  }

  private getMergedScreenshot(): string | null {
    if (!this.bgCanvasRef || !this.drawCanvasRef) return this.screenshotDataUrl;
    const bg   = this.bgCanvasRef.nativeElement;
    const draw = this.drawCanvasRef.nativeElement;
    const tmp  = document.createElement('canvas');
    tmp.width  = bg.width;
    tmp.height = bg.height;
    const ctx  = tmp.getContext('2d')!;
    ctx.drawImage(bg,   0, 0);
    ctx.drawImage(draw, 0, 0);
    return tmp.toDataURL('image/png');
  }

  // ── Soumission ───────────────────────────────────────────────────────────

  async submit() {
    if (!this.form.title.trim())       { this.error = 'Le titre est requis.';      return; }
    if (!this.form.description.trim()) { this.error = 'Le commentaire est requis.'; return; }

    this.saving = true;
    this.error  = '';

    const payload = {
      title:       this.form.title.trim(),
      description: this.form.description.trim(),
      url:         this.form.url,
      type:        this.form.type,
      priority:    this.form.priority,
      screenshot:  this.getMergedScreenshot()
    };

    try {
      await this.http.post(`${API}/api/tickets`, payload).toPromise();
      this.close();
    } catch (e: any) {
      this.error = e?.error?.error || 'Erreur lors de l\'envoi.';
    } finally {
      this.saving = false;
    }
  }

  // ── Helpers CSS ──────────────────────────────────────────────────────────

  priorityActiveCls(p: Priority): string {
    return {
      critique: 'border-red-500 bg-red-500/10 text-red-500 dark:text-red-400',
      haute:    'border-orange-500 bg-orange-500/10 text-orange-500 dark:text-orange-400',
      normale:  'border-blue-500 bg-blue-500/10 text-blue-500 dark:text-blue-400',
      basse:    'border-gray-400 bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-white/50'
    }[p];
  }

  priorityDotCls(p: Priority): string {
    return { critique: 'bg-red-500', haute: 'bg-orange-500', normale: 'bg-blue-500', basse: 'bg-gray-400' }[p];
  }
}

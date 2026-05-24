import { Component, OnInit, Input, Output, EventEmitter, signal, SimpleChanges, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../../core/services/auth.service';
import { WorgHelpTriggerComponent } from '../../../../shared/help/worg-help-trigger.component';
import { environment } from '../../../../../environments/environment';

const API = environment.apiDataUrl;

@Component({
  selector: 'app-admin-help',
  standalone: true,
  imports: [CommonModule, FormsModule, WorgHelpTriggerComponent],
  templateUrl: './admin-help.component.html',
})
export class AdminHelpComponent implements OnInit, OnChanges {
  @Input() editId: number | null = null;
  @Output() count = new EventEmitter<number>();

  helpItems = signal<any[]>([]);
  loadingHelp = signal(false);
  helpError = signal('');
  deletingHelpId = signal<number | null>(null);

  editingHelp = signal<any | null>(null);
  editHelpId: number = 0;
  editHelpTitle = '';
  editHelpText = '';
  editHelpPage = '';
  savingHelp = signal(false);

  showNewHelpModal = signal(false);
  newHelpTitle = '';
  newHelpText = '';
  newHelpPage = '';
  creatingHelp = signal(false);

  constructor(private authService: AuthService) {}

  async ngOnInit() {
    await this.loadHelp();
    if (this.editId) {
      const item = this.helpItems().find(h => h.id === this.editId);
      if (item) this.openEditHelp(item);
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['editId']?.currentValue && this.helpItems().length > 0) {
      const item = this.helpItems().find(h => h.id === changes['editId'].currentValue);
      if (item) this.openEditHelp(item);
    }
  }

  async loadHelp() {
    this.loadingHelp.set(true);
    this.helpError.set('');
    try {
      const token = this.authService.getToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API}/api/admin/help`, { headers });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur chargement');
      const list = await res.json();
      this.helpItems.set(list);
      this.count.emit(list.length);
    } catch (e: any) {
      this.helpError.set(e?.message || 'Erreur chargement help');
    } finally {
      this.loadingHelp.set(false);
    }
  }

  openNewHelpModal() {
    this.newHelpTitle = '';
    this.newHelpText = '';
    this.newHelpPage = '';
    this.showNewHelpModal.set(true);
  }

  closeNewHelpModal() { this.showNewHelpModal.set(false); }

  async createHelp() {
    if (!this.newHelpTitle.trim() || !this.newHelpText.trim()) return;
    this.creatingHelp.set(true);
    this.helpError.set('');
    try {
      const token = this.authService.getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      const res = await fetch(`${API}/api/admin/help`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title: this.newHelpTitle, text: this.newHelpText, page: this.newHelpPage })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur création');
      this.closeNewHelpModal();
      await this.loadHelp();
    } catch (e: any) {
      this.helpError.set(e?.message || 'Erreur création');
    } finally {
      this.creatingHelp.set(false);
    }
  }

  openEditHelp(item: any) {
    this.editingHelp.set(item);
    this.editHelpId = item.id;
    this.editHelpTitle = item.title;
    this.editHelpText = item.text;
    this.editHelpPage = item.page || '';
  }

  closeEditHelp() { this.editingHelp.set(null); }

  async saveHelp() {
    const item = this.editingHelp();
    if (!item || !this.editHelpTitle.trim() || !this.editHelpText.trim()) return;
    this.savingHelp.set(true);
    try {
      const token = this.authService.getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      const res = await fetch(`${API}/api/admin/help/${item.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ title: this.editHelpTitle, text: this.editHelpText, page: this.editHelpPage, newId: this.editHelpId })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur sauvegarde');
      this.closeEditHelp();
      await this.loadHelp();
    } catch (e: any) {
      this.helpError.set(e?.message || 'Erreur sauvegarde');
    } finally {
      this.savingHelp.set(false);
    }
  }

  confirmDeleteHelp(id: number) { this.deletingHelpId.set(id); }
  cancelDeleteHelp() { this.deletingHelpId.set(null); }

  async deleteHelp(id: number) {
    try {
      const token = this.authService.getToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API}/api/admin/help/${id}`, { method: 'DELETE', headers });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur suppression');
      this.deletingHelpId.set(null);
      await this.loadHelp();
    } catch (e: any) {
      this.helpError.set(e?.message || 'Erreur suppression');
      this.deletingHelpId.set(null);
    }
  }
}

import { Component, OnInit, Output, EventEmitter, signal, inject } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { AuthService, AuthUser } from '../../../../core/services/auth.service';
import { environment } from '../../../../../environments/environment';
import { WoActionHistoryService } from '../../../../core/services/wo-action-history.service';

@Component({
    selector: 'app-admin-users',
    imports: [FormsModule],
    templateUrl: './admin-users.component.html'
})
export class AdminUsersComponent implements OnInit {
  @Output() count = new EventEmitter<number>();

  users = signal<AuthUser[]>([]);
  loadingUsers = signal(true);
  usersError = signal('');
  deletingUserId = signal<string | null>(null);

  editingUser = signal<AuthUser | null>(null);
  editUsername = '';
  editEmail = '';
  editRole: string = 'user';
  editPassword = '';
  savingUser = signal(false);

  showNewUserModal = signal(false);
  newUsername = '';
  newEmail = '';
  newPassword = '';
  newRole: string = 'user';
  creatingUser = signal(false);

  readonly roles: readonly string[] = ['user', 'admin'];

  private woHistory = inject(WoActionHistoryService);

  constructor(private authService: AuthService) {}

  ngOnInit() {
    this.loadUsers();
  }

  async loadUsers() {
    this.loadingUsers.set(true);
    this.usersError.set('');
    try {
      const list = await this.authService.getUsers();
      this.users.set(list);
      this.count.emit(list.length);
    } catch (e: any) {
      this.usersError.set(e?.error?.error || 'Erreur chargement utilisateurs');
    } finally {
      this.loadingUsers.set(false);
    }
  }

  openEditUser(user: AuthUser) {
    this.editingUser.set(user);
    this.editUsername = user.username;
    this.editEmail = user.email;
    this.editRole = user.role;
    this.editPassword = '';
  }

  closeEditUser() { this.editingUser.set(null); }

  async saveUser() {
    const user = this.editingUser();
    if (!user) return;
    this.savingUser.set(true);
    const before = { username: user.username, email: user.email, role: user.role };
    try {
      const data: any = { username: this.editUsername, email: this.editEmail, role: this.editRole };
      if (this.editPassword) data.password = this.editPassword;
      await this.authService.updateUser(user.id, data);
      this.woHistory.track({
        section: 'admin/users', actionType: 'update',
        label: `Modification de l'utilisateur «${this.editUsername}»`,
        entityType: 'user', entityId: user.id, entityLabel: this.editUsername,
        beforeState: before,
        afterState: { username: this.editUsername, email: this.editEmail, role: this.editRole },
        undoable: true,
        undoAction: { endpoint: `/api/auth/users/${user.id}`, method: 'PUT', payload: before }
      }).catch(() => {});
      this.closeEditUser();
      await this.loadUsers();
    } catch (e: any) {
      this.usersError.set(e?.error?.error || 'Erreur sauvegarde utilisateur');
    } finally {
      this.savingUser.set(false);
    }
  }

  confirmDeleteUser(id: string) { this.deletingUserId.set(id); }
  cancelDeleteUser() { this.deletingUserId.set(null); }

  async deleteUser(id: string) {
    const user = this.users().find(u => u.id === id);
    try {
      await this.authService.deleteUser(id);
      this.woHistory.track({
        section: 'admin/users', actionType: 'delete',
        label: `Suppression de l'utilisateur «${user?.username}»`,
        entityType: 'user', entityId: id, entityLabel: user?.username,
        beforeState: user ? { username: user.username, email: user.email, role: user.role } : undefined,
        undoable: false
      }).catch(() => {});
      this.deletingUserId.set(null);
      await this.loadUsers();
    } catch (e: any) {
      this.usersError.set(e?.error?.error || 'Erreur suppression utilisateur');
      this.deletingUserId.set(null);
    }
  }

  openNewUserModal() {
    this.newUsername = '';
    this.newEmail = '';
    this.newPassword = '';
    this.newRole = 'user';
    this.showNewUserModal.set(true);
  }

  closeNewUserModal() { this.showNewUserModal.set(false); }

  async createUser() {
    if (!this.newUsername.trim() || !this.newEmail.trim() || !this.newPassword) return;
    this.creatingUser.set(true);
    this.usersError.set('');
    try {
      const res = await fetch(`${environment.apiDataUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: this.newUsername, email: this.newEmail, password: this.newPassword })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erreur création');
      }
      const data = await res.json();
      if (this.newRole === 'admin') {
        await this.authService.updateUser(data.user.id, { role: 'admin' });
      }
      this.woHistory.track({
        section: 'admin/users', actionType: 'create',
        label: `Création de l'utilisateur «${this.newUsername}»`,
        entityType: 'user', entityId: data.user.id, entityLabel: this.newUsername,
        afterState: { username: this.newUsername, email: this.newEmail, role: this.newRole },
        undoable: true,
        undoAction: { endpoint: `/api/auth/users/${data.user.id}`, method: 'DELETE' }
      }).catch(() => {});
      this.closeNewUserModal();
      await this.loadUsers();
    } catch (e: any) {
      this.usersError.set(e?.message || 'Erreur création utilisateur');
    } finally {
      this.creatingUser.set(false);
    }
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

  isLoginOld(iso: string | null | undefined): boolean {
    if (!iso) return false;
    return (Date.now() - new Date(iso).getTime()) > 5 * 24 * 60 * 60 * 1000;
  }
}

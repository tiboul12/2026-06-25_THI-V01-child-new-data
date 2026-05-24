import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '@worganic/portail-core/data-access';

@Component({
  selector: 'app-projet-toolbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './projet-toolbar.component.html',
})
export class ProjetToolbarComponent {
  @Input() projectTitle = '';
  @Input() isDirty = false;
  @Input() backupType: string | null = null;
  @Output() save = new EventEmitter<void>();

  readonly backupBadge: Record<string, { icon: string; label: string; css: string }> = {
    ftp:         { icon: 'dns',           label: 'FTP',          css: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10' },
    github:      { icon: 'code',          label: 'GitHub',       css: 'text-purple-400 border-purple-500/30 bg-purple-500/10' },
    gitlab:      { icon: 'merge',         label: 'GitLab',       css: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
    googledrive: { icon: 'add_to_drive',  label: 'Drive',        css: 'text-green-400 border-green-500/30 bg-green-500/10' },
  };

  constructor(private router: Router, private auth: AuthService, private location: Location) {}

  goBack() { this.location.back(); }
  goHome() { this.router.navigate(['/home']); }
  goProjets() { this.router.navigate(['/projets']); }

  async logout() {
    await this.auth.logout();
    this.router.navigate(['/']);
  }
}

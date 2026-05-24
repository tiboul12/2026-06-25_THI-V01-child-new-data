import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { DbStatusService } from '../../../core/services/db-status.service';
import { AppConfigService } from '../../../core/services/app-config.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss'
})
export class LandingComponent implements OnInit, OnDestroy {
  get appName()        { return this.appConfig.appName(); }
  get copyrightYear()  { return this.appConfig.copyrightYear(); }
  get copyrightHolder(){ return this.appConfig.copyrightHolder(); }
  get lc()             { return this.appConfig.landingConfig(); }

  showLoginModal = false;
  showRegisterModal = false;

  loginEmail = '';
  loginPassword = '';
  loginError = '';
  loginLoading = false;

  registerUsername = '';
  registerEmail = '';
  registerPassword = '';
  registerPasswordConfirm = '';
  registerError = '';
  registerLoading = false;

  particles: { x: number; y: number; size: number; duration: number; delay: number }[] = [];

  private animFrameId: number | null = null;

  constructor(
    private auth: AuthService,
    private router: Router,
    private themeService: ThemeService,
    public db: DbStatusService,
    public appConfig: AppConfigService
  ) {}

  retrying = false;

  get dbError(): boolean {
    return this.db.status() === 'error';
  }

  async retryDb(): Promise<void> {
    this.retrying = true;
    await this.db.check();
    this.retrying = false;
    if (!this.dbError && this.auth.isAuthenticated()) {
      this.router.navigate(['/projets']);
    }
  }

  ngOnInit() {
    this.themeService.applyTheme('dark');

    if (this.dbError) {
      return;
    }

    if (this.auth.isAuthenticated()) {
      this.router.navigate(['/projets']);
      return;
    }

    this.particles = Array.from({ length: 30 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      duration: Math.random() * 15 + 8,
      delay: Math.random() * 10
    }));
  }

  ngOnDestroy() {
    if (this.animFrameId !== null) cancelAnimationFrame(this.animFrameId);
  }

  openLogin() {
    this.showRegisterModal = false;
    this.loginError = '';
    this.loginEmail = 'admin@admin.com';
    this.loginPassword = 'admin';
    this.showLoginModal = true;
  }

  openRegister() {
    this.showLoginModal = false;
    this.registerError = '';
    this.registerUsername = '';
    this.registerEmail = '';
    this.registerPassword = '';
    this.registerPasswordConfirm = '';
    this.showRegisterModal = true;
  }

  closeModals() {
    this.showLoginModal = false;
    this.showRegisterModal = false;
  }

  async submitLogin() {
    if (!this.loginEmail || !this.loginPassword) {
      this.loginError = 'Veuillez remplir tous les champs';
      return;
    }
    this.loginLoading = true;
    this.loginError = '';
    try {
      await this.auth.login(this.loginEmail, this.loginPassword);
      this.closeModals();
      this.router.navigate(['/projets']);
    } catch (err: any) {
      this.loginError = err?.error?.error || 'Erreur de connexion';
    } finally {
      this.loginLoading = false;
    }
  }

  async submitRegister() {
    if (!this.registerUsername || !this.registerEmail || !this.registerPassword) {
      this.registerError = 'Veuillez remplir tous les champs';
      return;
    }
    if (this.registerPassword !== this.registerPasswordConfirm) {
      this.registerError = 'Les mots de passe ne correspondent pas';
      return;
    }
    if (this.registerPassword.length < 6) {
      this.registerError = 'Le mot de passe doit faire au moins 6 caractères';
      return;
    }
    this.registerLoading = true;
    this.registerError = '';
    try {
      await this.auth.register(this.registerUsername, this.registerEmail, this.registerPassword);
      this.closeModals();
      this.router.navigate(['/projets']);
    } catch (err: any) {
      this.registerError = err?.error?.error || "Erreur lors de l'inscription";
    } finally {
      this.registerLoading = false;
    }
  }

  onOverlayClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.closeModals();
    }
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') this.closeModals();
  }
}

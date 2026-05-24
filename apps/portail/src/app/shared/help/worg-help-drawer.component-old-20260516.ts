import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { trigger, style, animate, transition } from '@angular/animations';
import { HelpService } from './help.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'worg-help-drawer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './worg-help-drawer.component.html',
  animations: [
    trigger('slideIn', [
      transition(':enter', [
        style({ transform: 'translateX(100%)' }),
        animate('280ms cubic-bezier(0.25, 0.8, 0.25, 1)', style({ transform: 'translateX(0)' }))
      ]),
      transition(':leave', [
        animate('220ms cubic-bezier(0.4, 0, 0.6, 1)', style({ transform: 'translateX(100%)' }))
      ])
    ]),
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('200ms ease-out', style({ opacity: 1 }))
      ]),
      transition(':leave', [
        animate('180ms ease-in', style({ opacity: 0 }))
      ])
    ])
  ]
})
export class WorgHelpDrawerComponent {
  constructor(
    public helpService: HelpService,
    public authService: AuthService,
    private router: Router
  ) {}

  goToAdminEdit(id: number) {
    this.helpService.close();
    this.router.navigate(['/admin'], { queryParams: { tab: 'help', editId: id } });
  }
}

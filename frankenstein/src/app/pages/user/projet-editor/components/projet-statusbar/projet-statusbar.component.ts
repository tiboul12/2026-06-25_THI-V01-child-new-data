import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-projet-statusbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './projet-statusbar.component.html',
})
export class ProjetStatusbarComponent {
  @Input() status = 'Brouillon';
  @Input() linkedDoc = '';
  @Input() isDirty = false;
  @Input() backupType: string | null = null;
}

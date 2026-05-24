import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'wo-cahier-recette-doc',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './cahier-recette-doc.component.html',
  styleUrl: './cahier-recette-doc.component.scss'
})
export class CahierRecetteDocComponent {
  readonly lb = '{{';
  readonly rb = '}}';

  goBack() { window.history.back(); }
}

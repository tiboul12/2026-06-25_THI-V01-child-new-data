import { Component } from '@angular/core';

import { RouterModule } from '@angular/router';

@Component({
    selector: 'wo-cahier-recette-doc',
    imports: [RouterModule],
    templateUrl: './cahier-recette-doc.component.html',
    styleUrl: './cahier-recette-doc.component.scss'
})
export class CahierRecetteDocComponent {
  readonly lb = '{{';
  readonly rb = '}}';

  goBack() { window.history.back(); }
}

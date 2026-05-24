import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { HeaderComponent, FooterComponent } from '@worganic/shared/ui';
import { LayoutService } from '@worganic/portail-core/data-access';
import { environment } from '../environments/environment';

@Component({
  imports: [RouterModule, HeaderComponent, FooterComponent],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  portailUrl = environment.portailUrl;

  constructor(public layoutService: LayoutService) {}
}

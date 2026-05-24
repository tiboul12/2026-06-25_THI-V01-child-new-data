import { Component, OnInit, ViewChild } from '@angular/core';
import { RouterOutlet } from '@angular/router';


import { ThemeService } from '@worganic/portail-core/data-access';
import { AuthService } from '@worganic/portail-core/data-access';
import { ConfigService } from '@worganic/portail-core/data-access';
import { LayoutService } from '@worganic/portail-core/data-access';
import { WoActionHistoryService } from '@worganic/portail-core/data-access';

import { HeaderComponent, FooterComponent } from '@worganic/shared/ui';
import { navigateToProjets } from './shared/utils/navigate-to-projets';
import { TicketWidgetComponent } from './tools/ticket-widget/ticket-widget.component';
import { CahierRecetteWidgetComponent } from './tools/cahier-recette/cahier-recette-widget.component';
import { WoTchatIaWidgetComponent } from './tools/wo/wo-tchat-ia/wo-tchat-ia-widget.component';
import { WoActionsWidgetComponent } from './tools/wo/wo-actions/wo-actions-widget.component';
import { WoToolsPanelComponent } from './tools/wo/wo-tools-panel/wo-tools-panel.component';
import { WorgHelpDrawerComponent } from './shared/help/worg-help-drawer.component';

@Component({
    selector: 'app-root',
    imports: [
    RouterOutlet,
    HeaderComponent,
    FooterComponent,
    TicketWidgetComponent,
    CahierRecetteWidgetComponent,
    WoTchatIaWidgetComponent,
    WoActionsWidgetComponent,
    WoToolsPanelComponent,
    WorgHelpDrawerComponent
],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  @ViewChild(WoToolsPanelComponent) toolsPanel?: WoToolsPanelComponent;
  navigateToProjets = navigateToProjets;

  constructor(
    private themeService: ThemeService,
    public auth: AuthService,
    public configService: ConfigService,
    public layoutService: LayoutService,
    private woActionHistory: WoActionHistoryService
  ) {}

  ngOnInit() {
    this.themeService.initTheme();
    if (this.auth.getToken()) {
      this.auth.verify().catch(() => {});
    }
    // Exposition globale pour scripts JS non-Angular
    (window as any).WoActionHistory = {
      track: (ctx: any) => this.woActionHistory.track(ctx)
    };
  }

  openToolsPanel() {
    this.toolsPanel?.open();
  }
}

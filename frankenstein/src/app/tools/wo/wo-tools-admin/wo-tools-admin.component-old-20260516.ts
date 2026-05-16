import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfigService } from '../../../core/services/config.service';

interface ToolEntry {
  id: string;
  label: string;
  icon: string;
  colorText: string;
  colorBg: string;
  hasWidget: boolean;
}

@Component({
  selector: 'wo-tools-admin',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './wo-tools-admin.component.html',
})
export class WoToolsAdminComponent {
  readonly configService = inject(ConfigService);

  readonly tools: ToolEntry[] = [
    { id: 'tchat',   label: 'Tchat IA',   icon: 'smart_toy',          colorText: 'text-violet-400',  colorBg: 'bg-violet-500/10',  hasWidget: true  },
    { id: 'recette', label: 'Recette',    icon: 'checklist',           colorText: 'text-teal-400',    colorBg: 'bg-teal-500/10',    hasWidget: true  },
    { id: 'tickets', label: 'Tickets',    icon: 'confirmation_number', colorText: 'text-orange-400',  colorBg: 'bg-orange-500/10',  hasWidget: true  },
    { id: 'actions', label: 'Actions',    icon: 'rocket_launch',       colorText: 'text-indigo-400',  colorBg: 'bg-indigo-500/10',  hasWidget: true  },
    { id: 'ia-logs', label: 'IA Logs',    icon: 'terminal',            colorText: 'text-emerald-400', colorBg: 'bg-emerald-500/10', hasWidget: false },
    { id: 'history', label: 'Historique', icon: 'history',             colorText: 'text-amber-400',   colorBg: 'bg-amber-500/10',   hasWidget: false },
  ];

  isTabEnabled(id: string): boolean {
    const s = this.configService;
    switch (id) {
      case 'tchat':   return s.tchatTabEnabled();
      case 'recette': return s.recetteTabEnabled();
      case 'tickets': return s.ticketsTabEnabled();
      case 'actions': return s.actionsTabEnabled();
      case 'ia-logs': return s.iaLogsTabEnabled();
      case 'history': return s.historyTabEnabled();
      default: return true;
    }
  }

  isFloatingEnabled(id: string): boolean {
    const s = this.configService;
    switch (id) {
      case 'tchat':   return s.tchatIaEnabled();
      case 'recette': return s.recetteWidgetEnabled();
      case 'tickets': return s.ticketsEnabled();
      case 'actions': return s.actionsEnabled();
      default: return false;
    }
  }

  toggleTab(id: string): void {
    const val = !this.isTabEnabled(id);
    switch (id) {
      case 'tchat':   this.configService.saveEnabledTabs({ tchat: val });   break;
      case 'recette': this.configService.saveEnabledTabs({ recette: val }); break;
      case 'tickets': this.configService.saveEnabledTabs({ tickets: val }); break;
      case 'actions': this.configService.saveEnabledTabs({ actions: val }); break;
      case 'ia-logs': this.configService.saveEnabledTabs({ iaLogs: val });  break;
      case 'history': this.configService.saveEnabledTabs({ history: val }); break;
    }
  }

  toggleFloating(id: string): void {
    const val = !this.isFloatingEnabled(id);
    switch (id) {
      case 'tchat':   this.configService.saveEnabledTools({ tchat: val });   break;
      case 'recette': this.configService.saveEnabledTools({ recette: val }); break;
      case 'tickets': this.configService.saveEnabledTools({ tickets: val }); break;
      case 'actions': this.configService.saveEnabledTools({ actions: val }); break;
    }
  }
}

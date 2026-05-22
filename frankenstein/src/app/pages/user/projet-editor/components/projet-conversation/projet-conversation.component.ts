import { Component, Input, Output, EventEmitter, OnChanges, OnDestroy, SimpleChanges, signal, computed, inject, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ConversationService, Message } from '../../../../../core/services/conversation.service';
import { ConfigService } from '../../../../../core/services/config.service';
import { WoActionHistoryService } from '../../../../../core/services/wo-action-history.service';
import { ProjetAiEditService } from '../../services/projet-ai-edit.service';
import { FileNode } from '../../../../../core/services/project-files.service';

@Component({
  selector: 'app-projet-conversation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './projet-conversation.component.html',
  host: { class: 'flex flex-col min-h-0 flex-1 overflow-hidden' },
})
export class ProjetConversationComponent implements OnChanges, AfterViewChecked, OnDestroy {
  @Input() sectionId: string | null = null;
  @Input() projectId: string | null = null;
  @Input() files: FileNode[] = [];
  @Input() projectName: string | null = null;
  @Input() iaInstructions: string | null = null;
  @Output() conversationAdded = new EventEmitter<string>();
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  private convService = inject(ConversationService);
  configService = inject(ConfigService);
  private woHistory = inject(WoActionHistoryService);
  aiEditService = inject(ProjetAiEditService);

  inputMessage = '';
  loading = signal(false);
  private shouldScroll = false;
  private subs = new Subscription();

  messages: Message[] = [];

  // Mode IA : true = les envois vont à l'IA (pas besoin de taper @ia)
  iaMode = signal(false);
  // Inclure l'historique de la conversation comme contexte supplémentaire
  includeHistory = signal(false);
  // Modèle sélectionné localement (init depuis config, modifiable)
  selectedModel = signal('');
  // Afficher/masquer le sélecteur de modèle
  showModelSelect = signal(false);

  // Liste consolidée de tous les modèles disponibles
  readonly allModels = computed(() => {
    const cfg = this.configService.cliConfig();
    const claude = (cfg.modelsList?.claude || []).map(m => ({ ...m, provider: 'claude' }));
    const gemini = (cfg.modelsList?.gemini || []).map(m => ({ ...m, provider: 'gemini' }));
    return [...claude, ...gemini];
  });

  // Le modèle actif : soit selectedModel, soit celui de la config
  readonly activeModel = computed(() => {
    const manual = this.selectedModel();
    if (manual) return manual;
    return this.configService.cliConfig().headerSelection?.model || 'claude-sonnet-4-6';
  });

  // Label court du modèle actif (affichage bouton)
  readonly modelLabel = computed(() => {
    const m = this.activeModel();
    const found = this.allModels().find(x => x.value === m);
    if (found) return found.label || m;
    return m.replace('claude-', '').replace('gemini-', '');
  });

  get isAiMessage(): boolean {
    return this.iaMode() || this.inputMessage.trimStart().toLowerCase().startsWith('@ia ');
  }

  toggleIaMode() {
    this.iaMode.update(v => !v);
    // Nettoie le préfixe @ia s'il était tapé manuellement
    if (!this.iaMode() && this.inputMessage.trimStart().toLowerCase().startsWith('@ia ')) {
      const raw = this.inputMessage.trimStart();
      this.inputMessage = raw.slice(raw.toLowerCase().indexOf('@ia ') + 4);
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['sectionId']) {
      if (this.sectionId) {
        this.loadHistory();
        const pending = this.aiEditService.pendingEdit();
        if (pending && pending.sectionId !== this.sectionId) {
          this.aiEditService.cancelEdit();
        }
      } else {
        this.messages = [];
      }
    }
    // Init du modèle depuis la config au premier chargement
    if (changes['projectId'] && !this.selectedModel()) {
      const cfg = this.configService.cliConfig();
      this.selectedModel.set(cfg.headerSelection?.model || '');
    }
  }

  ngAfterViewChecked() {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  private scrollToBottom(): void {
    try {
      this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
    } catch { }
  }

  loadHistory() {
    if (!this.sectionId) return;
    this.loading.set(true);
    this.convService.getHistory(this.sectionId).subscribe({
      next: (data) => {
        this.messages = data.messages || [];
        this.loading.set(false);
        this.shouldScroll = true;
      },
      error: () => this.loading.set(false)
    });
  }

  toggleHistory() {
    this.includeHistory.update(v => !v);
  }

  toggleModelSelect() {
    this.showModelSelect.update(v => !v);
  }

  onModelChange(value: string) {
    this.selectedModel.set(value);
    this.showModelSelect.set(false);
  }

  send() {
    if (!this.inputMessage.trim() || !this.sectionId) return;
    if (this.isAiMessage) {
      this.sendAiEdit();
    } else {
      this.sendChat();
    }
  }

  private sendChat() {
    const text = this.inputMessage;
    this.inputMessage = '';
    this.convService.sendMessage(this.sectionId!, text).subscribe({
      next: (msg) => {
        this.messages = [...this.messages, msg];
        this.shouldScroll = true;
        this.conversationAdded.emit(this.sectionId!);
        this.woHistory.track({
          section: 'projets/conversation',
          actionType: 'create',
          label: `Message envoyé dans la section «${this.sectionId}»`,
          entityType: 'message',
          entityId: this.sectionId ?? undefined,
          afterState: { text: text.substring(0, 200) },
          context: { projectId: this.projectId, sectionId: this.sectionId },
          undoable: false
        }).catch(() => { });
      },
      error: () => { this.inputMessage = text; }
    });
  }

  private sendAiEdit() {
    if (this.aiEditService.isStreaming()) return;

    // Extraire le prompt : strip @ia si tapé manuellement, sinon message brut
    const raw = this.inputMessage.trimStart();
    const prompt = raw.toLowerCase().startsWith('@ia ')
      ? raw.slice(raw.toLowerCase().indexOf('@ia ') + 4).trim()
      : raw.trim();
    if (!prompt) return;

    // Trouver le contenu de contenu.md pour la section active
    const fileInfo = this.findContenFile(this.sectionId!, this.files);
    if (!fileInfo) {
      this.addSystemMessage('⚠️ Impossible de trouver le fichier contenu.md pour cette section.');
      return;
    }

    const provider = this.configService.cliConfig().headerSelection?.provider || 'claude';
    if (provider.startsWith('gemini')) {
      this.addSystemMessage('⚠️ Gemini n\'est pas supporté pour la modification de fichiers. Sélectionnez un modèle Claude.');
      return;
    }
    const model = this.activeModel();

    // Construire le prompt final (avec historique si option activée)
    let finalPrompt = prompt;
    if (this.includeHistory() && this.messages.length > 0) {
      const historyLines = this.messages
        .map(m => `${m.role === 'ai' ? 'IA' : m.user}: ${m.text.slice(0, 500)}`)
        .join('\n');
      finalPrompt = `[Historique de la conversation]\n${historyLines}\n\n[Demande actuelle]\n${prompt}`;
    }

    this.inputMessage = '';

    // Message user dans la conversation
    const userMsg: Message = {
      user: 'Moi',
      userId: 'local',
      text: this.iaMode() ? `@ia ${prompt}` : raw,
      timestamp: new Date().toISOString(),
      role: 'user'
    };
    this.messages = [...this.messages, userMsg];

    // Placeholder IA
    const aiMsg: Message = {
      user: 'IA',
      userId: 'ai',
      text: '',
      timestamp: new Date().toISOString(),
      role: 'ai'
    };
    this.messages = [...this.messages, aiMsg];
    this.shouldScroll = true;

    const sub = this.aiEditService.chunk$.subscribe(chunk => {
      const updated = [...this.messages];
      const last = updated[updated.length - 1];
      if (last?.role === 'ai') updated[updated.length - 1] = { ...last, text: last.text + chunk };
      this.messages = updated;
      this.shouldScroll = true;
    });
    this.subs.add(sub);

    const doneSub = this.aiEditService.done$.subscribe(finalText => {
      sub.unsubscribe();
      doneSub.unsubscribe();
      // Attacher les infos tokens au dernier message IA
      const tokens = this.aiEditService.tokenInfo();
      if (tokens) {
        const updated = [...this.messages];
        const last = updated[updated.length - 1];
        if (last?.role === 'ai') updated[updated.length - 1] = { ...last, tokenInfo: tokens };
        this.messages = updated;
      }
      if (finalText && this.sectionId) {
        this.convService.saveAiMessage(this.sectionId, finalText).subscribe();
        this.conversationAdded.emit(this.sectionId);
      }
    });
    this.subs.add(doneSub);

    const errSub = this.aiEditService.error$.subscribe(errMsg => {
      sub.unsubscribe();
      errSub.unsubscribe();
      const updated = [...this.messages];
      const last = updated[updated.length - 1];
      if (last?.role === 'ai') updated[updated.length - 1] = { ...last, text: `⚠️ Erreur : ${errMsg}` };
      this.messages = updated;
    });
    this.subs.add(errSub);

    this.aiEditService.startEdit(
      this.sectionId!,
      fileInfo.fileId,
      fileInfo.content,
      finalPrompt,
      fileInfo.fileName,
      provider,
      model,
      this.iaInstructions
    );
  }

  private addSystemMessage(text: string) {
    const msg: Message = { user: 'Système', userId: 'system', text, timestamp: new Date().toISOString(), role: 'ai' };
    this.messages = [...this.messages, msg];
  }

  private findContenFile(sectionId: string, nodes: FileNode[]): { fileId: string; content: string; fileName: string } | null {
    for (const node of nodes) {
      if (node.type === 'folder' && node.id === sectionId) {
        const contenu = (node.children || []).find(c => c.type === 'file' && c.name === 'contenu.md');
        if (contenu) return { fileId: contenu.id, content: contenu.content ?? '', fileName: node.name };
      }
      if (node.children) {
        const found = this.findContenFile(sectionId, node.children);
        if (found) return found;
      }
    }
    return null;
  }
}

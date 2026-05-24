import {
  Component, Input, Output, EventEmitter, OnChanges, SimpleChanges,
  ViewChild, ElementRef, AfterViewChecked, ChangeDetectorRef
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  TchatMessage, TchatForm, ZoneSelection, TchatContext, TchatResult, TchatSession
} from './tchat-ia.types';

export type { TchatMessage, TchatForm, TchatFormField, ZoneSelection, TchatContext, TchatResult, TchatSession } from './tchat-ia.types';

const FORM_START = '[FORM_START]';
const FORM_END = '[FORM_END]';
const DOC_MARKER_RE = /\[DOCUMENT_CRÉÉ:\s*([^\]]+)\]/g;

@Component({
  selector: 'wo-tchat-ia',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './tchat-ia.component.html'
})
export class TchatIaComponent implements OnChanges, AfterViewChecked {

  // ── Inputs ───────────────────────────────────────────────────────────────
  @Input() visible = false;
  @Input() mode: 'modal' | 'inline' = 'modal';
  @Input() executorUrl = 'http://localhost:3002';
  @Input() apiUrl = 'http://localhost:3001';
  @Input() provider = 'claude';
  @Input() model = 'claude-sonnet-4-6';
  @Input() projectId: string | null = null;
  @Input() systemPrompt = '';
  @Input() initialPrompt = '';
  @Input() context: TchatContext = {};
  @Input() title = 'Tchat IA';
  @Input() allowFormGeneration = true;
  @Input() allowZoneSelection = true;
  @Input() allowMarkdown = true;
  @Input() allowExport = true;
  @Input() allowContinueAfterEnd = false;
  @Input() quickPrompts: string[] = [];
  @Input() endMarker = '[FIN_TCHAT]';
  @Input() maxMessages = 0;
  @Input() formTemplates: TchatForm[] = [];

  // ── Outputs ──────────────────────────────────────────────────────────────
  @Output() closed = new EventEmitter<TchatResult>();
  @Output() aiResponse = new EventEmitter<TchatMessage>();
  @Output() formSubmitted = new EventEmitter<{ formTitle: string; values: Record<string, any> }>();
  @Output() zoneModificationRequested = new EventEmitter<ZoneSelection>();
  @Output() messageSent = new EventEmitter<string>();

  // ── View refs ─────────────────────────────────────────────────────────────
  @ViewChild('messagesEnd') messagesEnd!: ElementRef;
  @ViewChild('cliLogEnd') cliLogEnd!: ElementRef;

  // ── Chat state ────────────────────────────────────────────────────────────
  messages: TchatMessage[] = [];
  userInput = '';
  isAiTyping = false;
  conversationDone = false;
  documentsCreated: string[] = [];
  activeTab: 'chat' | 'log' | 'history' = 'chat';
  cliLog = '';
  turnCount = 0;
  totalTokens = 0;

  // ── Zone selection ────────────────────────────────────────────────────────
  zoneSelectionMode = false;
  activeZone: ZoneSelection | null = null;
  zoneInstruction = '';
  zoneToolbarPos = { top: 0, left: 0 };

  // ── Variants ──────────────────────────────────────────────────────────────
  variantsMode = false;
  variants: string[] = [];

  // ── Sessions history ──────────────────────────────────────────────────────
  sessions: TchatSession[] = [];
  private readonly sessionStorageKey = 'tchat-ia-sessions';
  private _sessionId = this.uid();

  // ── Form answers ──────────────────────────────────────────────────────────
  private formAnswers: Array<{ formTitle: string; values: Record<string, any> }> = [];

  // ── Misc ──────────────────────────────────────────────────────────────────
  copiedMsgId: string | null = null;
  private shouldScrollToBottom = false;
  private initialized = false;

  constructor(
    private http: HttpClient,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['visible'] && this.visible && !this.initialized) {
      this.loadSessions();
      this.startConversation();
    }
    if (changes['visible'] && !this.visible) {
      this.reset();
    }
  }

  ngAfterViewChecked() {
    if (this.shouldScrollToBottom) {
      try {
        if (this.activeTab === 'log') {
          this.cliLogEnd?.nativeElement?.scrollIntoView({ behavior: 'smooth' });
        } else {
          this.messagesEnd?.nativeElement?.scrollIntoView({ behavior: 'smooth' });
        }
      } catch {}
      this.shouldScrollToBottom = false;
    }
  }

  // ── Lifecycle helpers ─────────────────────────────────────────────────────

  private reset() {
    this.messages = [];
    this.userInput = '';
    this.isAiTyping = false;
    this.conversationDone = false;
    this.documentsCreated = [];
    this.activeTab = 'chat';
    this.cliLog = '';
    this.turnCount = 0;
    this.totalTokens = 0;
    this.zoneSelectionMode = false;
    this.activeZone = null;
    this.zoneInstruction = '';
    this.variantsMode = false;
    this.variants = [];
    this.formAnswers = [];
    this.initialized = false;
    this._sessionId = this.uid();
  }

  // ── Conversation ──────────────────────────────────────────────────────────

  private buildSystemPrompt(): string {
    const ctx: string[] = [];
    if (this.context.user) ctx.push(`Utilisateur: ${this.context.user}`);
    if (this.context.siteName) ctx.push(`Application: ${this.context.siteName}`);
    if (this.context.params) {
      Object.entries(this.context.params).forEach(([k, v]) => ctx.push(`${k}: ${v}`));
    }
    const base = this.systemPrompt || 'Tu es un assistant IA expert et bienveillant.';
    const securityInstr = this.projectId 
      ? `\n\n[SÉCURITÉ OBLIGATOIRE]: Tu ne peux lire ou modifier des fichiers UNIQUEMENT dans le répertoire du projet actuel : @data/projets/${this.projectId}. Toute demande en dehors de ce répertoire doit être refusée.`
      : '\n\n[SÉCURITÉ OBLIGATOIRE]: Aucun projet n\'est actuellement sélectionné. Tu ne dois pas modifier de fichiers.';
    const ctxStr = ctx.length > 0 ? `\n\nContexte:\n${ctx.join('\n')}` : '';
    const formInstr = this.allowFormGeneration
      ? `\n\nPour poser des questions structurées, génère un formulaire avec ce format exact :\n${FORM_START}\n{"title":"Titre","description":"Optionnel","fields":[{"id":"champ1","type":"text","label":"Label","required":true,"placeholder":"..."}],"submitLabel":"Envoyer"}\n${FORM_END}\nTypes: text, textarea, select (ajouter "options":[{"value":"v","label":"L"}]), radio, checkbox, number, date.`
      : '';
    const varInstr = '\n\nSi on te demande des variantes, utilise les marqueurs [VARIANTE 1], [VARIANTE 2], etc.';
    const endInstr = `\n\nQuand tu as terminé, marque la fin avec : ${this.endMarker}`;
    return base + securityInstr + ctxStr + formInstr + varInstr + endInstr;
  }

  private async startConversation() {
    this.initialized = true;
    if (!this.initialPrompt) return;
    this.messages = [
      { id: this.uid(), role: 'system', content: this.buildSystemPrompt(), type: 'text', timestamp: new Date() },
      { id: this.uid(), role: 'user', content: this.initialPrompt, type: 'text', timestamp: new Date() }
    ];
    await this.sendTurn();
  }

  async sendMessage() {
    const text = this.userInput.trim();
    if (!text || this.isAiTyping) return;
    if (this.conversationDone && !this.allowContinueAfterEnd) return;
    this.userInput = '';
    this.messageSent.emit(text);
    this.messages.push({ id: this.uid(), role: 'user', content: text, type: 'text', timestamp: new Date() });
    this.shouldScrollToBottom = true;
    await this.sendTurn();
  }

  sendQuickPrompt(prompt: string) {
    if (this.isAiTyping) return;
    this.userInput = prompt;
    this.sendMessage();
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  private async sendTurn() {
    this.turnCount++;
    const turnNum = this.turnCount;
    const turnStart = Date.now();
    this.isAiTyping = true;
    this.variantsMode = false;
    this.variants = [];

    // --- Sécurité contre les combinaisons fournisseur/modèle impossibles ---
    if (this.provider === 'gemini') {
      if (!this.model.startsWith('gemini-')) this.model = 'gemini-3-flash-preview';
    } else if (this.provider === 'claude') {
      if (!this.model.startsWith('claude-')) this.model = 'claude-sonnet-4-6';
    }
    // ----------------------------------------------------------------------

    const aiMsg: TchatMessage = {
      id: this.uid(), role: 'ai', content: '', type: 'text', streaming: true, timestamp: new Date()
    };
    this.messages.push(aiMsg);
    this.shouldScrollToBottom = true;

    const sep = '─'.repeat(60);
    this.appendLog(`\n${sep}\nTOUR ${turnNum} — ${new Date().toLocaleTimeString('fr-FR')} — ${this.provider}/${this.model}\n${sep}`);

    const historyToSend = this.messages.slice(0, -1);
    let rawOutput = '';
    let status: 'success' | 'error' = 'success';

    try {
      const response = await fetch(`${this.executorUrl}/execute-chat-turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stepId: 'tchat-ia',
          conversationHistory: historyToSend,
          provider: this.provider,
          model: this.model,
          projectId: this.projectId
        })
      });

      this.appendLog(`[HTTP] ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const err = await response.text();
        status = 'error';
        aiMsg.content = `❌ Erreur serveur ${response.status}\n\n${err.slice(0, 300)}`;
        aiMsg.streaming = false;
        this.isAiTyping = false;
        return;
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of decoder.decode(value, { stream: true }).split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6);
            try {
              const data = JSON.parse(raw);
              if (data.type === 'stdout') {
                const txt = data.message || '';
                rawOutput += txt;
                aiMsg.content += txt;
                this.shouldScrollToBottom = true;
              } else if (data.type === 'tokens') {
                this.totalTokens += data.tokensUsed || 0;
                aiMsg.tokensUsed = (aiMsg.tokensUsed || 0) + (data.tokensUsed || 0);
                this.appendLog(`[TOKENS] +${data.tokensUsed} | total session: ${this.totalTokens}`);
              } else if (data.type === 'stderr' && data.message && !data.message.includes('heartbeat')) {
                rawOutput += data.message;
                aiMsg.content += data.message;
              } else if (['start', 'info', 'heartbeat', 'end'].includes(data.type)) {
                this.appendLog(`[${data.type.toUpperCase()}] ${data.message || ''}`);
              } else if (data.type === 'error') {
                this.appendLog(`[ERREUR] ${data.message || ''}`);
                status = 'error';
              }
            } catch {
              if (raw && raw !== '[DONE]') {
                rawOutput += raw;
                aiMsg.content += raw;
                this.shouldScrollToBottom = true;
              }
            }
          }
        }
      }
    } catch (err: any) {
      status = 'error';
      aiMsg.content += `\n[Erreur réseau: ${err.message}]`;
      this.appendLog(`[ERREUR RÉSEAU] ${err.message}`);
    } finally {
      aiMsg.streaming = false;
      this.isAiTyping = false;
      const durationMs = Date.now() - turnStart;
      this.appendLog(`[DURÉE] ${durationMs}ms\n--- Réponse ---\n${rawOutput}\n---`);
      this.finalizeMessage(aiMsg);
      this.aiResponse.emit({ ...aiMsg });
      if (this.apiUrl) this.saveLog(turnNum, rawOutput, status, durationMs);
      this.shouldScrollToBottom = true;
      this.autoSaveSession();
    }
  }

  private finalizeMessage(msg: TchatMessage) {
    let content = msg.content;

    // 1. Fin de conversation
    if (content.includes(this.endMarker)) {
      content = content.replace(this.endMarker, '').trim();
      this.conversationDone = true;
      this.appendLog('[FIN] Marqueur détecté.');
    }

    // 2. Documents créés
    DOC_MARKER_RE.lastIndex = 0;
    let match;
    while ((match = DOC_MARKER_RE.exec(content)) !== null) {
      const doc = match[1].trim();
      if (!this.documentsCreated.includes(doc)) {
        this.documentsCreated.push(doc);
        this.appendLog(`[DOC] ${doc}`);
      }
    }

    // 3. Formulaire IA
    if (this.allowFormGeneration) {
      const fStart = content.indexOf(FORM_START);
      const fEnd = content.indexOf(FORM_END);
      if (fStart !== -1 && fEnd > fStart) {
        const jsonStr = content.slice(fStart + FORM_START.length, fEnd).trim();
        const before = content.slice(0, fStart).trim();
        const after = content.slice(fEnd + FORM_END.length).trim();
        try {
          const form = JSON.parse(jsonStr) as TchatForm;
          form.submitted = false;
          form.values = {};
          form.fields.forEach(f => {
            form.values![f.id] = f.defaultValue !== undefined ? f.defaultValue : (f.type === 'checkbox' ? false : '');
          });
          msg.parsedForm = form;
          msg.type = 'form';
          content = (before + (after ? '\n\n' + after : '')).trim();
        } catch (e) {
          this.appendLog(`[FORM] Erreur parsing JSON: ${e}`);
        }
      }
    }

    // 4. Variantes
    const varMatches = [...content.matchAll(/\[VARIANTE\s*\d+\]/gi)];
    if (varMatches.length >= 2) {
      const parsed: string[] = [];
      for (let i = 0; i < varMatches.length; i++) {
        const start = (varMatches[i].index ?? 0) + varMatches[i][0].length;
        const end = i + 1 < varMatches.length ? (varMatches[i + 1].index ?? content.length) : content.length;
        const txt = content.slice(start, end).trim();
        if (txt) parsed.push(txt);
      }
      if (parsed.length >= 2) {
        this.variants = parsed;
        this.variantsMode = true;
        content = content.slice(0, varMatches[0].index ?? 0).trim();
      }
    }

    msg.content = content;
  }

  // ── Forms ─────────────────────────────────────────────────────────────────

  submitForm(msg: TchatMessage) {
    if (!msg.parsedForm) return;
    msg.parsedForm.submitted = true;
    const values = { ...msg.parsedForm.values };
    this.formAnswers.push({ formTitle: msg.parsedForm.title, values });
    this.formSubmitted.emit({ formTitle: msg.parsedForm.title, values });
    const lines = Object.entries(values).map(([k, v]) => {
      const field = msg.parsedForm!.fields.find(f => f.id === k);
      return `${field?.label || k}: ${v}`;
    });
    this.userInput = `Réponses :\n${lines.join('\n')}`;
    this.sendMessage();
  }

  openFormTemplate(form: TchatForm) {
    const copy: TchatForm = { ...form, submitted: false, values: {} };
    form.fields.forEach(f => { copy.values![f.id] = f.defaultValue !== undefined ? f.defaultValue : ''; });
    this.messages.push({
      id: this.uid(), role: 'ai', content: '', type: 'form',
      parsedForm: copy, timestamp: new Date(), streaming: false
    });
    this.shouldScrollToBottom = true;
  }

  // ── Zone selection ────────────────────────────────────────────────────────

  toggleZoneMode() {
    this.zoneSelectionMode = !this.zoneSelectionMode;
    this.activeZone = null;
    this.zoneInstruction = '';
  }

  onMessageMouseUp(event: MouseEvent, msgId: string) {
    if (!this.zoneSelectionMode) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const selectedText = sel.toString().trim();
    if (!selectedText) return;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    this.activeZone = {
      messageId: msgId,
      selectedText,
      start: range.startOffset,
      end: range.endOffset
    };
    this.zoneToolbarPos = {
      top: rect.bottom + window.scrollY + 8,
      left: Math.max(8, rect.left + window.scrollX)
    };
    this.cdr.detectChanges();
  }

  applyZoneAction(action: 'modify' | 'delete' | 'expand') {
    if (!this.activeZone) return;
    this.activeZone = { ...this.activeZone, action };
    this.zoneModificationRequested.emit({ ...this.activeZone });
    if (action === 'delete') {
      this.userInput = `Supprime la partie suivante de ta dernière réponse :\n"${this.activeZone.selectedText}"`;
      this.closeZoneToolbar();
      this.sendMessage();
    }
  }

  submitZoneInstruction() {
    if (!this.activeZone || !this.zoneInstruction.trim()) return;
    const verb = this.activeZone.action === 'expand' ? 'Développe' : 'Modifie';
    this.userInput = `${verb} la partie suivante de ta réponse précédente :\n"${this.activeZone.selectedText}"\n\nInstruction : ${this.zoneInstruction.trim()}`;
    this.closeZoneToolbar();
    this.sendMessage();
  }

  closeZoneToolbar() {
    this.activeZone = null;
    this.zoneInstruction = '';
    window.getSelection()?.removeAllRanges();
  }

  // ── Variantes ─────────────────────────────────────────────────────────────

  requestVariants(count = 3) {
    this.userInput = `Génère ${count} variantes différentes pour ta dernière réponse, en utilisant les marqueurs [VARIANTE 1], [VARIANTE 2], [VARIANTE 3].`;
    this.sendMessage();
  }

  selectVariant(variant: string) {
    this.variantsMode = false;
    this.variants = [];
    this.messages.push({
      id: this.uid(), role: 'ai', type: 'text',
      content: `Variante sélectionnée :\n\n${variant}`,
      timestamp: new Date(), streaming: false
    });
    this.shouldScrollToBottom = true;
    this.autoSaveSession();
  }

  // ── Feedback ──────────────────────────────────────────────────────────────

  setFeedback(msg: TchatMessage, feedback: 'up' | 'down') {
    msg.feedback = msg.feedback === feedback ? null : feedback;
  }

  // ── Sessions ──────────────────────────────────────────────────────────────

  loadSessions() {
    try {
      const raw = localStorage.getItem(this.sessionStorageKey);
      if (raw) this.sessions = JSON.parse(raw);
    } catch { this.sessions = []; }
  }

  private autoSaveSession() {
    const nonSystem = this.messages.filter(m => m.role !== 'system');
    if (nonSystem.length < 2) return;
    const firstUser = nonSystem.find(m => m.role === 'user');
    const title = firstUser?.content.slice(0, 60) || 'Session';
    const session: TchatSession = {
      id: this._sessionId,
      date: new Date().toISOString(),
      title,
      messages: this.messages,
      documentsCreated: this.documentsCreated
    };
    const idx = this.sessions.findIndex(s => s.id === this._sessionId);
    if (idx > -1) {
      this.sessions[idx] = session;
    } else {
      this.sessions.unshift(session);
      if (this.sessions.length > 20) this.sessions.pop();
    }
    try {
      localStorage.setItem(this.sessionStorageKey, JSON.stringify(this.sessions));
    } catch { /* quota */ }
  }

  restoreSession(session: TchatSession) {
    this.messages = session.messages;
    this.documentsCreated = session.documentsCreated;
    this._sessionId = session.id;
    this.activeTab = 'chat';
    this.shouldScrollToBottom = true;
  }

  deleteSession(sessionId: string, event: Event) {
    event.stopPropagation();
    this.sessions = this.sessions.filter(s => s.id !== sessionId);
    try {
      localStorage.setItem(this.sessionStorageKey, JSON.stringify(this.sessions));
    } catch { /* quota */ }
  }

  newConversation() {
    this.reset();
    this._sessionId = this.uid();
    this.initialized = true;
    this.activeTab = 'chat';
  }

  // ── Export ────────────────────────────────────────────────────────────────

  exportAsMarkdown() {
    const lines: string[] = [
      `# Tchat IA — ${this.title}`,
      `Date: ${new Date().toLocaleString('fr-FR')} | Modèle: ${this.provider}/${this.model}`,
      ''
    ];
    for (const msg of this.messages) {
      if (msg.role === 'system') continue;
      lines.push(`## ${msg.role === 'ai' ? 'IA' : 'Utilisateur'} — ${msg.timestamp.toLocaleTimeString?.('fr-FR') ?? ''}`);
      lines.push(msg.content || '');
      if (msg.parsedForm?.submitted) {
        lines.push(`\n**Formulaire :** ${msg.parsedForm.title}`);
        Object.entries(msg.parsedForm.values || {}).forEach(([k, v]) => {
          const f = msg.parsedForm!.fields.find(x => x.id === k);
          lines.push(`- ${f?.label || k}: ${v}`);
        });
      }
      lines.push('');
    }
    this.download('tchat-ia-export.md', lines.join('\n'), 'text/markdown');
  }

  exportAsJson() {
    const data: TchatResult = {
      messages: this.messages.filter(m => m.role !== 'system'),
      conversation: this.messages
        .filter(m => m.role !== 'system')
        .map(m => `[${m.role === 'ai' ? 'IA' : 'USER'}] ${m.content}`)
        .join('\n\n'),
      formAnswers: this.formAnswers,
      documentsCreated: this.documentsCreated
    };
    this.download('tchat-ia-export.json', JSON.stringify(data, null, 2), 'application/json');
  }

  private download(name: string, content: string, mime: string) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── Copy ──────────────────────────────────────────────────────────────────

  copyMessage(msg: TchatMessage) {
    navigator.clipboard.writeText(msg.content).then(() => {
      this.copiedMsgId = msg.id;
      setTimeout(() => { this.copiedMsgId = null; this.cdr.detectChanges(); }, 2000);
    }).catch(() => {});
  }

  // ── Markdown ──────────────────────────────────────────────────────────────

  renderMarkdown(content: string): SafeHtml {
    if (!this.allowMarkdown || !content) {
      return this.sanitizer.bypassSecurityTrustHtml(
        `<span class="whitespace-pre-wrap break-words">${this.escapeHtml(content)}</span>`
      );
    }
    let html = this.escapeHtml(content)
      // Code blocks (before inline code)
      .replace(/```[\w]*\n?([\s\S]*?)```/g,
        '<pre class="bg-black/30 rounded-lg p-3 text-xs overflow-x-auto my-2 font-mono"><code>$1</code></pre>')
      // Inline code
      .replace(/`([^`\n]+)`/g,
        '<code class="bg-black/20 px-1.5 py-0.5 rounded text-xs font-mono text-cyan-300">$1</code>')
      // Bold
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong class="text-white">$1</strong>')
      // Italic
      .replace(/\*([^*\n]+)\*/g, '<em class="text-white/80">$1</em>')
      // Headings
      .replace(/^### (.+)$/gm, '<h3 class="font-bold text-white text-sm mt-3 mb-1">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="font-bold text-white text-base mt-4 mb-1.5">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="font-bold text-white text-lg mt-4 mb-2">$1</h1>')
      // Horizontal rule
      .replace(/^---$/gm, '<hr class="border-white/10 my-3">')
      // Unordered list
      .replace(/^[*\-] (.+)$/gm, '<li class="ml-4 list-disc text-white/90">$1</li>')
      // Ordered list
      .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-white/90">$1</li>')
      // Double newline → paragraphs
      .replace(/\n\n/g, '</p><p class="mb-2 text-white/90">')
      // Single newline → br
      .replace(/\n/g, '<br>');
    return this.sanitizer.bypassSecurityTrustHtml(
      `<p class="mb-2 text-white/90 leading-relaxed">${html}</p>`
    );
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  get visibleMessages(): TchatMessage[] {
    return this.messages.filter(m => m.role !== 'system');
  }

  get lastAiMessage(): TchatMessage | null {
    const msgs = this.visibleMessages;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'ai') return msgs[i];
    }
    return null;
  }

  private appendLog(text: string) { this.cliLog += text + '\n'; }

  private saveLog(turnNum: number, rawOutput: string, status: 'success' | 'error', durationMs: number) {
    this.http.post(`${this.apiUrl}/api/ai-logs`, {
      page: 'tchat-ia',
      section: this.title,
      provider: this.provider,
      model: this.model,
      prompt: `TOUR ${turnNum}`,
      response: rawOutput,
      status,
      durationMs
    }).subscribe({ error: () => {} });
  }

  private uid(): string {
    return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  }

  openDoc() {
    window.open('/tchat-ia-doc', '_blank');
  }

  close() {
    this.closed.emit({
      messages: this.visibleMessages,
      conversation: this.visibleMessages.map(m => `[${m.role === 'ai' ? 'IA' : 'USER'}] ${m.content}`).join('\n\n'),
      formAnswers: this.formAnswers,
      documentsCreated: this.documentsCreated
    });
  }
}

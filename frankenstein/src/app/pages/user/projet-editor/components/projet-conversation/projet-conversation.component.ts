import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, signal, inject, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConversationService, Message } from '../../../../../core/services/conversation.service';
import { WoActionHistoryService } from '../../../../../core/services/wo-action-history.service';

@Component({
  selector: 'app-projet-conversation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './projet-conversation.component.html',
  host: { class: 'flex flex-col min-h-0 flex-1 overflow-hidden' },
})
export class ProjetConversationComponent implements OnChanges, AfterViewChecked {
  @Input() sectionId: string | null = null;
  @Output() conversationAdded = new EventEmitter<string>();
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;
  
  private convService = inject(ConversationService);
  private woHistory = inject(WoActionHistoryService);

  @Input() projectId: string | null = null;

  inputMessage = '';
  expanded = signal(true);
  loading = signal(false);
  private shouldScroll = false;

  messages: Message[] = [];

  ngOnChanges(changes: SimpleChanges) {
    if (changes['sectionId']) {
      console.log('ProjetConversation: sectionId changed to', this.sectionId);
      if (this.sectionId) {
        this.loadHistory();
      } else {
        this.messages = [];
      }
    }
  }

  ngAfterViewChecked() {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  private scrollToBottom(): void {
    try {
      this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
    } catch (err) {}
  }

  loadHistory() {
    if (!this.sectionId) return;
    console.log('ProjetConversation: Loading history for', this.sectionId);
    this.loading.set(true);
    this.convService.getHistory(this.sectionId).subscribe({
      next: (data) => {
        console.log('ProjetConversation: History loaded', data);
        this.messages = data.messages || [];
        this.loading.set(false);
        this.shouldScroll = true;
      },
      error: (err) => {
        console.error('ProjetConversation: Load history error', err);
        this.loading.set(false);
      }
    });
  }

  send() {
    console.log('ProjetConversation: send() called. inputMessage=', this.inputMessage, 'sectionId=', this.sectionId);
    if (!this.inputMessage.trim() || !this.sectionId) {
      console.warn('ProjetConversation: Send aborted (empty message or no sectionId)');
      return;
    }
    
    const text = this.inputMessage;
    this.inputMessage = '';
    
    console.log('ProjetConversation: Calling convService.sendMessage...');
    this.convService.sendMessage(this.sectionId, text).subscribe({
      next: (msg) => {
        console.log('ProjetConversation: Message sent successfully', msg);
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
        }).catch(() => {});
      },
      error: (err) => {
        console.error('ProjetConversation: Send message error', err);
        this.inputMessage = text;
      }
    });
  }
}

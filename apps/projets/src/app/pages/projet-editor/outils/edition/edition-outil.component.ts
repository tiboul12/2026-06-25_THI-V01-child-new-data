import { Component, Input, Output, EventEmitter, ViewChild } from '@angular/core';
import { FileNode, MegaOutilInstance } from '@worganic/portail-core/data-access';
import {
  ProjetEditorZoneComponent,
  FileSaveEvent,
  SectionInfo,
  DragDropEvent
} from '../../components/projet-editor-zone/projet-editor-zone.component';

@Component({
  selector: 'app-edition-outil',
  standalone: true,
  imports: [ProjetEditorZoneComponent],
  template: `
    <app-projet-editor-zone
      [files]="files"
      [restoreToken]="restoreToken"
      [scrollToNodeId]="scrollToNodeId"
      [saveStatus]="saveStatus"
      [projectName]="projectName"
      [activeNodeId]="activeNodeId"
      [highlightNodeId]="highlightNodeId"
      [commentCounts]="commentCounts"
      [backupType]="backupType"
      [ftpSyncGlobalStatus]="ftpSyncGlobalStatus"
      [ftpSyncProgress]="ftpSyncProgress"
      [nodeSyncStatus]="nodeSyncStatus"
      [hasFtpBackup]="hasFtpBackup"
      [megaOutilInstances]="megaOutilInstances"
      [activeMegaOutilId]="activeMegaOutilId"
      [activeOutilId]="activeOutilId"
      [showTrelloList]="showTrelloList"
      [showMockupList]="showMockupList"
      (megaOutilSelect)="megaOutilSelect.emit($event)"
      (megaOutilCreated)="megaOutilCreated.emit($event)"
      (megaOutilDeleted)="megaOutilDeleted.emit($event)"
      (closeTrelloList)="closeTrelloList.emit()"
      (openTrelloList)="openTrelloList.emit()"
      (trelloNavigate)="trelloNavigate.emit($event)"
      (closeMockupList)="closeMockupList.emit()"
      (mockupNavigate)="mockupNavigate.emit($event)"
      (openMockupDiagram)="openMockupDiagram.emit()"
      (fileSave)="fileSave.emit($event)"
      (sectionsChange)="sectionsChange.emit($event)"
      (nodeActive)="nodeActive.emit($event)"
      (dragDrop)="dragDrop.emit($event)"
      (dirtyChange)="dirtyChange.emit($event)"
      (saveStarting)="saveStarting.emit()"
      (commentRequest)="commentRequest.emit($event)"
      (refresh)="refresh.emit()" />
  `,
  host: { class: 'flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden' }
})
export class EditionOutilComponent {
  @ViewChild(ProjetEditorZoneComponent) private innerZone?: ProjetEditorZoneComponent;

  @Input() files: FileNode[] = [];
  @Input() restoreToken = 0;
  @Input() scrollToNodeId: string | null = null;
  @Input() saveStatus: 'idle' | 'dirty' | 'saving' | 'saved' | 'error' = 'idle';
  @Input() projectName = '';
  @Input() activeNodeId: string | null = null;
  @Input() highlightNodeId: string | null = null;
  @Input() backupType: string | null = null;
  @Input() ftpSyncGlobalStatus: 'idle' | 'syncing' | 'done' | 'error' = 'idle';
  @Input() ftpSyncProgress: { checked: number; total: number } = { checked: 0, total: 0 };
  @Input() nodeSyncStatus: Map<string, any> = new Map();
  @Input() hasFtpBackup = false;
  @Input() commentCounts: Record<string, number> = {};
  @Input() megaOutilInstances: MegaOutilInstance[] = [];
  @Input() activeMegaOutilId: string | null = null;
  @Input() activeOutilId: string | null = null;
  @Input() showTrelloList = false;
  @Input() showMockupList = false;

  @Output() megaOutilSelect = new EventEmitter<MegaOutilInstance>();
  @Output() megaOutilCreated = new EventEmitter<MegaOutilInstance>();
  @Output() megaOutilDeleted = new EventEmitter<string>();
  @Output() closeTrelloList = new EventEmitter<void>();
  @Output() openTrelloList = new EventEmitter<void>();
  @Output() trelloNavigate = new EventEmitter<string>();
  @Output() closeMockupList = new EventEmitter<void>();
  @Output() mockupNavigate = new EventEmitter<string>();
  @Output() openMockupDiagram = new EventEmitter<void>();
  @Output() fileSave = new EventEmitter<FileSaveEvent>();
  @Output() sectionsChange = new EventEmitter<SectionInfo[]>();
  @Output() nodeActive = new EventEmitter<string>();
  @Output() refresh = new EventEmitter<void>();
  @Output() dragDrop = new EventEmitter<DragDropEvent>();
  @Output() dirtyChange = new EventEmitter<boolean>();
  @Output() saveStarting = new EventEmitter<void>();
  @Output() commentRequest = new EventEmitter<{ folderId: string; folderName: string }>();

  appendSection(folderName: string, level = 1): void {
    this.innerZone?.appendSection(folderName, level);
  }

  insertSectionInParent(parentName: string, parentDepth: number, sectionName: string): void {
    this.innerZone?.insertSectionInParent(parentName, parentDepth, sectionName);
  }

  flushContentModifications(filterSectionId?: string): void {
    this.innerZone?.flushContentModifications(filterSectionId);
  }

  changeHeadingLevel(folderId: string, delta: number): void {
    this.innerZone?.changeHeadingLevel(folderId, delta);
  }

  mergeTitleIntoPrevious(folderId: string): void {
    this.innerZone?.mergeTitleIntoPrevious(folderId);
  }
}

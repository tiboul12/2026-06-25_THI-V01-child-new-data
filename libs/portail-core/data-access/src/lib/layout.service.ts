import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LayoutService {
  /** true = header en mode étendu (MAJ disponible + non scrollé) */
  headerExpanded = signal(false);
  /** true = mode éditeur full-screen (masque le header Frankenstein global) */
  editorMode = signal(false);
}

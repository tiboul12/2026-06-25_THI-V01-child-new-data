export type MegaOutilType = 'trello' | 'mockup';

export interface MegaOutilInstance {
  id: string;
  type: MegaOutilType;
  name: string;
  projectId: string;
  outilId?: string;
  folderId?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  thumbnailData?: string;
}

export interface MockupConnection {
  id: string;
  projectName: string;
  fromInstanceId: string;
  toInstanceId: string;
  label?: string;
  createdAt: string;
}

export type TrelloStatus   = 'todo' | 'in-progress' | 'done' | 'blocked';
export type TrelloPriority = 'low'  | 'medium'      | 'high' | 'critical';

export interface TrelloCard {
  id: string;
  instanceId: string;
  title: string;
  description?: string;
  status: TrelloStatus;
  priority: TrelloPriority;
  orderIndex: number;
  creatorId?: string;
  creatorName?: string;
  createdAt: string;
  updatedAt: string;
}

export const TRELLO_STATUS_LABELS: Record<TrelloStatus, string> = {
  'todo':        'À faire',
  'in-progress': 'En cours',
  'done':        'Terminé',
  'blocked':     'Bloqué',
};

export const TRELLO_PRIORITY_LABELS: Record<TrelloPriority, string> = {
  'low':      'Faible',
  'medium':   'Normale',
  'high':     'Haute',
  'critical': 'Critique',
};

export const TRELLO_PRIORITY_COLORS: Record<TrelloPriority, string> = {
  'low':      'bg-gray-500/20 text-gray-400',
  'medium':   'bg-yellow-500/20 text-yellow-400',
  'high':     'bg-orange-500/20 text-orange-400',
  'critical': 'bg-red-500/20 text-red-400',
};

// ── Mockup ─────────────────────────────────────────────────────────────────────

export type MockupElementType =
  | 'button' | 'input' | 'textarea' | 'select'
  | 'checkbox' | 'radio' | 'text' | 'heading' | 'label' | 'link'
  | 'image' | 'card' | 'navbar' | 'container' | 'divider' | 'note';

export interface MockupElement {
  id: string;
  instanceId: string;
  type: MockupElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  createdAt: string;
  updatedAt: string;
}

export interface MockupComment {
  id: string;
  instanceId: string;
  elementId: string;
  text: string;
  authorId?: string;
  authorName?: string;
  createdAt: string;
}

export const MOCKUP_ELEMENT_LABELS: Record<MockupElementType, string> = {
  button:    'Bouton',
  input:     'Champ texte',
  textarea:  'Zone texte',
  select:    'Liste déroulante',
  checkbox:  'Case à cocher',
  radio:     'Bouton radio',
  text:      'Texte',
  heading:   'Titre',
  label:     'Label',
  link:      'Lien',
  image:     'Image',
  card:      'Carte',
  navbar:    'Barre nav',
  container: 'Conteneur',
  divider:   'Séparateur',
  note:      'Note',
};

export const MOCKUP_ELEMENT_DEFAULTS: Record<MockupElementType, { w: number; h: number; label: string }> = {
  button:    { w: 120, h: 36,  label: 'Bouton' },
  input:     { w: 200, h: 36,  label: 'Placeholder...' },
  textarea:  { w: 200, h: 80,  label: 'Texte...' },
  select:    { w: 160, h: 36,  label: 'Choisir...' },
  checkbox:  { w: 140, h: 24,  label: 'Option' },
  radio:     { w: 140, h: 24,  label: 'Option' },
  text:      { w: 200, h: 20,  label: 'Paragraphe' },
  heading:   { w: 280, h: 32,  label: 'Titre de section' },
  label:     { w: 120, h: 16,  label: 'Étiquette' },
  link:      { w: 120, h: 20,  label: 'Lien' },
  image:     { w: 200, h: 150, label: 'Image' },
  card:      { w: 240, h: 160, label: 'Carte' },
  navbar:    { w: 600, h: 50,  label: 'Logo' },
  container: { w: 300, h: 200, label: '' },
  divider:   { w: 300, h: 12,  label: '' },
  note:      { w: 160, h: 60,  label: 'Note' },
};

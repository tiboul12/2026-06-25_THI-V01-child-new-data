export type MegaOutilType = 'trello';

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

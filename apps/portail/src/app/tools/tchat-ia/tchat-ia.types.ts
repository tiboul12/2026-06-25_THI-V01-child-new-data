export interface TchatMessage {
  id: string;
  role: 'system' | 'ai' | 'user';
  content: string;
  streaming?: boolean;
  type: 'text' | 'form' | 'document';
  parsedForm?: TchatForm;
  timestamp: Date;
  tokensUsed?: number;
  feedback?: 'up' | 'down' | null;
}

export interface TchatForm {
  title: string;
  description?: string;
  fields: TchatFormField[];
  submitLabel?: string;
  submitted?: boolean;
  values?: Record<string, any>;
}

export interface TchatFormField {
  id: string;
  type: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'number' | 'date';
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  defaultValue?: any;
}

export interface ZoneSelection {
  messageId: string;
  selectedText: string;
  start: number;
  end: number;
  action?: 'modify' | 'delete' | 'expand';
}

export interface TchatContext {
  user?: string;
  siteName?: string;
  params?: Record<string, any>;
}

export interface TchatResult {
  messages: TchatMessage[];
  conversation: string;
  formAnswers: Array<{ formTitle: string; values: Record<string, any> }>;
  documentsCreated: string[];
}

export interface TchatSession {
  id: string;
  date: string;
  title: string;
  messages: TchatMessage[];
  documentsCreated: string[];
}

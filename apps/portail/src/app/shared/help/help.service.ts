import { Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface HelpEntry {
  id: number;
  title: string;
  text: string;
  page: string;
}

@Injectable({ providedIn: 'root' })
export class HelpService {
  isOpen = signal(false);
  loading = signal(false);
  helpData = signal<HelpEntry | null>(null);
  error = signal('');

  private cache = new Map<number, HelpEntry>();

  async fetchTitle(id: number): Promise<string> {
    if (this.cache.has(id)) return this.cache.get(id)!.title;
    try {
      const res = await fetch(`${environment.apiDataUrl}/api/help/${id}`);
      if (!res.ok) return '';
      const data: HelpEntry = await res.json();
      this.cache.set(id, data);
      return data.title;
    } catch {
      return '';
    }
  }

  async open(id: number) {
    this.isOpen.set(true);
    this.loading.set(true);
    this.helpData.set(null);
    this.error.set('');
    try {
      const res = await fetch(`${environment.apiDataUrl}/api/help/${id}`);
      if (!res.ok) throw new Error('Entrée introuvable');
      const data: HelpEntry = await res.json();
      this.cache.set(id, data);
      this.helpData.set(data);
    } catch (e: any) {
      this.error.set(e?.message || 'Erreur chargement');
    } finally {
      this.loading.set(false);
    }
  }

  close() {
    this.isOpen.set(false);
    this.helpData.set(null);
    this.error.set('');
  }
}

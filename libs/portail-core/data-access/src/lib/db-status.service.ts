import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { API_DATA_URL } from './tokens';

export type DbStatus = 'checking' | 'ok' | 'error';

@Injectable({ providedIn: 'root' })
export class DbStatusService {
  private apiUrl = inject(API_DATA_URL);
  status = signal<DbStatus>('checking');
  clientIp = signal<string>('');

  constructor(private http: HttpClient) {}

  async check(): Promise<void> {
    try {
      const res: any = await firstValueFrom(
        this.http.get(`${this.apiUrl}/api/health/db`).pipe(timeout(5000))
      );
      this.clientIp.set(res?.ip ?? '');
      this.status.set('ok');
    } catch (err: any) {
      // Tenter de récupérer l'IP depuis la réponse serveur (DB down, serveur OK)
      const ipFromServer = err?.error?.ip ?? '';
      if (ipFromServer) {
        this.clientIp.set(ipFromServer);
      } else {
        // Serveur inaccessible : fallback via API publique
        await this.fetchPublicIp();
      }
      this.status.set('error');
    }
  }

  private async fetchPublicIp(): Promise<void> {
    try {
      const res: any = await firstValueFrom(
        this.http.get('https://api.ipify.org?format=json').pipe(timeout(4000))
      );
      this.clientIp.set(res?.ip ?? '');
    } catch {
      this.clientIp.set('');
    }
  }
}

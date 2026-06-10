import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_DATA_URL } from './tokens';
import { AuthService } from './auth.service';
import { AgendaEvent } from './agenda-outil.models';

@Injectable({ providedIn: 'root' })
export class AgendaOutilService {
  private apiUrl = inject(API_DATA_URL);
  private auth = inject(AuthService);
  private http = inject(HttpClient);

  private h() { return this.auth.getAuthHeaders(); }
  private base(name: string) { return `${this.apiUrl}/api/file-projects/${name}/agenda`; }

  getEvents(projectName: string): Promise<AgendaEvent[]> {
    return firstValueFrom(
      this.http.get<AgendaEvent[]>(this.base(projectName), { headers: this.h() })
    );
  }

  createEvent(projectName: string, event: Omit<AgendaEvent, 'id'>): Promise<AgendaEvent> {
    return firstValueFrom(
      this.http.post<AgendaEvent>(this.base(projectName), event, { headers: this.h() })
    );
  }

  updateEvent(projectName: string, eventId: string, data: Partial<AgendaEvent>): Promise<AgendaEvent> {
    return firstValueFrom(
      this.http.patch<AgendaEvent>(`${this.base(projectName)}/${eventId}`, data, { headers: this.h() })
    );
  }

  deleteEvent(projectName: string, eventId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.base(projectName)}/${eventId}`, { headers: this.h() })
    );
  }
}

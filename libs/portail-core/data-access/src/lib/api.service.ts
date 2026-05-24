import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_DATA_URL, API_EXECUTOR_URL } from './tokens';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private apiUrl = inject(API_DATA_URL);
  private executorUrl = inject(API_EXECUTOR_URL);
  constructor(private http: HttpClient) {}

  // --- Config Keys ---
  getConfigKeys(): Observable<any> {
    return this.http.get(`${this.apiUrl}/api/config/keys`);
  }

  saveConfigKeys(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/api/config/keys`, data);
  }

  // --- File Operations ---
  readFile(file: string): Observable<{ content: string }> {
    return this.http.get<{ content: string }>(`${this.apiUrl}/read-file`, { params: { file } });
  }

  // --- AI Logs ---
  getAiLogs(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/api/ai-logs`);
  }

  clearAiLogs(): Observable<any> {
    return this.http.delete(`${this.apiUrl}/api/ai-logs`);
  }

  // --- History ---
  getHistory(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/api/history`);
  }

  // --- Tickets ---
  getTickets(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/api/tickets`);
  }

  createTicket(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/api/tickets`, data);
  }

  updateTicket(id: string, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/api/tickets/${id}`, data);
  }

  deleteTicket(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/api/tickets/${id}`);
  }

  // --- Screenshots ---
  uploadScreenshot(formData: FormData): Observable<{ filename: string }> {
    return this.http.post<{ filename: string }>(`${this.apiUrl}/api/tickets/screenshot`, formData);
  }

  // --- AI Model (executor local) ---
  changeModel(provider: string, model: string): Observable<any> {
    return this.http.post(`${this.executorUrl}/change-model`, { provider, model });
  }

  getModel(): Observable<any> {
    return this.http.get(`${this.executorUrl}/get-model`);
  }

  syncModel(): Observable<any> {
    return this.http.get(`${this.executorUrl}/sync-model`);
  }

  // --- Stop Execution ---
  stopExecution(stepId: string): Observable<any> {
    return this.http.post(`${this.executorUrl}/stop-execution`, { stepId });
  }

  // --- Health Check ---
  checkDbHealth(): Observable<{ status: string }> {
    return this.http.get<{ status: string }>(`${this.apiUrl}/api/health/db`);
  }
}

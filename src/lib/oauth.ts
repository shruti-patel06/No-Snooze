let cachedAccessToken: string | null = null;
let cachedCalendarEvents: any[] = [];

export function getAccessToken(): string | null {
  return cachedAccessToken;
}

export function setAccessToken(token: string | null): void {
  cachedAccessToken = token;
}

export function getCalendarEvents(): any[] {
  return cachedCalendarEvents;
}

export function setCalendarEvents(events: any[]): void {
  cachedCalendarEvents = events;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  streak: number;
  maxStreak: number;
  lastActiveDate?: string;
  createdAt: string;
}

export interface Subtask {
  id: string;
  title: string;
  durationMinutes: number;
  dayOffset: number; // relative to the day task was created or relative to today
  suggestedTimeOfDay: "morning" | "afternoon" | "evening";
  completed: boolean;
  scheduledTime?: string; // e.g. "2026-06-29 10:00"
}

export interface Task {
  id: string;
  goal: string;
  deadline: string; // ISO string or human-readable (e.g. "2026-06-30T18:00:00")
  status: "pending" | "completed" | "at_risk" | "failed";
  createdAt: string;
  escalationLevel: "none" | "early" | "close" | "critical";
  ignoreCount: number;
  subtasks: Subtask[];
}

export interface CheckIn {
  id: string;
  timestamp: string;
  type: "early" | "close" | "critical";
  blocker?: string;
  replanned?: boolean;
  geminiResponse?: string;
}

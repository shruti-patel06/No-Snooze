import React, { useState, useEffect, useRef } from "react";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  Music, 
  Volume2, 
  LogIn, 
  LogOut, 
  RefreshCw, 
  CalendarPlus, 
  Check, 
  Zap,
  CheckCircle,
  ExternalLink
} from "lucide-react";
import { Task, Subtask } from "../types";
import { signInWithPopup, GoogleAuthProvider, User } from "firebase/auth";
import { auth } from "../lib/firebase";
import { playSound, SOUND_PRESETS } from "../utils/soundEngine";
import { getSavedAudioConfig } from "./AudioSettings";
import NotificationFCMCenter from "./NotificationFCMCenter";
import { getAccessToken, setAccessToken as setGlobalAccessToken, setCalendarEvents as setGlobalCalendarEvents } from "../lib/oauth";

interface FocusCalendarHubProps {
  tasks: Task[];
  onToggleSubtask: (taskId: string, subtaskId: string) => Promise<void>;
  onUpdateTaskSubtasks?: (taskId: string, updatedSubtasks: Subtask[]) => Promise<void>;
  user: User | null;
  isSimulated: boolean;
}

// In-memory cache for the Google Access Token
let cachedAccessToken: string | null = null;

export default function FocusCalendarHub({
  tasks,
  onToggleSubtask,
  onUpdateTaskSubtasks,
  user,
  isSimulated,
}: FocusCalendarHubProps) {
  // ----------------------------------------------------
  // POMODORO TIMER STATES & CONFIG
  // ----------------------------------------------------
  const [timerMode, setTimerMode] = useState<"work" | "shortBreak" | "longBreak">("work");
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [soundPreset, setSoundPreset] = useState("gentle_chime");
  const [completedSessionsCount, setCompletedSessionsCount] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem("nosnooze_pomodoro_sessions");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Time config values in seconds
  const modeDurations = {
    work: 25 * 60,
    shortBreak: 5 * 60,
    longBreak: 15 * 60,
  };

  // Update seconds when timer mode changes
  useEffect(() => {
    setIsRunning(false);
    setSecondsLeft(modeDurations[timerMode]);
  }, [timerMode]);

  // Main tick loop
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            handleTimerComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, timerMode]);

  const handleTimerComplete = () => {
    setIsRunning(false);
    // Trigger audio alert using sound engine
    playSound(soundPreset);

    // Save completed session tally if in work mode
    if (timerMode === "work") {
      const targetId = selectedTaskId || "unassociated";
      const updated = {
        ...completedSessionsCount,
        [targetId]: (completedSessionsCount[targetId] || 0) + 1,
      };
      setCompletedSessionsCount(updated);
      localStorage.setItem("nosnooze_pomodoro_sessions", JSON.stringify(updated));
    }

    // Move to next logical mode
    if (timerMode === "work") {
      setTimerMode("shortBreak");
    } else {
      setTimerMode("work");
    }
  };

  const toggleTimer = () => {
    // Resume context if browser blocked it
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const dummyCtx = new AudioContextClass();
        dummyCtx.resume();
      }
    } catch (e) {
      console.warn("AudioContext unlock failed", e);
    }
    setIsRunning(!isRunning);
  };

  const resetTimer = () => {
    setIsRunning(false);
    setSecondsLeft(modeDurations[timerMode]);
  };

  // Format MM:SS
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${String(mins).padStart(2, "0")}:${String(remainingSecs).padStart(2, "0")}`;
  };

  const progressPercentage = ((modeDurations[timerMode] - secondsLeft) / modeDurations[timerMode]) * 100;

  // Selected task helpers
  const pendingTasks = tasks.filter((t) => t.status === "pending" || t.status === "at_risk");
  const activeTask = tasks.find((t) => t.id === selectedTaskId);

  // Set first pending task as default if none selected
  useEffect(() => {
    if (!selectedTaskId && pendingTasks.length > 0) {
      setSelectedTaskId(pendingTasks[0].id);
    }
  }, [pendingTasks, selectedTaskId]);


  // ----------------------------------------------------
  // GOOGLE CALENDAR SYNC STATES & LOGIC
  // ----------------------------------------------------
  const [accessToken, setAccessTokenState] = useState<string | null>(getAccessToken() || cachedAccessToken);
  const [calendarEvents, setCalendarEventsState] = useState<any[]>([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<Record<string, boolean>>({});

  const setAccessToken = (token: string | null) => {
    cachedAccessToken = token;
    setAccessTokenState(token);
    setGlobalAccessToken(token);
  };

  const setCalendarEvents = (events: any[]) => {
    setCalendarEventsState(events);
    setGlobalCalendarEvents(events);
  };

  useEffect(() => {
    // If global store has token but local state doesn't, sync them
    const globalToken = getAccessToken();
    if (globalToken && globalToken !== accessToken) {
      setAccessTokenState(globalToken);
    }
  }, []);

  const [syncedSubtaskIds, setSyncedSubtaskIds] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem("nosnooze_synced_calendar_events");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Handle Google OAuth and Calendar Access Token Fetching
  const handleConnectCalendar = async () => {
    setLoadingCalendar(true);
    setCalendarError(null);
    try {
      const provider = new GoogleAuthProvider();
      // Configure necessary Workspace API scopes as requested
      provider.addScope("https://www.googleapis.com/auth/calendar.events");
      provider.addScope("https://www.googleapis.com/auth/calendar");

      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      
      if (!credential?.accessToken) {
        throw new Error("Failed to extract Google Access Token from credentials.");
      }

      cachedAccessToken = credential.accessToken;
      setAccessToken(cachedAccessToken);
      
      // Instantly retrieve calendar schedules
      fetchCalendarEvents(cachedAccessToken);
    } catch (err: any) {
      console.error("Google Calendar connection error:", err);
      let errorMessage = err.message || "Failed to authenticate Google Workspace account.";
      
      // Handle cancelled-popup-request and other popup errors with clear user instructions
      if (err.code === "auth/cancelled-popup-request") {
        errorMessage = "The Google sign-in request was replaced or cancelled. Please wait a moment and click 'Connect Google Calendar' again.";
      } else if (err.code === "auth/popup-closed-by-user") {
        errorMessage = "The sign-in popup window was closed before authorization completed. Please leave the window open and complete Google sign-in.";
      } else if (err.code === "auth/popup-blocked") {
        errorMessage = "The sign-in popup was blocked by your browser's popup blocker. Please allow popups for this site, or open this application in a new tab to authenticate.";
      } else if (err.code === "auth/operation-not-allowed") {
        errorMessage = "Google Sign-In is not enabled/configured properly in the Firebase Console.";
      }
      
      setCalendarError(errorMessage);
    } finally {
      setLoadingCalendar(false);
    }
  };

  // Retrieve actual Google Calendar events
  const fetchCalendarEvents = async (token: string) => {
    setLoadingCalendar(true);
    setCalendarError(null);
    try {
      const now = new Date();
      const nextWeek = new Date();
      nextWeek.setDate(now.getDate() + 7);

      const timeMin = now.toISOString();
      const timeMax = nextWeek.toISOString();

      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=10`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired or invalid
          setAccessToken(null);
          cachedAccessToken = null;
          throw new Error("Authentication expired. Please reconnect Google Calendar.");
        }
        throw new Error("Failed to load Google Calendar events.");
      }

      const data = await response.json();
      setCalendarEvents(data.items || []);
    } catch (err: any) {
      console.error("Fetch calendar events failed:", err);
      setCalendarError(err.message || "Could not retrieve calendar items.");
    } finally {
      setLoadingCalendar(false);
    }
  };

  // Push individual subtask to Google Calendar
  const handlePushSubtaskToCalendar = async (task: Task, subtask: Subtask) => {
    if (!accessToken) return;

    // Check if subtask has scheduledTime
    if (!subtask.scheduledTime) {
      alert("This subtask does not have a scheduled date/time yet. Set a time slot before syncing.");
      return;
    }

    // MANDATORY confirmation dialog for Workspace API updates (Workspace Integration Guidelines)
    const formattedTime = new Date(subtask.scheduledTime).toLocaleString();
    const confirmed = window.confirm(
      `Would you like to sync and create an event in your Google Calendar?\n\nEvent: [NoSnooze] ${subtask.title}\nTime: ${formattedTime}\nGoal: ${task.goal}\nDuration: ${subtask.durationMinutes} minutes`
    );

    if (!confirmed) return;

    setIsSyncing((prev) => ({ ...prev, [subtask.id]: true }));

    try {
      // Calculate start and end dateTime
      const startTime = new Date(subtask.scheduledTime);
      const endTime = new Date(startTime.getTime() + subtask.durationMinutes * 60 * 1000);

      const eventPayload = {
        summary: `[NoSnooze] ${subtask.title}`,
        description: `Subtask committed under the goal: "${task.goal}"\nConfigured with accountability escalation guards.\nCreated automatically by NoSnooze Accountability Center.`,
        start: {
          dateTime: startTime.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: 15 },
            { method: "email", minutes: 30 },
          ],
        },
      };

      const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventPayload),
      });

      if (!response.ok) {
        throw new Error("Failed to write event to Google Calendar API.");
      }

      const createdEvent = await response.json();

      // Record successful sync with both ID and htmlLink
      const updatedSyncList = {
        ...syncedSubtaskIds,
        [subtask.id]: {
          id: createdEvent.id,
          htmlLink: createdEvent.htmlLink,
        },
      };
      setSyncedSubtaskIds(updatedSyncList);
      localStorage.setItem("nosnooze_synced_calendar_events", JSON.stringify(updatedSyncList));

      // Refresh event list to show the new addition
      fetchCalendarEvents(accessToken);
    } catch (err: any) {
      console.error("Create calendar event failed:", err);
      alert(`Sync failed: ${err.message || "An unknown error occurred."}`);
    } finally {
      setIsSyncing((prev) => ({ ...prev, [subtask.id]: false }));
    }
  };

  // Export all unsynced pending subtasks with scheduled times to Google Calendar
  const handleExportAllTasksToCalendar = async () => {
    if (!accessToken) return;

    // Filter subtasks that have scheduled times, are not completed, and are not yet synced
    const exportableList = tasks.flatMap((t) => 
      t.subtasks.map((st) => ({ task: t, subtask: st }))
    ).filter(({ subtask }) => {
      const syncState = syncedSubtaskIds[subtask.id];
      const isSynced = syncState && (typeof syncState === 'object' ? !!syncState.id : !!syncState);
      return !subtask.completed && subtask.scheduledTime && !isSynced;
    });

    if (exportableList.length === 0) {
      alert("No pending unsynced subtasks with scheduled times were found to export.");
      return;
    }

    const confirmed = window.confirm(
      `Found ${exportableList.length} unsynced pending subtasks with schedules.\n\n` +
      `Would you like to export all of them to your Google Calendar at once?`
    );

    if (!confirmed) return;

    setLoadingCalendar(true);
    let successCount = 0;
    const updatedSyncList = { ...syncedSubtaskIds };

    for (const { task, subtask } of exportableList) {
      setIsSyncing((prev) => ({ ...prev, [subtask.id]: true }));
      try {
        const startTime = new Date(subtask.scheduledTime);
        const endTime = new Date(startTime.getTime() + subtask.durationMinutes * 60 * 1000);

        const eventPayload = {
          summary: `[NoSnooze] ${subtask.title}`,
          description: `Subtask committed under the goal: "${task.goal}"\nConfigured with accountability escalation guards.\nCreated automatically by NoSnooze Accountability Center.`,
          start: {
            dateTime: startTime.toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          },
          end: {
            dateTime: endTime.toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          },
          reminders: {
            useDefault: false,
            overrides: [
              { method: "popup", minutes: 15 },
              { method: "email", minutes: 30 },
            ],
          },
        };

        const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(eventPayload),
        });

        if (response.ok) {
          const createdEvent = await response.json();
          updatedSyncList[subtask.id] = {
            id: createdEvent.id,
            htmlLink: createdEvent.htmlLink,
          };
          successCount++;
        }
      } catch (e) {
        console.error(`Failed to export subtask ${subtask.title}:`, e);
      } finally {
        setIsSyncing((prev) => ({ ...prev, [subtask.id]: false }));
      }
    }

    setSyncedSubtaskIds(updatedSyncList);
    localStorage.setItem("nosnooze_synced_calendar_events", JSON.stringify(updatedSyncList));
    setLoadingCalendar(false);

    // Refresh Google Calendar events list
    fetchCalendarEvents(accessToken);

    alert(`Successfully exported ${successCount} subtasks to your Google Calendar!`);
  };

  // Bidirectional Synchronization of schedules and deadlines
  const handleBidirectionalSync = async () => {
    if (!accessToken) return;
    setLoadingCalendar(true);
    setCalendarError(null);
    try {
      // 1. Fetch upcoming events (up to 50 events)
      const now = new Date();
      const nextWeek = new Date();
      nextWeek.setDate(now.getDate() + 14); // 2 weeks outlook

      const timeMin = now.toISOString();
      const timeMax = nextWeek.toISOString();
      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=50`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          setAccessToken(null);
          cachedAccessToken = null;
          throw new Error("Authentication expired. Please reconnect Google Calendar.");
        }
        throw new Error("Failed to pull Google Calendar events.");
      }

      const data = await response.json();
      const events: any[] = data.items || [];
      setCalendarEvents(events);

      let updatedCount = 0;
      let syncLinkCount = 0;
      const newSyncedList = { ...syncedSubtaskIds };

      // Helper to format date into 'YYYY-MM-DD HH:MM' local format
      const formatToAppTime = (dateObj: Date): string => {
        const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        const hh = String(dateObj.getHours()).padStart(2, '0');
        const min = String(dateObj.getMinutes()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
      };

      // 2. Map calendar events back to NoSnooze subtasks
      for (const task of tasks) {
        let taskSubtasksUpdated = false;
        const updatedSubtasks = task.subtasks.map((subtask) => {
          // Look for event matching either subtask.title or synced event ID
          const matchingEvent = events.find((evt) => {
            const cleanSummary = evt.summary?.replace(/^\[NoSnooze\]\s*/i, "").trim().toLowerCase();
            const cleanSubtaskTitle = subtask.title.trim().toLowerCase();
            
            // Match if either summary matches OR if the synced ID matches this event's ID
            const storedState = newSyncedList[subtask.id];
            const isIdMatch = storedState && 
              (typeof storedState === 'object' 
                ? storedState.id === evt.id 
                : storedState === evt.id);

            return isIdMatch || (cleanSummary && cleanSummary === cleanSubtaskTitle);
          });

          if (matchingEvent) {
            // Update sync link if not present or stale
            const currentSyncState = newSyncedList[subtask.id];
            const hasCorrectSyncState = currentSyncState && 
              typeof currentSyncState === 'object' && 
              currentSyncState.id === matchingEvent.id;

            if (!hasCorrectSyncState) {
              newSyncedList[subtask.id] = {
                id: matchingEvent.id,
                htmlLink: matchingEvent.htmlLink,
              };
              syncLinkCount++;
            }

            // Sync scheduledTime if calendar starts at different time
            if (matchingEvent.start?.dateTime) {
              const eventDate = new Date(matchingEvent.start.dateTime);
              const eventDateStr = formatToAppTime(eventDate);

              if (subtask.scheduledTime !== eventDateStr) {
                taskSubtasksUpdated = true;
                updatedCount++;
                return {
                  ...subtask,
                  scheduledTime: eventDateStr,
                };
              }
            }
          }
          return subtask;
        });

        // If any subtasks were modified, save them back!
        if (taskSubtasksUpdated && onUpdateTaskSubtasks) {
          await onUpdateTaskSubtasks(task.id, updatedSubtasks);
        }
      }

      // Persist the synced event mappings
      setSyncedSubtaskIds(newSyncedList);
      localStorage.setItem("nosnooze_synced_calendar_events", JSON.stringify(newSyncedList));

      alert(
        `Bidirectional sync completed successfully!\n\n` +
        `• Linked/Updated ${syncLinkCount} subtask mappings with Google Calendar events.\n` +
        `• Automatically synchronized ${updatedCount} subtask times to align with Google Calendar edits.`
      );
    } catch (err: any) {
      console.error("Bidirectional sync error:", err);
      setCalendarError(err.message || "Failed to perform bidirectional sync.");
      alert(`Sync failed: ${err.message || "An unknown error occurred."}`);
    } finally {
      setLoadingCalendar(false);
    }
  };

  const handleDisconnectCalendar = () => {
    cachedAccessToken = null;
    setAccessToken(null);
    setCalendarEvents([]);
    setCalendarError(null);
  };

  // Attempt auto-load of events if token is cached
  useEffect(() => {
    if (accessToken && calendarEvents.length === 0 && !loadingCalendar) {
      fetchCalendarEvents(accessToken);
    }
  }, [accessToken]);


  return (
    <div id="focus_calendar_hub_panel" className="space-y-8 animate-fade-in">
      
      {/* Visual Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="absolute top-0 right-0 w-36 h-36 bg-rose-500/5 rounded-full blur-3xl" />
        <div className="space-y-1.5 z-10">
          <h2 className="text-lg font-bold text-white tracking-tight font-display flex items-center gap-2.5">
            <Zap className="w-5 h-5 text-rose-500 animate-pulse" />
            <span>Focus & Workspace Coordination Hub</span>
          </h2>
          <p className="text-xs text-slate-400">
            Boost deep productivity with a Pomodoro loop paired directly with actual Google Calendar schedules.
          </p>
        </div>
        <div className="z-10 bg-slate-950/60 border border-slate-800 px-3.5 py-1.5 rounded-2xl flex items-center gap-2 text-[10px] font-mono text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <span>REAL-TIME LOCAL SYNC ACTIVE</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* ======================================================== */}
        {/* 1. POMODORO DYNAMIC TIMER SECTION (LEFT - 5 COLS) */}
        {/* ======================================================== */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4 text-rose-500" />
                <span>Pomodoro Focus Timer</span>
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold font-mono tracking-widest bg-rose-500/15 text-rose-400 uppercase">
                {timerMode === "work" ? "Session Cycle" : timerMode === "shortBreak" ? "Short Rest" : "Long Rest"}
              </span>
            </div>

            {/* Mode Select Buttons */}
            <div className="grid grid-cols-3 gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
              <button
                type="button"
                onClick={() => setTimerMode("work")}
                className={`py-1.5 rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition-all ${
                  timerMode === "work" 
                    ? "bg-rose-500 text-white shadow-md shadow-rose-950/40" 
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                Work
              </button>
              <button
                type="button"
                onClick={() => setTimerMode("shortBreak")}
                className={`py-1.5 rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition-all ${
                  timerMode === "shortBreak" 
                    ? "bg-rose-500 text-white shadow-md shadow-rose-950/40" 
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                S-Break
              </button>
              <button
                type="button"
                onClick={() => setTimerMode("longBreak")}
                className={`py-1.5 rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition-all ${
                  timerMode === "longBreak" 
                    ? "bg-rose-500 text-white shadow-md shadow-rose-950/40" 
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                L-Break
              </button>
            </div>

            {/* Circular Progress & Time Visualizer */}
            <div className="relative flex flex-col items-center justify-center py-6">
              {/* Radial Progress Display Ring */}
              <div className="relative w-44 h-44 flex items-center justify-center">
                <svg className="absolute w-full h-full transform -rotate-90">
                  <circle
                    cx="88"
                    cy="88"
                    r="80"
                    className="stroke-slate-950 fill-none"
                    strokeWidth="8"
                  />
                  <circle
                    cx="88"
                    cy="88"
                    r="80"
                    className="stroke-rose-500 fill-none transition-all duration-1000"
                    strokeWidth="8"
                    strokeDasharray={502}
                    strokeDashoffset={502 - (502 * progressPercentage) / 100}
                    strokeLinecap="round"
                  />
                </svg>
                
                {/* Visual Countdown Digits */}
                <div className="text-center z-10">
                  <div className="text-3xl font-bold font-mono text-white tracking-tight">
                    {formatTime(secondsLeft)}
                  </div>
                  <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mt-1">
                    {isRunning ? "Focus Active" : "Stalled"}
                  </div>
                </div>
              </div>
            </div>

            {/* Interactive Control Controls */}
            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={toggleTimer}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-5 rounded-2xl text-xs font-extrabold uppercase tracking-widest transition-all ${
                  isRunning 
                    ? "bg-slate-950 border border-slate-800 text-amber-400 hover:bg-slate-900" 
                    : "bg-rose-600 text-white hover:bg-rose-500 shadow-lg shadow-rose-950/40"
                }`}
              >
                {isRunning ? (
                  <>
                    <Pause className="w-4 h-4" />
                    <span>Pause Flow</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>Start Focus</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={resetTimer}
                className="p-3 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-2xl text-slate-400 hover:text-white transition-all"
                title="Reset Session"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Associated Active Task Attachment */}
          <div className="space-y-3 pt-4 border-t border-slate-850">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Synchronized Target Goal
              </label>
              {activeTask && (
                <span className="text-[9px] font-mono text-slate-400 bg-slate-950 border border-slate-800 px-2 py-0.5 rounded">
                  {completedSessionsCount[selectedTaskId] || 0} Sessions Done
                </span>
              )}
            </div>
            {pendingTasks.length > 0 ? (
              <select
                value={selectedTaskId}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-rose-500/30"
              >
                {pendingTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.goal}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-[11px] text-slate-500 italic text-center p-2 bg-slate-950/50 rounded-xl border border-dashed border-slate-800/80">
                No active goals pending. Complete or add a new goal!
              </div>
            )}

            {/* Sound Selection for end of timer */}
            <div className="space-y-2.5 pt-2">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <Music className="w-3.5 h-3.5 text-rose-500" />
                <span>Session Completion Alert Sound</span>
              </div>
              <select
                value={soundPreset}
                onChange={(e) => {
                  setSoundPreset(e.target.value);
                  playSound(e.target.value); // preview on select
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-rose-500/30"
              >
                {SOUND_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.category})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 2. GOOGLE CALENDAR HUB SECTION (RIGHT - 7 COLS) */}
        {/* ======================================================== */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between space-y-6">
          <div className="space-y-6">
            
            {/* Calendar Connection Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/60 pb-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Calendar className="w-4 h-4 text-rose-500" />
                <span>Google Calendar Sync Engine</span>
              </h3>

              {accessToken ? (
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold font-mono tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/15 uppercase">
                    Connected
                  </span>
                  <button
                    type="button"
                    onClick={handleDisconnectCalendar}
                    className="text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-rose-400 transition"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold font-mono tracking-wider bg-slate-950 text-slate-500 border border-slate-850 uppercase">
                  Logged Out
                </span>
              )}
            </div>

            {/* Authentication Action or Real Calendar Event Stream */}
            {!accessToken ? (
              <div className="bg-slate-950/40 border border-dashed border-slate-850 rounded-2xl p-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto text-rose-400 border border-rose-500/15">
                  <Calendar className="w-6 h-6" />
                </div>
                <div className="space-y-1.5 max-w-sm mx-auto">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Authorize Workspace Access</h4>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Securely retrieve your live Google Calendar schedule. Identify agenda clashes and push committed subtasks into your schedule instantly!
                  </p>
                </div>
                
                <div className="flex flex-col gap-2 max-w-sm mx-auto">
                  <button
                    type="button"
                    onClick={handleConnectCalendar}
                    className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-white text-slate-950 hover:bg-slate-200 transition-all rounded-xl text-xs font-bold tracking-wide shadow-md"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>Connect Google Calendar</span>
                  </button>

                  <a
                    href={window.location.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-800 text-slate-200 hover:bg-slate-700 transition-all rounded-xl text-xs font-bold tracking-wide border border-slate-700"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Open in New Tab to Authorize</span>
                  </a>
                </div>
                
                <p className="text-[10px] text-slate-400 max-w-sm mx-auto leading-relaxed italic">
                  Note: If you are using the embedded preview, browser iframe policies may block the auth popups. If it fails, please click "Open in New Tab" above and authenticate there.
                </p>

                {calendarError && (
                  <p className="text-[10px] text-rose-400 font-mono bg-rose-500/5 p-2 rounded-lg border border-rose-500/10 max-w-sm mx-auto">
                    {calendarError}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Upcoming Agenda (Next 7 Days)
                  </h4>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleBidirectionalSync}
                      disabled={loadingCalendar}
                      className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer disabled:opacity-50 px-2 py-0.5 rounded bg-emerald-500/5 border border-emerald-500/10"
                      title="Sync calendar event changes back to app's goals section"
                    >
                      <RefreshCw className={`w-3 h-3 ${loadingCalendar ? "animate-spin" : ""}`} />
                      <span>Sync Goals</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fetchCalendarEvents(accessToken)}
                      disabled={loadingCalendar}
                      className="text-[10px] font-semibold text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${loadingCalendar ? "animate-spin" : ""}`} />
                      <span>Refresh</span>
                    </button>
                  </div>
                </div>

                {loadingCalendar ? (
                  <div className="space-y-2 py-4">
                    <div className="h-10 bg-slate-950 animate-pulse rounded-xl" />
                    <div className="h-10 bg-slate-950 animate-pulse rounded-xl" />
                    <div className="h-10 bg-slate-950 animate-pulse rounded-xl" />
                  </div>
                ) : calendarError ? (
                  <div className="bg-rose-500/5 border border-rose-500/10 rounded-xl p-4 text-center text-[10px] text-rose-400">
                    {calendarError}
                  </div>
                ) : calendarEvents.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {calendarEvents.map((evt) => {
                      const start = evt.start?.dateTime ? new Date(evt.start.dateTime) : null;
                      const formattedDate = start 
                        ? start.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                        : "All Day";

                      return (
                        <div key={evt.id} className="bg-slate-950/60 border border-slate-850 rounded-xl p-3 hover:border-slate-800 transition flex justify-between items-center gap-3">
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <p className="text-xs font-bold text-slate-200 truncate">{evt.summary || "Untitled Event"}</p>
                            <p className="text-[10px] text-slate-500 font-mono">{formattedDate}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {evt.location && (
                              <span className="text-[9px] text-slate-500 max-w-[80px] truncate bg-slate-900/60 border border-slate-850 px-2 py-0.5 rounded">
                                {evt.location}
                              </span>
                            )}
                            {evt.htmlLink && (
                              <a
                                href={evt.htmlLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[9px] font-bold uppercase tracking-wider text-rose-400 hover:text-rose-300 bg-rose-500/5 border border-rose-500/10 px-2 py-1 rounded"
                              >
                                View
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-500 text-[11px] bg-slate-950/40 rounded-xl border border-dashed border-slate-850">
                    Your upcoming calendar looks clear for the next 7 days!
                  </div>
                )}
              </div>
            )}

            {/* SYNC COMMITTED SUBTASKS ACTION BOARD */}
            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-center border-b border-slate-850 pb-2">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Export Subtask Schedules to Google Calendar
                </h4>
                {accessToken && (
                  <button
                    type="button"
                    onClick={handleExportAllTasksToCalendar}
                    disabled={loadingCalendar}
                    className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer disabled:opacity-50 border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 rounded"
                  >
                    <CalendarPlus className="w-3.5 h-3.5" />
                    <span>Export All</span>
                  </button>
                )}
              </div>
              
              {tasks.length > 0 ? (
                <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                  {tasks.flatMap((t) => t.subtasks.map((st) => ({ task: t, subtask: st })))
                    .filter(({ subtask }) => !subtask.completed)
                    .slice(0, 4)
                    .map(({ task, subtask }) => {
                      const syncState = syncedSubtaskIds[subtask.id];
                      const isSynced = syncState && (typeof syncState === 'object' ? !!syncState.id : !!syncState);
                      const syncInProgress = !!isSyncing[subtask.id];
                      const htmlLink = syncState && typeof syncState === 'object' ? syncState.htmlLink : null;

                      return (
                        <div key={subtask.id} className="bg-slate-950 border border-slate-850 rounded-2xl p-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 hover:border-rose-500/10 transition-all duration-200">
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold font-mono tracking-wide bg-rose-500/10 text-rose-400">
                                {task.goal.slice(0, 16)}...
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                {subtask.scheduledTime ? new Date(subtask.scheduledTime).toLocaleDateString() : "No time slotted"}
                              </span>
                            </div>
                            <p className="text-xs font-bold text-slate-200 truncate">{subtask.title}</p>
                            <p className="text-[9px] text-slate-500">
                              Estimated duration: <span className="font-semibold text-slate-400">{subtask.durationMinutes} mins</span>
                            </p>
                          </div>

                          {accessToken ? (
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                              {isSynced && htmlLink && (
                                <a
                                  href={htmlLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="w-full sm:w-auto flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-all cursor-pointer whitespace-nowrap"
                                >
                                  View Event
                                </a>
                              )}
                              <button
                                type="button"
                                disabled={isSynced || syncInProgress || !subtask.scheduledTime}
                                onClick={() => handlePushSubtaskToCalendar(task, subtask)}
                                className={`w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                                  isSynced
                                    ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 cursor-not-allowed"
                                    : syncInProgress
                                    ? "bg-slate-950 border border-slate-800 text-slate-500 cursor-wait"
                                    : !subtask.scheduledTime
                                    ? "bg-slate-950 border border-slate-805 text-slate-600 cursor-not-allowed"
                                    : "bg-slate-900 border border-slate-800 hover:border-rose-500/30 hover:bg-rose-500/10 text-rose-400"
                                }`}
                              >
                                {isSynced ? (
                                  <>
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Synced</span>
                                  </>
                                ) : syncInProgress ? (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    <span>Syncing</span>
                                  </>
                                ) : (
                                  <>
                                    <CalendarPlus className="w-3.5 h-3.5" />
                                    <span>Add to G-Cal</span>
                                  </>
                                )}
                              </button>
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-500 font-medium italic select-none">
                              Connect to Sync
                            </div>
                          )}
                        </div>
                      );
                    })}

                  {tasks.flatMap((t) => t.subtasks.map((st) => st)).filter((st) => !st.completed).length === 0 && (
                    <div className="text-center py-4 text-slate-500 text-[11px] italic">
                      No pending schedule subtasks available to sync!
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4 text-slate-500 text-[11px] italic">
                  Complete decomposition flow to view exportable subtask schedules here.
                </div>
              )}
            </div>

          </div>

          {/* Browser constraints helper guidance info */}
          <div className="bg-rose-500/5 border border-rose-500/10 rounded-2xl p-4 flex gap-3 items-start mt-4">
            <Info className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <div className="text-[11px] text-slate-400 leading-relaxed">
              <strong className="text-slate-300">Live Workspace Synchronization:</strong> Sync handles scheduled subtask slots securely. When clicking "Add to G-Cal", events are instantiated directly into your Google Calendar account with accurate durations, times, and pre-configured notification triggers!
            </div>
          </div>
        </div>

      </div>

      {/* FCM & Browser Notification Control Center */}
      <NotificationFCMCenter />

    </div>
  );
}

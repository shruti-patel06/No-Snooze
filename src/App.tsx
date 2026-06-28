import React, { useState, useEffect, useMemo } from "react";
import {
  auth,
  db
} from "./lib/firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
  GoogleAuthProvider,
  signInWithPopup
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  onSnapshot,
  updateDoc,
  deleteDoc,
  addDoc
} from "firebase/firestore";
import { Task, Subtask, UserProfile } from "./types";
import DecomposeForm from "./components/DecomposeForm";
import DailyDigest from "./components/DailyDigest";
import InteractiveCalendar from "./components/InteractiveCalendar";
import TaskCard from "./components/TaskCard";
import EscalationModal from "./components/EscalationModal";
import HistoricalTrends from "./components/HistoricalTrends";
import AudioSettings, { getSavedAudioConfig } from "./components/AudioSettings";
import FocusCalendarHub from "./components/FocusCalendarHub";
import GoalProgressOverview from "./components/GoalProgressOverview";
import { playSound } from "./utils/soundEngine";
import { getAccessToken } from "./lib/oauth";

import {
  Flame,
  LogOut,
  Mail,
  Lock,
  Compass,
  Zap,
  Sparkles,
  ShieldCheck,
  CheckCircle,
  HelpCircle,
  Clock,
  ChevronRight,
  User,
  Activity,
  X,
  AlertOctagon,
  CheckCircle2,
  AlertTriangle,
  History,
  ShieldAlert,
  Sun,
  Moon
} from "lucide-react";

export default function App() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    return (localStorage.getItem("nosnooze_theme") as "dark" | "light") || "dark";
  });

  useEffect(() => {
    if (theme === "light") {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
      document.body.classList.add("focus-light");
    } else {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
      document.body.classList.remove("focus-light");
    }
    localStorage.setItem("nosnooze_theme", theme);
  }, [theme]);

  const [isSimulated, setIsSimulated] = useState<boolean>(() => {
    return localStorage.getItem("nosnooze_is_simulated") === "true";
  });
  const [user, setUser] = useState<any | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"dashboard" | "focus" | "trends" | "logs" | "settings">("dashboard");

  // Auth form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Flow states
  const [previewingGoal, setPreviewingGoal] = useState<string | null>(null);
  const [previewingDeadline, setPreviewingDeadline] = useState<string | null>(null);
  const [suggestedSubtasks, setSuggestedSubtasks] = useState<Omit<Subtask, "id" | "completed">[]>([]);

  // Simulation notification banner (for early warnings)
  const [notification, setNotification] = useState<{ taskId: string; message: string } | null>(null);

  // Active escalation modal target
  const [activeEscalation, setActiveEscalation] = useState<{ task: Task; level: "close" | "critical" } | null>(null);

  // --- DYNAMIC CONSEQUENCE LOGS ENGINE ---
  const consequenceLogs = useMemo(() => {
    const logs: Array<{
      id: string;
      timestamp: Date;
      title: string;
      message: string;
      type: "completed" | "failed" | "warning" | "replan" | "system";
    }> = [];

    // Base seeded accountability history
    const seedTime = new Date().getTime();
    logs.push(
      {
        id: "mock_log_1",
        timestamp: new Date(seedTime - 3 * 24 * 60 * 60 * 1000),
        title: "Accountability Contract Completed",
        message: "Resolved all outstanding morning subtasks and finalized contract: 'Decompose core API structures'. Streak maintained.",
        type: "completed",
      },
      {
        id: "mock_log_2",
        timestamp: new Date(seedTime - 2 * 24 * 60 * 60 * 1000),
        title: "AI Decompose Schedule Approved",
        message: "Gemini AI Coach parsed, micro-scheduled, and established daily milestones for: 'Secure database architecture'.",
        type: "replan",
      },
      {
        id: "mock_log_3",
        timestamp: new Date(seedTime - 1 * 24 * 60 * 60 * 1000),
        title: "Accountability Alert Escalated",
        message: "Goal 'Configure Cloud Run environment' reached CLOSE alert level warning. Replanned with AI supervisor.",
        type: "warning",
      }
    );

    // Populate log list from actual user contracts
    tasks.forEach((task) => {
      const taskTime = task.createdAt ? new Date(task.createdAt).getTime() : seedTime;

      if (task.status === "completed") {
        logs.push({
          id: `task_comp_${task.id}`,
          timestamp: new Date(taskTime + 10 * 60 * 60 * 1000),
          title: "Accountability Contract Completed",
          message: `Successfully resolved contract: '${task.goal}'. All ${task.subtasks.length} subtask milestones successfully completed.`,
          type: "completed",
        });
      }

      if (task.status === "failed") {
        logs.push({
          id: `task_fail_${task.id}`,
          timestamp: new Date(taskTime + 24 * 60 * 60 * 1000),
          title: "Contract Breach / Streak Broken",
          message: `User failed to fulfill commitments within deadline limits for: '${task.goal}'. Streak was reset.`,
          type: "failed",
        });
      }

      if (task.escalationLevel !== "none") {
        logs.push({
          id: `task_esc_${task.id}_${task.escalationLevel}`,
          timestamp: new Date(),
          title: `Alert Escalated: ${task.escalationLevel.toUpperCase()} LEVEL`,
          message: `Contract '${task.goal}' has triggered active warnings. Current level: ${task.escalationLevel}.`,
          type: "warning",
        });
      }

      if (task.ignoreCount > 0) {
        logs.push({
          id: `task_ign_${task.id}_${task.ignoreCount}`,
          timestamp: new Date(),
          title: "Accountability Alerts Ignored",
          message: `User dismissed real-time warning reminders ${task.ignoreCount} times for goal: '${task.goal}'.`,
          type: "warning",
        });
      }
    });

    return logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [tasks]);

  // Monitor auth changes
  useEffect(() => {
    if (isSimulated) {
      // Setup mock user
      setUser({
        uid: "simulated_user_id",
        email: "sandbox@nosnooze.ai",
        displayName: "Sandbox Agent",
        isAnonymous: true
      });
      
      // Load or create simulated profile
      const localProfileStr = localStorage.getItem("nosnooze_simulated_profile");
      let currentProfile: UserProfile;
      if (localProfileStr) {
        currentProfile = JSON.parse(localProfileStr);
        setUserProfile(currentProfile);
      } else {
        currentProfile = {
          uid: "simulated_user_id",
          email: "sandbox@nosnooze.ai",
          displayName: "Sandbox Agent",
          streak: 2,
          maxStreak: 5,
          lastActiveDate: "",
          createdAt: new Date().toISOString(),
        };
        localStorage.setItem("nosnooze_simulated_profile", JSON.stringify(currentProfile));
        setUserProfile(currentProfile);
      }

      // Load simulated tasks
      const localTasksStr = localStorage.getItem("nosnooze_simulated_tasks");
      if (localTasksStr) {
        const list = JSON.parse(localTasksStr) as Task[];
        setTasks(list);
        
        // Auto-trigger modal if there is an active escalation task
        const closeTask = list.find((t) => t.escalationLevel === "close");
        const criticalTask = list.find((t) => t.escalationLevel === "critical");
        if (criticalTask) {
          setActiveEscalation({ task: criticalTask, level: "critical" });
        } else if (closeTask) {
          setActiveEscalation({ task: closeTask, level: "close" });
        } else {
          setActiveEscalation(null);
        }
      } else {
        const initialTasks: Task[] = [
          {
            id: "task_demo_1",
            goal: "Finish NoSnooze AI UI Implementation",
            deadline: new Date(Date.now() + 86400000 * 2).toISOString(),
            status: "pending",
            createdAt: new Date().toISOString(),
            escalationLevel: "none",
            ignoreCount: 0,
            subtasks: [
              {
                id: "st_1",
                title: "Refactor App.tsx theme to Slate-Rose colors",
                durationMinutes: 30,
                dayOffset: 0,
                suggestedTimeOfDay: "morning",
                completed: true
              },
              {
                id: "st_2",
                title: "Incorporate robust Google Sign-In with popup",
                durationMinutes: 45,
                dayOffset: 1,
                suggestedTimeOfDay: "afternoon",
                completed: false,
                scheduledTime: new Date(Date.now() + 86400000).toISOString().split("T")[0] + " 14:00"
              },
              {
                id: "st_3",
                title: "Setup offline local storage simulation fallbacks",
                durationMinutes: 60,
                dayOffset: 2,
                suggestedTimeOfDay: "evening",
                completed: false
              }
            ]
          }
        ];
        localStorage.setItem("nosnooze_simulated_tasks", JSON.stringify(initialTasks));
        setTasks(initialTasks);
      }
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          // Fetch or create profile
          const profileRef = doc(db, "users", firebaseUser.uid);
          const profileSnap = await getDoc(profileRef);

          if (profileSnap.exists()) {
            setUserProfile(profileSnap.data() as UserProfile);
          } else {
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || "anonymous@nosnooze.ai",
              displayName: firebaseUser.displayName || "Accountability Agent",
              streak: 0,
              maxStreak: 0,
              lastActiveDate: "",
              createdAt: new Date().toISOString(),
            };
            await setDoc(profileRef, newProfile);
            setUserProfile(newProfile);
          }

          // Subscribe to tasks
          const tasksRef = collection(db, "users", firebaseUser.uid, "tasks");
          const unsubscribeTasks = onSnapshot(tasksRef, (snapshot) => {
            const list: Task[] = [];
            snapshot.forEach((docSnap) => {
              list.push({ id: docSnap.id, ...docSnap.data() } as Task);
            });
            // Sort tasks: pending/critical first, then newest
            list.sort((a, b) => {
              if (a.status === "completed" && b.status !== "completed") return 1;
              if (a.status !== "completed" && b.status === "completed") return -1;
              return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });
            setTasks(list);

            // Auto-trigger modal if there is an active escalation task in the database snapshot
            const closeTask = list.find((t) => t.escalationLevel === "close");
            const criticalTask = list.find((t) => t.escalationLevel === "critical");
            if (criticalTask) {
              setActiveEscalation({ task: criticalTask, level: "critical" });
            } else if (closeTask) {
              setActiveEscalation({ task: closeTask, level: "close" });
            } else {
              setActiveEscalation(null);
            }
          }, (err) => {
            console.error("Firestore onSnapshot subscription failed, falling back to local simulation mode:", err);
            setIsSimulated(true);
            localStorage.setItem("nosnooze_is_simulated", "true");
          });

          setLoading(false);
          return () => unsubscribeTasks();
        } catch (err) {
          console.error("Firestore loading error, falling back to local simulation mode:", err);
          setIsSimulated(true);
          localStorage.setItem("nosnooze_is_simulated", "true");
        }
      } else {
        setUserProfile(null);
        setTasks([]);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [isSimulated]);

  // Audio playback effect triggered on escalation level changes
  useEffect(() => {
    if (!user) return;
    const audioConfig = getSavedAudioConfig();
    if (!audioConfig.enabled) return;

    if (activeEscalation) {
      if (activeEscalation.level === "critical") {
        playSound(audioConfig.criticalSound);
      } else if (activeEscalation.level === "close") {
        playSound(audioConfig.closeSound);
      }
    }
  }, [activeEscalation, user]);

  useEffect(() => {
    if (!user) return;
    const audioConfig = getSavedAudioConfig();
    if (!audioConfig.enabled) return;

    if (notification) {
      const msg = notification.message;
      if (msg === "Generating early reminder..." || msg.includes("Gentle") || msg.includes("nudge") || msg.includes("reminder")) {
        playSound(audioConfig.earlySound);
      }
    }
  }, [notification, user]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);

    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/operation-not-allowed" || (err.message && err.message.includes("operation-not-allowed"))) {
        setAuthError(
          "Email/Password sign-in is not enabled in your Firebase console. To use it, please go to Firebase Console > Authentication > Sign-in method and enable Email/Password.\n\nAlternatively, use 'Sign in with Google' which is fully configured, or 'Enter Instantly (Quick Demo Session)' which will run a fully functional local simulator sandbox!"
        );
      } else {
        setAuthError(err.message || "Authentication failed. Check your credentials.");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/operation-not-allowed" || (err.message && err.message.includes("operation-not-allowed"))) {
        setAuthError(
          "Google Sign-In is not enabled in your Firebase console. To use it, please go to Firebase Console > Authentication > Sign-in method and enable Google.\n\nAlternatively, enter a local simulator sandbox instantly by clicking 'Enter Instantly (Quick Demo Session)' below!"
        );
      } else {
        setAuthError(err.message || "Google sign-in failed.");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleQuickDemoLogin = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signInAnonymously(auth);
    } catch (err: any) {
      console.warn("Firebase Anonymous Sign-In failed or not enabled, switching to high-fidelity Local Sandbox Session...", err);
      // Fallback instantly to Simulated Local Session!
      setIsSimulated(true);
      localStorage.setItem("nosnooze_is_simulated", "true");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = () => {
    if (isSimulated) {
      setIsSimulated(false);
      localStorage.removeItem("nosnooze_is_simulated");
      setUser(null);
      setUserProfile(null);
      setTasks([]);
    } else {
      signOut(auth);
    }
    setNotification(null);
    setActiveEscalation(null);
  };

  // Goal Creation Flow
  const handleDecomposeSuccess = (goal: string, deadline: string, subtasks: Omit<Subtask, "id" | "completed">[]) => {
    setPreviewingGoal(goal);
    setPreviewingDeadline(deadline);
    setSuggestedSubtasks(subtasks);
  };

  const handleCommitSchedule = async (finalSubtasks: Subtask[]) => {
    if (!user || !previewingGoal || !previewingDeadline) return;

    try {
      const newTaskData: Omit<Task, "id"> = {
        goal: previewingGoal,
        deadline: previewingDeadline,
        status: "pending",
        createdAt: new Date().toISOString(),
        escalationLevel: "none",
        ignoreCount: 0,
        subtasks: finalSubtasks,
      };

      if (isSimulated) {
        const newTask: Task = {
          id: "task_" + Date.now(),
          ...newTaskData
        };
        const updatedTasks = [newTask, ...tasks];
        setTasks(updatedTasks);
        localStorage.setItem("nosnooze_simulated_tasks", JSON.stringify(updatedTasks));
      } else {
        const tasksCollectionRef = collection(db, "users", user.uid, "tasks");
        await addDoc(tasksCollectionRef, newTaskData);
      }

      // Automatically schedule subtasks on Google Calendar if token is active
      const accessToken = getAccessToken();
      if (accessToken) {
        console.log("Auto-scheduling committed subtasks on Google Calendar...");
        const syncedMap: Record<string, string> = (() => {
          try {
            const saved = localStorage.getItem("nosnooze_synced_calendar_events");
            return saved ? JSON.parse(saved) : {};
          } catch {
            return {};
          }
        })();

        for (const subtask of finalSubtasks) {
          if (!subtask.scheduledTime) continue;
          try {
            const startTime = new Date(subtask.scheduledTime);
            const endTime = new Date(startTime.getTime() + subtask.durationMinutes * 60 * 1000);

            const eventPayload = {
              summary: `[NoSnooze] ${subtask.title}`,
              description: `Subtask committed under the goal: "${previewingGoal}"\nCreated automatically by NoSnooze.`,
              start: {
                dateTime: startTime.toISOString(),
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
              },
              end: {
                dateTime: endTime.toISOString(),
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
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
              const data = await response.json();
              if (data.id) {
                syncedMap[subtask.id] = data.id;
              }
            }
          } catch (gcalErr) {
            console.error("Failed to auto-schedule subtask:", subtask.title, gcalErr);
          }
        }

        localStorage.setItem("nosnooze_synced_calendar_events", JSON.stringify(syncedMap));
      }

      // Reset preview state
      setPreviewingGoal(null);
      setPreviewingDeadline(null);
      setSuggestedSubtasks([]);
    } catch (err) {
      console.error("Error committing schedule:", err);
      alert("Failed to commit task. Please try again.");
    }
  };

  // Toggle subtasks in Firestore
  const handleToggleSubtask = async (taskId: string, subtaskId: string) => {
    if (!user) return;

    const taskToUpdate = tasks.find((t) => t.id === taskId);
    if (!taskToUpdate) return;

    const updatedSubtasks = taskToUpdate.subtasks.map((st) =>
      st.id === subtaskId ? { ...st, completed: !st.completed } : st
    );

    const allCompleted = updatedSubtasks.every((st) => st.completed);
    const newStatus = allCompleted ? "completed" : "pending";
    const nextEscalation = allCompleted ? ("none" as const) : taskToUpdate.escalationLevel;

    if (isSimulated) {
      const updatedTasks = tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              subtasks: updatedSubtasks,
              status: newStatus,
              escalationLevel: nextEscalation,
            }
          : t
      );
      setTasks(updatedTasks);
      localStorage.setItem("nosnooze_simulated_tasks", JSON.stringify(updatedTasks));

      // Trigger active escalation check
      const closeTask = updatedTasks.find((t) => t.escalationLevel === "close");
      const criticalTask = updatedTasks.find((t) => t.escalationLevel === "critical");
      if (criticalTask) {
        setActiveEscalation({ task: criticalTask, level: "critical" });
      } else if (closeTask) {
        setActiveEscalation({ task: closeTask, level: "close" });
      } else {
        setActiveEscalation(null);
      }
    } else {
      const taskDocRef = doc(db, "users", user.uid, "tasks", taskId);
      await updateDoc(taskDocRef, {
        subtasks: updatedSubtasks,
        status: newStatus,
        // If completed, clear escalation
        ...(allCompleted ? { escalationLevel: "none" } : {}),
      });
    }

    // If goal just reached completed state, increase user streak!
    if (newStatus === "completed" && taskToUpdate.status !== "completed") {
      await handleStreakIncrement();
    }
  };

  // Update multiple subtasks of a task (e.g. synchronized from Google Calendar)
  const handleUpdateTaskSubtasks = async (taskId: string, updatedSubtasks: Subtask[]) => {
    if (!user) return;

    const taskToUpdate = tasks.find((t) => t.id === taskId);
    if (!taskToUpdate) return;

    const allCompleted = updatedSubtasks.every((st) => st.completed);
    const newStatus = allCompleted ? "completed" : "pending";
    const nextEscalation = allCompleted ? ("none" as const) : taskToUpdate.escalationLevel;

    if (isSimulated) {
      const updatedTasks = tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              subtasks: updatedSubtasks,
              status: newStatus,
              escalationLevel: nextEscalation,
            }
          : t
      );
      setTasks(updatedTasks);
      localStorage.setItem("nosnooze_simulated_tasks", JSON.stringify(updatedTasks));
    } else {
      const taskDocRef = doc(db, "users", user.uid, "tasks", taskId);
      await updateDoc(taskDocRef, {
        subtasks: updatedSubtasks,
        status: newStatus,
        ...(allCompleted ? { escalationLevel: "none" } : {}),
      });
    }

    if (newStatus === "completed" && taskToUpdate.status !== "completed") {
      await handleStreakIncrement();
    }
  };

  const handleStreakIncrement = async () => {
    if (!user || !userProfile) return;

    const newStreak = userProfile.streak + 1;
    const newMax = Math.max(newStreak, userProfile.maxStreak);
    const todayStr = new Date().toISOString().split("T")[0];

    if (isSimulated) {
      const updatedProfile = {
        ...userProfile,
        streak: newStreak,
        maxStreak: newMax,
        lastActiveDate: todayStr,
      };
      setUserProfile(updatedProfile);
      localStorage.setItem("nosnooze_simulated_profile", JSON.stringify(updatedProfile));
    } else {
      const profileRef = doc(db, "users", user.uid);
      await updateDoc(profileRef, {
        streak: newStreak,
        maxStreak: newMax,
        lastActiveDate: todayStr,
      });

      setUserProfile((prev) =>
        prev
          ? {
              ...prev,
              streak: newStreak,
              maxStreak: newMax,
              lastActiveDate: todayStr,
            }
          : null
      );
    }
  };

  // Manual Simulator Action triggers escalation states
  const handleSimulateEscalation = async (taskId: string, level: "none" | "early" | "close" | "critical") => {
    if (!user) return;

    if (isSimulated) {
      const updatedTasks = tasks.map((t) =>
        t.id === taskId ? { ...t, escalationLevel: level } : t
      );
      setTasks(updatedTasks);
      localStorage.setItem("nosnooze_simulated_tasks", JSON.stringify(updatedTasks));

      // Trigger active escalation check
      const closeTask = updatedTasks.find((t) => t.escalationLevel === "close");
      const criticalTask = updatedTasks.find((t) => t.escalationLevel === "critical");
      if (criticalTask) {
        setActiveEscalation({ task: criticalTask, level: "critical" });
      } else if (closeTask) {
        setActiveEscalation({ task: closeTask, level: "close" });
      } else {
        setActiveEscalation(null);
      }
    } else {
      const taskRef = doc(db, "users", user.uid, "tasks", taskId);
      await updateDoc(taskRef, {
        escalationLevel: level,
      });
    }

    // If "early", generate friendly AI check-in warning in notification banner
    if (level === "early") {
      const selectedTask = tasks.find((t) => t.id === taskId);
      if (selectedTask) {
        setNotification({
          taskId,
          message: "Generating early reminder...",
        });

        // Request check-in advice from Gemini
        try {
          const res = await fetch("/api/generate-checkin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              goal: selectedTask.goal,
              escalationLevel: "early",
              ignoreCount: selectedTask.ignoreCount,
              currentStreak: userProfile?.streak || 0,
            }),
          });
          const data = await res.json();
          setNotification({
            taskId,
            message: data.message || `Gentle nudge: Remember your goal "${selectedTask.goal}" is approaching!`,
          });
        } catch (err) {
          setNotification({
            taskId,
            message: `Gentle reminder: Make sure to stay on track with: "${selectedTask.goal}"!`,
          });
        }
      }
    }
  };

  // Increment ignore count (triggers escalation levels in normal flow)
  const handleIncrementIgnore = async (taskId: string) => {
    if (!user) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const nextIgnore = task.ignoreCount + 1;
    let nextLevel = task.escalationLevel;

    // Escalating rules
    if (nextIgnore === 1) nextLevel = "early";
    if (nextIgnore === 2) nextLevel = "close";
    if (nextIgnore >= 3) nextLevel = "critical";

    if (isSimulated) {
      const updatedTasks = tasks.map((t) =>
        t.id === taskId ? { ...t, ignoreCount: nextIgnore, escalationLevel: nextLevel } : t
      );
      setTasks(updatedTasks);
      localStorage.setItem("nosnooze_simulated_tasks", JSON.stringify(updatedTasks));

      // Trigger active escalation check
      const closeTask = updatedTasks.find((t) => t.escalationLevel === "close");
      const criticalTask = updatedTasks.find((t) => t.escalationLevel === "critical");
      if (criticalTask) {
        setActiveEscalation({ task: criticalTask, level: "critical" });
      } else if (closeTask) {
        setActiveEscalation({ task: closeTask, level: "close" });
      } else {
        setActiveEscalation(null);
      }
    } else {
      const taskRef = doc(db, "users", user.uid, "tasks", taskId);
      await updateDoc(taskRef, {
        ignoreCount: nextIgnore,
        escalationLevel: nextLevel,
      });
    }
  };

  // Delete Goal Task
  const handleDeleteTask = async (taskId: string) => {
    if (!user) return;

    if (isSimulated) {
      const updatedTasks = tasks.filter((t) => t.id !== taskId);
      setTasks(updatedTasks);
      localStorage.setItem("nosnooze_simulated_tasks", JSON.stringify(updatedTasks));
      
      // Auto-trigger modal check
      const closeTask = updatedTasks.find((t) => t.escalationLevel === "close");
      const criticalTask = updatedTasks.find((t) => t.escalationLevel === "critical");
      if (criticalTask) {
        setActiveEscalation({ task: criticalTask, level: "critical" });
      } else if (closeTask) {
        setActiveEscalation({ task: closeTask, level: "close" });
      } else {
        setActiveEscalation(null);
      }
    } else {
      const taskRef = doc(db, "users", user.uid, "tasks", taskId);
      await deleteDoc(taskRef);
    }

    if (notification?.taskId === taskId) setNotification(null);
  };

  // Handle successful blocker replanning accept
  const handleReplanSuccess = async (taskId: string, updatedSubtasks: Subtask[], reasoning: string, blockerText?: string) => {
    if (!user) return;

    if (blockerText) {
      try {
        const stored = localStorage.getItem("nosnooze_reported_blockers");
        const list = stored ? JSON.parse(stored) : [];
        list.push({
          id: `b_${Date.now()}`,
          text: blockerText,
          timestamp: new Date().toISOString(),
          taskId
        });
        localStorage.setItem("nosnooze_reported_blockers", JSON.stringify(list));
      } catch (err) {
        console.error("Failed to save blocker to history:", err);
      }
    }

    if (isSimulated) {
      const updatedTasks = tasks.map((t) =>
        t.id === taskId ? { ...t, subtasks: updatedSubtasks, escalationLevel: "none" as const, ignoreCount: 0 } : t
      );
      setTasks(updatedTasks);
      localStorage.setItem("nosnooze_simulated_tasks", JSON.stringify(updatedTasks));
      setActiveEscalation(null);
    } else {
      const taskRef = doc(db, "users", user.uid, "tasks", taskId);
      await updateDoc(taskRef, {
        subtasks: updatedSubtasks,
        escalationLevel: "none", // reset to none on successful replan!
        ignoreCount: 0,
      });

      // Append a log checkin entry in Firestore
      const checkinRef = collection(db, "users", user.uid, "tasks", taskId, "checkins");
      await addDoc(checkinRef, {
        timestamp: new Date().toISOString(),
        type: "close",
        blocker: blockerText || "Replanned with Gemini Coach",
        replanned: true,
        geminiResponse: reasoning,
      });
    }

    // Automatically schedule newly replanned subtasks on Google Calendar if connected
    const accessToken = getAccessToken();
    if (accessToken) {
      console.log("Auto-scheduling replanned subtasks on Google Calendar...");
      const syncedMap: Record<string, string> = (() => {
        try {
          const saved = localStorage.getItem("nosnooze_synced_calendar_events");
          return saved ? JSON.parse(saved) : {};
        } catch {
          return {};
        }
      })();

      const newlyReplanned = updatedSubtasks.filter((st) => st.id.startsWith("st_replan_") && !st.completed);
      const taskObj = tasks.find((t) => t.id === taskId);
      const goalLabel = taskObj?.goal || "Goal Tasks";

      for (const subtask of newlyReplanned) {
        if (!subtask.scheduledTime) continue;
        try {
          const startTime = new Date(subtask.scheduledTime);
          const endTime = new Date(startTime.getTime() + subtask.durationMinutes * 60 * 1000);

          const eventPayload = {
            summary: `[NoSnooze] ${subtask.title}`,
            description: `Replanned subtask committed under the goal: "${goalLabel}"\nCreated automatically by NoSnooze.`,
            start: {
              dateTime: startTime.toISOString(),
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
            },
            end: {
              dateTime: endTime.toISOString(),
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
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
            const data = await response.json();
            if (data.id) {
              syncedMap[subtask.id] = data.id;
            }
          }
        } catch (gcalErr) {
          console.error("Failed to auto-schedule replanned subtask:", subtask.title, gcalErr);
        }
      }

      localStorage.setItem("nosnooze_synced_calendar_events", JSON.stringify(syncedMap));
    }
  };

  // Handle takeover acknowledgement (pledged commitment or break streak)
  const handleConsequenceAcknowledged = async (taskId: string, breakStreak: boolean) => {
    if (!user) return;

    if (isSimulated) {
      if (breakStreak) {
        const updatedTasks = tasks.map((t) =>
          t.id === taskId ? { ...t, status: "failed" as const, escalationLevel: "none" as const, ignoreCount: 0 } : t
        );
        setTasks(updatedTasks);
        localStorage.setItem("nosnooze_simulated_tasks", JSON.stringify(updatedTasks));

        if (userProfile) {
          const updatedProfile = { ...userProfile, streak: 0 };
          setUserProfile(updatedProfile);
          localStorage.setItem("nosnooze_simulated_profile", JSON.stringify(updatedProfile));
        }
      } else {
        const updatedTasks = tasks.map((t) =>
          t.id === taskId ? { ...t, escalationLevel: "none" as const, ignoreCount: 0 } : t
        );
        setTasks(updatedTasks);
        localStorage.setItem("nosnooze_simulated_tasks", JSON.stringify(updatedTasks));
      }
      setActiveEscalation(null);
    } else {
      const taskRef = doc(db, "users", user.uid, "tasks", taskId);

      if (breakStreak) {
        // User chose to give up, reset streak and fail task
        await updateDoc(taskRef, {
          status: "failed",
          escalationLevel: "none",
          ignoreCount: 0,
        });

        const profileRef = doc(db, "users", user.uid);
        await updateDoc(profileRef, {
          streak: 0,
        });

        setUserProfile((prev) => (prev ? { ...prev, streak: 0 } : null));
      } else {
        // User committed/pledged, give them a fresh clean schedule and reset warning levels
        await updateDoc(taskRef, {
          escalationLevel: "none",
          ignoreCount: 0,
        });
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-400">Synchronizing accountability matrices...</p>
        </div>
      </div>
    );
  }

  // --- AUTH ROUTE ---
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col justify-center items-center px-4 font-sans relative overflow-hidden">
        {/* Subtle ambient blur bubbles */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-rose-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />

        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6 relative z-10">
          <div className="text-center">
            <div className="mx-auto w-12 h-12 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-400 mb-4 border border-rose-500/20">
              <Flame className="w-6 h-6 animate-pulse" />
            </div>
            <h1 className="text-3xl font-display font-extrabold text-white tracking-tight">NOSNOOZE<span className="text-rose-500">.</span>AI</h1>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              Escalating interactive accountability & AI scheduling agent.
              Commit to goals. Break procrastination. Save your streak.
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <input
                  required
                  type="email"
                  placeholder="e.g. shruti@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 transition-all placeholder-slate-700"
                />
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  required
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 transition-all placeholder-slate-700"
                />
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              </div>
            </div>

            {authError && (
              <p className="text-xs text-red-400 bg-red-950/30 border border-red-500/30 p-3 rounded-xl whitespace-pre-line">
                {authError}
              </p>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-rose-600 hover:bg-rose-500 font-bold py-3 rounded-xl text-white text-xs uppercase tracking-widest transition-all shadow-lg shadow-rose-950/40 flex justify-center items-center gap-2"
            >
              {authLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : isSignUp ? (
                "Create Account & Start Agent"
              ) : (
                "Authenticate Account"
              )}
            </button>
          </form>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-slate-800"></div>
            <span className="flex-shrink mx-4 text-slate-500 text-[10px] uppercase font-bold tracking-widest">
              Direct Sign-In (Recommended)
            </span>
            <div className="flex-grow border-t border-slate-800"></div>
          </div>

          {/* GOOGLE SIGN-IN BUTTON */}
          <button
            onClick={handleGoogleLogin}
            disabled={authLoading}
            className="w-full bg-white hover:bg-slate-100 text-slate-950 font-bold py-3 rounded-xl text-xs uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2"
          >
            {authLoading ? (
              <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-rose-600 animate-pulse" />
                <span>Continue with Google</span>
              </>
            )}
          </button>

          <div className="flex flex-col gap-3 pt-2">
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-xs text-rose-400 hover:text-rose-300 font-semibold text-center"
            >
              {isSignUp ? "Already registered? Login instead" : "Need an account? Sign up here"}
            </button>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-slate-800"></div>
              <span className="flex-shrink mx-4 text-slate-500 text-[10px] uppercase font-bold tracking-widest">
                Frictionless Play
              </span>
              <div className="flex-grow border-t border-slate-800"></div>
            </div>

            {/* QUICK ONE-CLICK DEMO LOGIN BUTTON */}
            <button
              onClick={handleQuickDemoLogin}
              disabled={authLoading}
              className="w-full bg-slate-950 hover:bg-slate-900 border border-rose-500/20 hover:border-rose-500/40 text-rose-400 font-bold py-3 rounded-xl text-xs transition-all flex items-center justify-center gap-2"
            >
              <Zap className="w-4 h-4 text-rose-400 animate-bounce" />
              <span>Enter Instantly (Quick Demo Session)</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- MAIN APPLICATION SCREEN ---
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans pb-16 flex flex-col justify-between">
      <div>
        {/* Upper Navigation Bar */}
        <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-40">
          <div className="max-w-5xl mx-auto px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-rose-600 rounded flex items-center justify-center font-bold text-white shadow-lg shadow-rose-950/40">
                NS
              </div>
              <h1 className="text-xl font-display font-extrabold text-white tracking-tight">
                NOSNOOZE<span className="text-rose-500">.</span>AI
              </h1>
              <span className="ml-3 px-2 py-0.5 rounded border border-rose-500/20 bg-rose-500/10 text-rose-400 text-[9px] font-extrabold uppercase tracking-widest hidden sm:inline-block">
                {isSimulated ? "Sandbox Mode (Offline)" : "High Accountability Mode"}
              </span>
            </div>

            <div className="flex items-center gap-4">
              {/* Streak indicator */}
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3.5 py-1.5 rounded-full shadow-inner">
                <Flame className="w-4 h-4 text-amber-500 fill-amber-500 animate-pulse" />
                <span className="text-xs font-bold text-white font-mono">{userProfile?.streak || 0} Day Streak</span>
                {userProfile?.maxStreak && userProfile.maxStreak > 0 ? (
                  <span className="text-[10px] text-slate-500 border-l border-slate-800 pl-2 font-mono">
                    Best: {userProfile.maxStreak}
                  </span>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="p-2 bg-slate-900 hover:bg-rose-950/20 text-slate-400 hover:text-rose-400 border border-slate-800 hover:border-rose-500/30 rounded-xl transition flex items-center justify-center"
                  title={theme === "dark" ? "Switch to Focus Light Mode" : "Switch to High-Contrast Dark Mode"}
                >
                  {theme === "dark" ? (
                    <Sun className="w-4 h-4 text-amber-500" />
                  ) : (
                    <Moon className="w-4 h-4 text-rose-500" />
                  )}
                </button>
                <button
                  onClick={handleSignOut}
                  className="p-2 bg-slate-900 hover:bg-rose-950/20 text-slate-400 hover:text-rose-400 border border-slate-800 hover:border-rose-500/30 rounded-xl transition"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Sliding Subheader Navigation Bar */}
        <div className="border-b border-slate-800/80 bg-slate-950/80 sticky top-[68px] z-30 backdrop-blur-md">
          <div className="max-w-3xl mx-auto px-6 py-2.5 flex gap-5 justify-start">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`text-[10px] font-extrabold uppercase tracking-widest py-1.5 border-b-2 transition-all cursor-pointer ${
                activeTab === "dashboard"
                  ? "border-rose-500 text-white"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab("focus")}
              className={`text-[10px] font-extrabold uppercase tracking-widest py-1.5 border-b-2 transition-all cursor-pointer ${
                activeTab === "focus"
                  ? "border-rose-500 text-white"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              Focus & Calendar
            </button>
            <button
              onClick={() => setActiveTab("trends")}
              className={`text-[10px] font-extrabold uppercase tracking-widest py-1.5 border-b-2 transition-all cursor-pointer ${
                activeTab === "trends"
                  ? "border-rose-500 text-white"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              Historical Trends
            </button>
            <button
              onClick={() => setActiveTab("logs")}
              className={`text-[10px] font-extrabold uppercase tracking-widest py-1.5 border-b-2 transition-all cursor-pointer ${
                activeTab === "logs"
                  ? "border-rose-500 text-white"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              Consequence Logs
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`text-[10px] font-extrabold uppercase tracking-widest py-1.5 border-b-2 transition-all cursor-pointer ${
                activeTab === "settings"
                  ? "border-rose-500 text-white"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              Audio Settings
            </button>
          </div>
        </div>

        <main className="max-w-3xl mx-auto px-6 mt-8 space-y-8">
          {/* Active Simulation Alerts */}
          {notification && (
            <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-4 flex gap-3 items-start relative animate-fade-in">
              <div className="p-1.5 bg-rose-500/10 rounded-lg text-rose-400 mt-0.5">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <h4 className="text-[10px] font-bold text-rose-400 uppercase tracking-widest">
                  Early AI Escalation Notification Triggered
                </h4>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  {notification.message}
                </p>
              </div>
              <button
                onClick={() => setNotification(null)}
                className="text-slate-500 hover:text-white p-1 hover:bg-slate-900 rounded-lg absolute top-3 right-3"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* TAB 1: DASHBOARD VIEW */}
          {activeTab === "dashboard" && (
            <div className="space-y-8">
              {/* Goal Progress Overview Card */}
              <GoalProgressOverview tasks={tasks} />

              {/* Daily Digest Component */}
              <DailyDigest 
                tasks={tasks} 
                userName={userProfile?.displayName || user?.displayName || user?.email?.split('@')[0] || "Friend"} 
              />

              {/* Create/Declare Goal Panel */}
              {!previewingGoal && <DecomposeForm onDecomposeSuccess={handleDecomposeSuccess} />}

              {/* Schedule Preview Section */}
              {previewingGoal && previewingDeadline && suggestedSubtasks.length > 0 && (
                <InteractiveCalendar
                  goal={previewingGoal}
                  deadline={previewingDeadline}
                  suggestedSubtasks={suggestedSubtasks}
                  onCommit={handleCommitSchedule}
                  onCancel={() => {
                    setPreviewingGoal(null);
                    setPreviewingDeadline(null);
                    setSuggestedSubtasks([]);
                  }}
                />
              )}

              {/* Active committed goals display list */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Activity className="w-4 h-4 text-rose-500" />
                    <span>Your Accountability Contracts ({tasks.length})</span>
                  </h2>
                </div>

                {tasks.length === 0 ? (
                  <div className="text-center py-16 bg-slate-900/40 border border-dashed border-slate-800 rounded-3xl space-y-4">
                    <div className="mx-auto w-12 h-12 bg-rose-500/5 rounded-2xl flex items-center justify-center text-rose-500/50 border border-rose-500/10">
                      <Flame className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-300">No committed accountability goals yet</p>
                      <p className="text-xs text-slate-500 mt-1">Declare a goal above to activate NoSnooze's escalation safeguards.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {tasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onToggleSubtask={handleToggleSubtask}
                        onSimulateEscalation={handleSimulateEscalation}
                        onIncrementIgnore={handleIncrementIgnore}
                        onDelete={handleDeleteTask}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: FOCUS & CALENDAR HUB */}
          {activeTab === "focus" && (
            <FocusCalendarHub
              tasks={tasks}
              onToggleSubtask={handleToggleSubtask}
              onUpdateTaskSubtasks={handleUpdateTaskSubtasks}
              user={user}
              isSimulated={isSimulated}
            />
          )}

          {/* TAB 2: HISTORICAL TRENDS VIEW */}
          {activeTab === "trends" && (
            <HistoricalTrends
              tasks={tasks}
              userProfile={userProfile}
              user={user}
            />
          )}

          {/* TAB 3: CONSEQUENCE LOGS VIEW */}
          {activeTab === "logs" && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h2 className="text-md font-bold font-display text-white tracking-tight flex items-center gap-2">
                  <History className="w-5 h-5 text-rose-500" />
                  <span>Chronological Accountability Ledger</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Continuous logs mapping completed commitments, ignored alerts, and streak reset consequences.
                </p>
              </div>

              {consequenceLogs.length === 0 ? (
                <div className="text-center py-16 bg-slate-900/40 border border-dashed border-slate-800 rounded-3xl">
                  <p className="text-sm text-slate-400">No logs generated yet. Set and complete contracts to build history.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {consequenceLogs.map((log) => {
                    let icon = <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
                    let borderClass = "border-slate-800/80 bg-slate-900/40";
                    
                    if (log.type === "failed") {
                      icon = <AlertOctagon className="w-4 h-4 text-rose-500" />;
                      borderClass = "border-rose-500/20 bg-rose-500/5";
                    } else if (log.type === "warning") {
                      icon = <ShieldAlert className="w-4 h-4 text-amber-500" />;
                      borderClass = "border-amber-500/20 bg-amber-500/5";
                    } else if (log.type === "replan") {
                      icon = <Sparkles className="w-4 h-4 text-purple-400" />;
                      borderClass = "border-purple-500/20 bg-purple-500/5";
                    }

                    return (
                      <div 
                        key={log.id} 
                        className={`border rounded-2xl p-4 flex gap-4 items-start ${borderClass} transition-all hover:border-slate-700`}
                      >
                        <div className="p-2 bg-slate-950 border border-slate-800 rounded-xl mt-0.5">
                          {icon}
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex justify-between items-start gap-4">
                            <h4 className="text-xs font-extrabold uppercase tracking-wider text-white">{log.title}</h4>
                            <span className="text-[9px] font-mono text-slate-500 whitespace-nowrap">
                              {log.timestamp.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at {log.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed">{log.message}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: AUDIO SETTINGS VIEW */}
          {activeTab === "settings" && (
            <AudioSettings />
          )}
        </main>
      </div>

      {/* RENDER DYNAMIC ESCALATION CHECK-INS / TAKEOVERS */}
      {activeEscalation && (
        <EscalationModal
          task={activeEscalation.task}
          level={activeEscalation.level}
          currentStreak={userProfile?.streak || 0}
          onReplanSuccess={handleReplanSuccess}
          onConsequenceAcknowledged={handleConsequenceAcknowledged}
          onClose={() => setActiveEscalation(null)}
        />
      )}

      {/* Minimalist accountability status bar footer */}
      <footer className="mt-16 border-t border-slate-800/40 py-8 bg-slate-950/20 text-slate-500 text-xs text-center">
        <div className="max-w-3xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
            <span className="font-sans font-bold tracking-wider text-[10px] text-slate-400 uppercase">NoSnooze Accountability Engine</span>
          </div>
          <p className="text-[10px] font-mono text-slate-600">
            Keep commitments, beat procrastination • v1.0.4
          </p>
        </div>
      </footer>
    </div>
  );
}

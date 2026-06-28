import React, { useState, useEffect, useMemo } from "react";
import { Sparkles, Loader2, RotateCw, ListTodo, Flame, CheckCircle2 } from "lucide-react";
import { motion } from "motion/react";
import { Task } from "../types";

interface DailyDigestProps {
  tasks: Task[];
  userName: string;
}

export default function DailyDigest({ tasks, userName }: DailyDigestProps) {
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  // Filter pending subtasks for today
  const pendingSubtasksForToday = useMemo(() => {
    const list: Array<{ title: string; goalTitle: string; suggestedTimeOfDay?: string }> = [];
    tasks.forEach((task) => {
      if (task.status !== "completed" && task.status !== "failed") {
        task.subtasks.forEach((sub) => {
          if (!sub.completed) {
            let isToday = false;
            if (sub.scheduledTime) {
              const scheduledDateStr = sub.scheduledTime.split(" ")[0];
              isToday = scheduledDateStr === todayStr;
            } else {
              const createdAtDate = new Date(task.createdAt);
              createdAtDate.setDate(createdAtDate.getDate() + sub.dayOffset);
              const calculatedDateStr = createdAtDate.toISOString().split("T")[0];
              isToday = calculatedDateStr === todayStr;
            }

            if (isToday) {
              list.push({
                title: sub.title,
                goalTitle: task.goal,
                suggestedTimeOfDay: sub.suggestedTimeOfDay,
              });
            }
          }
        });
      }
    });
    return list;
  }, [tasks, todayStr]);

  const [digestText, setDigestText] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Stable dependency fingerprint to prevent redundant hooks executions or loops
  const subtasksFingerprint = useMemo(() => {
    return pendingSubtasksForToday.map((s) => s.title + s.goalTitle).join("|");
  }, [pendingSubtasksForToday]);

  const fetchDigest = async (force: boolean = false) => {
    const cacheKey = `nosnooze_daily_digest_${todayStr}_${userName}_${subtasksFingerprint || "empty"}`;

    if (!force) {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setDigestText(cached);
        setError(null);
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/daily-digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingSubtasks: pendingSubtasksForToday, userName }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to fetch daily digest");
      }

      const data = await response.json();
      if (data.digestText) {
        setDigestText(data.digestText);
        localStorage.setItem(cacheKey, data.digestText);
      } else {
        throw new Error("Invalid response format");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred while generating digest.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDigest();
  }, [subtasksFingerprint, userName]);

  return (
    <motion.div
      id="daily_digest_container"
      initial={{ opacity: 0, y: -15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="bg-slate-900/40 border border-slate-800/80 backdrop-blur-md rounded-3xl p-5 shadow-xl relative overflow-hidden"
    >
      {/* Visual glowing highlight bar */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-rose-500 to-amber-500 opacity-60" />

      {/* Header Panel */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-gradient-to-br from-purple-500/10 to-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Morning Mindset Coach</h3>
          </div>
        </div>

        <button
          onClick={() => fetchDigest(true)}
          disabled={loading}
          className="text-slate-500 hover:text-rose-400 p-1.5 hover:bg-slate-950 rounded-xl transition duration-200 disabled:opacity-40"
          title="Refresh Daily Digest"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RotateCw className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Body content */}
      <div>
        {loading ? (
          <div className="py-4 flex flex-col items-center justify-center space-y-2">
            <Loader2 className="w-5 h-5 text-rose-500 animate-spin" />
            <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">
              Consulting Supervisor...
            </span>
          </div>
        ) : error ? (
          <div className="text-xs text-rose-400 bg-rose-950/20 border border-rose-500/10 rounded-xl p-3">
            {error}
          </div>
        ) : (
          <div className="bg-slate-950/55 rounded-2xl p-4 border border-slate-800/50">
            {/* Digest text */}
            <p className="text-sm font-medium text-slate-200 leading-relaxed font-sans italic">
              "{digestText}"
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

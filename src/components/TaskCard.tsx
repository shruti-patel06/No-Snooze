import React from "react";
import { Task, Subtask } from "../types";
import {
  Calendar,
  CheckSquare,
  Square,
  AlertTriangle,
  Flame,
  Trash2,
  BellRing,
  HelpCircle,
  Skull,
  TrendingUp
} from "lucide-react";

interface TaskCardProps {
  key?: any;
  task: Task;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onSimulateEscalation: (taskId: string, level: "none" | "early" | "close" | "critical") => void;
  onIncrementIgnore: (taskId: string) => void;
  onDelete: (taskId: string) => void;
}

export default function TaskCard({
  task,
  onToggleSubtask,
  onSimulateEscalation,
  onIncrementIgnore,
  onDelete,
}: TaskCardProps) {
  const completedCount = task.subtasks.filter((s) => s.completed).length;
  const totalCount = task.subtasks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Formatting helper
  const formatDeadline = (dlStr: string) => {
    try {
      const d = new Date(dlStr);
      return d.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dlStr;
    }
  };

  // Check if deadline is past
  const isPastDeadline = new Date(task.deadline).getTime() < Date.now();

  return (
    <div
      id={`task_card_${task.id}`}
      className={`border rounded-2xl p-6 transition-all duration-300 shadow-lg relative overflow-hidden ${
        task.status === "completed"
          ? "bg-emerald-950/10 border-emerald-500/30"
          : task.escalationLevel === "critical"
          ? "bg-rose-950/20 border-rose-500/40 animate-pulse"
          : task.escalationLevel === "close"
          ? "bg-amber-950/20 border-amber-500/40"
          : "bg-slate-900/40 border-slate-800"
      }`}
    >
      {/* Decorative vertical colored side band */}
      <div
        className={`absolute top-0 left-0 w-1.5 h-full ${
          task.status === "completed"
            ? "bg-emerald-500"
            : task.escalationLevel === "critical"
            ? "bg-rose-500"
            : task.escalationLevel === "close"
            ? "bg-amber-500"
            : "bg-slate-700"
        }`}
      />

      {/* Header section */}
      <div className="flex justify-between items-start gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                task.status === "completed"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : task.escalationLevel === "critical"
                  ? "bg-rose-500/10 text-rose-400"
                  : task.escalationLevel === "close"
                  ? "bg-amber-500/10 text-amber-400"
                  : "bg-rose-600/10 text-rose-400 border border-rose-500/20"
              }`}
            >
              {task.status === "completed"
                ? "Goal Accomplished"
                : `Escalation: ${task.escalationLevel}`}
            </span>
            {task.ignoreCount > 0 && (
              <span className="text-[10px] bg-rose-500/20 text-rose-300 font-mono px-2 py-0.5 rounded-full">
                Ignored {task.ignoreCount}x
              </span>
            )}
          </div>
          <h3 className="text-lg font-display font-semibold text-white tracking-tight">
            {task.goal}
          </h3>
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
            <Calendar className="w-3.5 h-3.5" />
            <span className={isPastDeadline && task.status !== "completed" ? "text-rose-400 font-bold" : ""}>
              Deadline: {formatDeadline(task.deadline)}
              {isPastDeadline && task.status !== "completed" && " (Overdue)"}
            </span>
          </div>
        </div>

        <button
          onClick={() => onDelete(task.id)}
          className="text-slate-500 hover:text-rose-400 p-1.5 hover:bg-slate-950 rounded-lg transition"
          title="Delete Goal"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Progress slider */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-slate-400 mb-1.5 font-medium">
          <span>Sub-tasks Progress</span>
          <span>
            {completedCount}/{totalCount} ({progressPercent}%)
          </span>
        </div>
        <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              task.status === "completed"
                ? "bg-emerald-500"
                : task.escalationLevel === "critical"
                ? "bg-gradient-to-r from-rose-600 to-rose-400"
                : "bg-gradient-to-r from-rose-500 to-amber-500"
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Subtasks checklists */}
      <div className="space-y-2 mb-6">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Committed Agenda</h4>
        {task.subtasks.map((sub) => (
          <button
            key={sub.id}
            onClick={() => onToggleSubtask(task.id, sub.id)}
            disabled={task.status === "completed"}
            className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
              sub.completed
                ? "bg-slate-950/50 border-emerald-500/10 text-slate-500 line-through"
                : "bg-slate-950 border-slate-800 hover:border-rose-500/30 text-slate-200"
            }`}
          >
            <div className="mt-0.5 flex-shrink-0">
              {sub.completed ? (
                <CheckSquare className="w-4 h-4 text-emerald-400" />
              ) : (
                <Square className="w-4 h-4 text-slate-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{sub.title}</p>
              {sub.scheduledTime && (
                <span className="text-[10px] text-rose-400/80 font-mono block mt-0.5">
                  Scheduled: {sub.scheduledTime}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Escalation Simulation Panel */}
      {task.status !== "completed" && (
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 mt-4">
          <div className="flex items-center gap-1.5 text-xs font-bold text-rose-400 uppercase tracking-wider mb-3">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Interactive Simulator Console</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              onClick={() => onSimulateEscalation(task.id, "early")}
              className={`px-2.5 py-2 text-[10px] font-bold rounded-lg border flex items-center justify-center gap-1.5 transition ${
                task.escalationLevel === "early"
                  ? "bg-rose-600 text-white border-rose-600"
                  : "bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-850"
              }`}
            >
              <BellRing className="w-3 h-3" />
              <span>1. Early</span>
            </button>

            <button
              onClick={() => onSimulateEscalation(task.id, "close")}
              className={`px-2.5 py-2 text-[10px] font-bold rounded-lg border flex items-center justify-center gap-1.5 transition ${
                task.escalationLevel === "close"
                  ? "bg-amber-600 text-white border-amber-600 animate-pulse"
                  : "bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-850"
              }`}
            >
              <HelpCircle className="w-3 h-3" />
              <span>2. Close</span>
            </button>

            <button
              onClick={() => onSimulateEscalation(task.id, "critical")}
              className={`px-2.5 py-2 text-[10px] font-bold rounded-lg border flex items-center justify-center gap-1.5 transition ${
                task.escalationLevel === "critical"
                  ? "bg-rose-600 text-white border-rose-600"
                  : "bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-850"
              }`}
            >
              <Skull className="w-3 h-3" />
              <span>3. Takeover</span>
            </button>

            <button
              onClick={() => onIncrementIgnore(task.id)}
              className="px-2.5 py-2 text-[10px] font-bold rounded-lg border bg-slate-900 text-rose-400 border-slate-800 hover:bg-rose-950/20 flex items-center justify-center gap-1.5 transition"
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Ignore</span>
            </button>
          </div>
          <p className="text-[10px] text-slate-500 italic mt-2.5 text-center">
            Click step 1, 2, or 3 to test the AI escalating accountability logic instantly.
          </p>
        </div>
      )}
    </div>
  );
}

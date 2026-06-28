import React, { useMemo } from "react";
import { motion } from "motion/react";
import { Target, CheckCircle2, Circle, Flame, Calendar, Award, BarChart3, Clock } from "lucide-react";
import { Task } from "../types";

interface GoalProgressOverviewProps {
  tasks: Task[];
}

export default function GoalProgressOverview({ tasks }: GoalProgressOverviewProps) {
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  // 1. High-level Contract Stats
  const finishedGoals = useMemo(() => tasks.filter((t) => t.status === "completed").length, [tasks]);
  const totalGoals = tasks.length;
  const remainingGoals = totalGoals - finishedGoals;

  // 2. Subtask Level Stats (Total)
  const allSubtasks = useMemo(() => tasks.flatMap((t) => t.subtasks), [tasks]);
  const finishedSubtasks = useMemo(() => allSubtasks.filter((s) => s.completed).length, [allSubtasks]);
  const totalSubtasksCount = allSubtasks.length;
  const remainingSubtasks = totalSubtasksCount - finishedSubtasks;

  // 3. Today's Workload & Progress
  const todayWorkload = useMemo(() => {
    let completed = 0;
    let total = 0;
    const items: Array<{ title: string; goalTitle: string; completed: boolean }> = [];

    tasks.forEach((task) => {
      // Include all subtasks of goals that are active/at-risk/pending
      task.subtasks.forEach((sub) => {
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
          total++;
          if (sub.completed) {
            completed++;
          }
          items.push({
            title: sub.title,
            goalTitle: task.goal,
            completed: sub.completed,
          });
        }
      });
    });

    const percent = total > 0 ? Math.round((completed / total) * 100) : 100;
    return { completed, total, percent, items };
  }, [tasks, todayStr]);

  // Overall Goal Completion Rate
  const overallCompletionRate = totalGoals > 0 ? Math.round((finishedGoals / totalGoals) * 100) : 0;

  return (
    <motion.div
      id="goal_progress_overview_container"
      initial={{ opacity: 0, y: -15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="grid grid-cols-1 md:grid-cols-3 gap-5"
    >
      {/* CARD 1: CONTRACTS & GOALS */}
      <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur-md rounded-3xl p-5 shadow-xl relative overflow-hidden flex flex-col justify-between">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-500 to-pink-500 opacity-80" />
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400">
                <Target className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Accountability Contracts</h3>
            </div>
            <span className="text-[10px] font-mono text-rose-400 font-extrabold bg-rose-500/10 px-2 py-0.5 rounded-full">
              {overallCompletionRate}% Rate
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-white">{finishedGoals}</span>
            <span className="text-sm font-semibold text-slate-500">/ {totalGoals} Goals Done</span>
          </div>

          {/* Simple visualization bar */}
          <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-rose-500 to-pink-500 transition-all duration-1000 ease-out" 
              style={{ width: `${totalGoals > 0 ? (finishedGoals / totalGoals) * 100 : 0}%` }}
            />
          </div>
        </div>

        <div className="pt-3 border-t border-slate-800/40 mt-4 flex justify-between items-center text-[10px] text-slate-500 font-mono">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500/80" /> {finishedGoals} Completed
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500/80" /> {remainingGoals} In Progress
          </span>
        </div>
      </div>

      {/* CARD 2: TODAY'S WORKLOAD */}
      <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur-md rounded-3xl p-5 shadow-xl relative overflow-hidden flex flex-col justify-between">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-orange-500 opacity-80" />
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
                <Calendar className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 font-sans">Today's Workload</h3>
            </div>
            <span className="text-[10px] font-mono text-amber-400 font-extrabold bg-amber-500/10 px-2 py-0.5 rounded-full">
              {todayWorkload.percent}% Completed
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-white">{todayWorkload.completed}</span>
            <span className="text-sm font-semibold text-slate-500">/ {todayWorkload.total} Scheduled Today</span>
          </div>

          {/* Simple visualization bar */}
          <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-1000 ease-out" 
              style={{ width: `${todayWorkload.percent}%` }}
            />
          </div>
        </div>

        <div className="pt-3 border-t border-slate-800/40 mt-4 flex justify-between items-center text-[10px] text-slate-500 font-mono">
          {todayWorkload.total > 0 ? (
            <>
              <span className="text-slate-400">
                {todayWorkload.total - todayWorkload.completed} remaining tasks for today
              </span>
              <span className="text-amber-400 font-bold">
                {todayWorkload.completed === todayWorkload.total ? "All Clear!" : "On Track"}
              </span>
            </>
          ) : (
            <span className="text-slate-500 italic text-center w-full">
              No tasks scheduled for today
            </span>
          )}
        </div>
      </div>

      {/* CARD 3: AGGREGATE ACTION PERFORMANCE */}
      <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur-md rounded-3xl p-5 shadow-xl relative overflow-hidden flex flex-col justify-between">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-indigo-500 opacity-80" />
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-purple-500/10 border border-purple-500/20 rounded-xl text-purple-400">
                <BarChart3 className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Aggregate Actions</h3>
            </div>
            <span className="text-[10px] font-mono text-purple-400 font-extrabold bg-purple-500/10 px-2 py-0.5 rounded-full">
              {totalSubtasksCount > 0 ? Math.round((finishedSubtasks / totalSubtasksCount) * 100) : 0}% Done
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-white">{finishedSubtasks}</span>
            <span className="text-sm font-semibold text-slate-500">/ {totalSubtasksCount} Subtasks Completed</span>
          </div>

          {/* Simple visualization bar */}
          <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-1000 ease-out" 
              style={{ width: `${totalSubtasksCount > 0 ? (finishedSubtasks / totalSubtasksCount) * 100 : 0}%` }}
            />
          </div>
        </div>

        <div className="pt-3 border-t border-slate-800/40 mt-4 flex justify-between items-center text-[10px] text-slate-500 font-mono">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" /> {finishedSubtasks} Done
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-slate-500" /> {remainingSubtasks} Remaining
          </span>
        </div>
      </div>
    </motion.div>
  );
}

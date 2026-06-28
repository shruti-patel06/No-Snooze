import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini Client Lazily/Safely
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required. Please set it in Settings > Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// API Routes

// 1. Goal Decomposition into sub-tasks with structured JSON
app.post("/api/decompose", async (req, res) => {
  try {
    const { goal, deadline, currentLocalTime, localDateStr, localTimeStr, existingEvents } = req.body;
    if (!goal) {
      return res.status(400).json({ error: "Goal/prompt is required" });
    }

    const ai = getGeminiClient();
    const prompt = `You are NoSnooze AI Planner, a high-fidelity scheduling assistant.
Analyze the user's natural language goal and optional deadline.
User Input/Prompt: "${goal}"
Optional Manual/Strict Deadline: "${deadline || "None"}"
Current user local time: "${currentLocalTime || new Date().toISOString()}".
User's Exact Local Date (Today): "${localDateStr || "Unknown"}"
User's Exact Local Time: "${localTimeStr || "Unknown"}"

CRITICAL SCHEDULING RULES:
1. Today's date is "${localDateStr || "Unknown"}".
2. "dayOffset: 0" refers to today: ${localDateStr || "Unknown"}. All dayOffset: 0 sub-tasks MUST be scheduled on or after today's date (${localDateStr || "Unknown"}).
3. Never schedule any sub-task in the past! Every calculated 'scheduledTime' MUST be set to a future date and time (greater than or equal to "${localDateStr || "Unknown"} ${localTimeStr || "00:00"}").
4. If today is Monday (e.g. June 29), any task for today MUST have a schedule date of June 29, not June 28.

Your tasks:
1. **Identify Goal and Deadline**:
   - Extract the core task/goal from the user input (e.g., "Finish my DBMS assignment").
   - Extract or infer the deadline. If the user specified a deadline in natural language (e.g. "by tomorrow at 5pm", "by friday midnight", "next Monday morning"), calculate the absolute ISO-8601 deadline timestamp based on the provided current user local time (${currentLocalTime || new Date().toISOString()}).
   - If no deadline is mentioned in the prompt and no manual deadline is provided, assume a default deadline of exactly 48 hours from the current user local time.
   - Output the parsed goal as 'parsedGoal' and the calculated deadline as 'parsedDeadline' (ISO-8601 string).

2. **Decompose into Sub-Tasks**:
   - Break the parsed goal down into 3 to 5 sequential, realistic, concrete sub-tasks.
   - For each sub-task, estimate the duration in minutes ('durationMinutes').
   - Estimate which relative day (dayOffset: 0 for today, 1 for tomorrow, etc.) the sub-task should be completed. All sub-tasks must be scheduled BEFORE the parsed deadline!

3. **Schedule Sub-Tasks into Real Free Slots (Calendar Integration)**:
   - The user has the following busy calendar intervals (existing events) for the next 7 days: ${JSON.stringify(existingEvents || [])}.
   - Find a real free slot for each sub-task based on its sequential order, dayOffset, and preferred time of day (morning: 09:00-12:00, afternoon: 13:00-17:00, evening: 18:00-21:00).
   - The slot MUST NOT overlap with any of the user's busy intervals, sleep times (22:00 to 07:00), or other sub-tasks.
   - Assign the exact start time to the sub-task as 'scheduledTime' in format 'YYYY-MM-DD HH:mm'.
   - If no busy slots are provided or if calendar is empty, schedule the sub-tasks in standard free hours for the day (e.g. Day 0 morning at 10:00, Day 1 afternoon at 14:00, etc.) that fit the dayOffset and suggestedTimeOfDay.

Return the result as a structured JSON object.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["parsedGoal", "parsedDeadline", "subtasks"],
          properties: {
            parsedGoal: { type: Type.STRING, description: "The parsed core goal text." },
            parsedDeadline: { type: Type.STRING, description: "The calculated deadline in ISO-8601 format." },
            subtasks: {
              type: Type.ARRAY,
              description: "Sequential concrete steps to achieve the goal scheduled in free slots.",
              items: {
                type: Type.OBJECT,
                required: ["title", "durationMinutes", "dayOffset", "suggestedTimeOfDay", "scheduledTime"],
                properties: {
                  title: { type: Type.STRING },
                  durationMinutes: { type: Type.INTEGER },
                  dayOffset: { type: Type.INTEGER },
                  suggestedTimeOfDay: { 
                    type: Type.STRING,
                    enum: ["morning", "afternoon", "evening"]
                  },
                  scheduledTime: { 
                    type: Type.STRING, 
                    description: "Calculated free slot start time in YYYY-MM-DD HH:mm format." 
                  }
                }
              }
            }
          }
        }
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("Empty response from Gemini API");
    }

    const parsed = JSON.parse(text);
    res.json(parsed);
  } catch (error: any) {
    console.error("Error in /api/decompose:", error);
    res.status(500).json({ error: error.message || "Failed to decompose goal" });
  }
});

// 2. Goal replanning based on blocker answers
app.post("/api/replan", async (req, res) => {
  try {
    const { goal, deadline, currentLocalTime, localDateStr, localTimeStr, blocker, remainingSubtasks, existingEvents } = req.body;
    if (!goal || !blocker) {
      return res.status(400).json({ error: "Goal and blocker are required" });
    }

    const ai = getGeminiClient();
    const prompt = `The user is trying to complete their goal: "${goal}" by deadline: "${deadline}".
Remaining uncompleted sub-tasks are: ${JSON.stringify(remainingSubtasks)}.
The user was blocked or interrupted and explained: "${blocker}".
Current user local time: "${currentLocalTime || new Date().toISOString()}".
User's Exact Local Date (Today): "${localDateStr || "Unknown"}"
User's Exact Local Time: "${localTimeStr || "Unknown"}"

CRITICAL RE-SCHEDULING RULES:
1. Today's date is "${localDateStr || "Unknown"}".
2. "dayOffset: 0" refers to today: ${localDateStr || "Unknown"}. All dayOffset: 0 sub-tasks MUST be scheduled on or after today's date (${localDateStr || "Unknown"}).
3. Never schedule any replanned sub-task in the past! Every calculated 'scheduledTime' MUST be set to a future date and time (greater than or equal to "${localDateStr || "Unknown"} ${localTimeStr || "00:00"}").
4. If today is Monday (e.g. June 29), any task for today MUST have a schedule date of June 29, not June 28.

Please act as an encouraging, firm, and strategic accountability agent.
Reprioritize, adjust, or replan the remaining sub-tasks (shrink scope or adapt durations if necessary) to help them still hit their deadline or minimize delays.

Your tasks:
1. **Explain the Strategy (reasoning)**: Provide a brief, supportive, and motivating explanation analyzing their blocker and advising them on how to overcome it.
2. **Re-Schedule remaining sub-tasks in real free slots**:
   - The user has these busy intervals: ${JSON.stringify(existingEvents || [])}.
   - Find a real free slot for each replanned sub-task that fits its dayOffset and sequential order.
   - The slot MUST NOT overlap with sleep hours (22:00 to 07:00), other busy events, or each other.
   - Assign the exact start time to each replanned sub-task as 'scheduledTime' in 'YYYY-MM-DD HH:mm' format.
   - If no calendar events are provided, schedule them in reasonable daytime intervals (e.g. Day 0 afternoon at 14:00, etc.).

Provide:
- reasoning: Analysis of blocker, encouragement, and logic of the replan.
- subtasks: Updated list of remaining sub-tasks with adjusted estimates, dayOffsets, suggested times, and calculated 'scheduledTime' slots.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["reasoning", "subtasks"],
          properties: {
            reasoning: { 
              type: Type.STRING, 
              description: "Analysis of blocker, encouragement, and logic of the replan." 
            },
            subtasks: {
              type: Type.ARRAY,
              description: "Replanned remaining tasks.",
              items: {
                type: Type.OBJECT,
                required: ["title", "durationMinutes", "dayOffset", "suggestedTimeOfDay", "scheduledTime"],
                properties: {
                  title: { type: Type.STRING },
                  durationMinutes: { type: Type.INTEGER },
                  dayOffset: { type: Type.INTEGER },
                  suggestedTimeOfDay: { 
                    type: Type.STRING,
                    enum: ["morning", "afternoon", "evening"]
                  },
                  scheduledTime: { 
                    type: Type.STRING, 
                    description: "Calculated free slot start time in YYYY-MM-DD HH:mm format." 
                  }
                }
              }
            }
          }
        }
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("Empty response from Gemini API");
    }

    const parsed = JSON.parse(text);
    res.json(parsed);
  } catch (error: any) {
    console.error("Error in /api/replan:", error);
    res.status(500).json({ error: error.message || "Failed to replan goal" });
  }
});

// 3. Escalating check-in message generation
app.post("/api/generate-checkin", async (req, res) => {
  try {
    const { goal, escalationLevel, ignoreCount, blocker, currentStreak } = req.body;
    if (!goal || !escalationLevel) {
      return res.status(400).json({ error: "Goal and escalationLevel are required" });
    }

    const ai = getGeminiClient();
    
    let tonePrompt = "";
    if (escalationLevel === "early") {
      tonePrompt = "Friendly, encouraging, proactive reminder. Help them get started or stay on track with a helpful suggestion.";
    } else if (escalationLevel === "close") {
      tonePrompt = "Urgent, direct, questioning. The user is running behind and must answer a direct accountability question: 'What is blocking you?'. Generate a custom version of this question tailored specifically to their goal and possible procrastination traps.";
    } else if (escalationLevel === "critical") {
      tonePrompt = "Takeover alert style. Strict, warning, highlighting serious stakes. Emphasize that their completion streak of ${currentStreak} is at risk, and failure is looming if they don't take action immediately. Emphasize the exact goal.";
    }

    const prompt = `Generate a single short, impactful message for a user working on goal: "${goal}".
Escalation level: "${escalationLevel}"
User streak: ${currentStreak}
Number of times ignored: ${ignoreCount}
Previous blocker response (if any): "${blocker || 'None'}"

Instructions:
Generate a message according to these guidelines:
Tone: ${tonePrompt}
Keep the message concise (maximum 3 sentences) and highly customized. For "close" level, ask a specific blocking question that fits the goal.
Return as structured JSON containing 'message'.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["message"],
          properties: {
            message: { 
              type: Type.STRING, 
              description: "The custom escalating notification or takeover message." 
            }
          }
        }
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("Empty response from Gemini API");
    }

    const parsed = JSON.parse(text);
    res.json(parsed);
  } catch (error: any) {
    console.error("Error in /api/generate-checkin:", error);
    res.status(500).json({ error: error.message || "Failed to generate check-in message" });
  }
});

// 4. Daily digest generation with Gemini
app.post("/api/daily-digest", async (req, res) => {
  try {
    const { pendingSubtasks, userName } = req.body;
    const ai = getGeminiClient();
    const name = userName || "Friend";
    
    let prompt = "";
    if (!pendingSubtasks || pendingSubtasks.length === 0) {
      prompt = `Act as an encouraging but high-accountability morning coach. 
The user's name is "${name}".
The user has NO pending subtasks scheduled for today. 
Provide a quick, punchy, and motivating morning message (strictly 1-2 short sentences) written in friendly Hinglish (Hindi words written in the English alphabet, blended with English). e.g., "Namaste ${name}, aaj ka schedule khali hai! Chaho to thoda relax karo ya phir naya goal set karo." Keep it short, warm, and inspiring.`;
    } else {
      prompt = `Act as an encouraging but high-accountability morning coach.
The user's name is "${name}".
The user has the following pending subtasks scheduled for today:
${pendingSubtasks.map((st: any, i: number) => `- Subtask: "${st.title}" (Belongs to Goal: "${st.goalTitle}"${st.suggestedTimeOfDay ? `, scheduled for: ${st.suggestedTimeOfDay}` : ""})`).join("\n")}

Provide a quick, motivating, and highly specific daily digest (strictly 1-2 short sentences).
The response MUST be written in natural and motivating Hinglish (Hindi written using the English alphabet, like "Aapke paas aaj ${pendingSubtasks.length} subtasks hain, chalo jaldi se bina delay kiye start karte hain!").
Acknowledge today's tasks directly, keep it extremely short and personalized to "${name}".`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["digestText"],
          properties: {
            digestText: {
              type: Type.STRING,
              description: "The custom morning motivation text or daily digest in transliterated Hindi (Hinglish)."
            }
          }
        }
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("Empty response from Gemini API");
    }

    const parsed = JSON.parse(text);
    res.json(parsed);
  } catch (error: any) {
    console.error("Error in /api/daily-digest:", error);
    res.status(500).json({ error: error.message || "Failed to generate daily digest" });
  }
});

// Vite Middleware & Static Asset Serving Setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

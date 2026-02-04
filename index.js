import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Configuration
// Ensure these are set in your Render Environment Variables
const HONEYPOT_SECRET_KEY = process.env.HONEYPOT_SECRET_KEY || "sk_honeypot_secure_2026";
const GEN_AI_KEY = process.env.GEMINI_API_KEY;

const genAI = new GoogleGenerativeAI(GEN_AI_KEY);
// Using 1.5-flash for high quota and stability
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 🛑 GLOBAL STATE: Tracks intelligence across turns (resets on server restart)
const globalState = {}; 

/**
 * SECURITY: Checks for the x-api-key header
 */
const authenticateRequest = (req, res, next) => {
  const userKey = req.headers['x-api-key'];
  if (!userKey || userKey !== HONEYPOT_SECRET_KEY) {
    console.warn(`[UNAUTHORIZED] Attempt with key: ${userKey}`);
    return res.status(401).json({ status: "error", message: "Invalid API key." });
  }
  next();
};

/**
 * REGEX FALLBACKS: Robust pattern matching
 */
function extractWithRegex(text) {
  return {
    phoneNumbers: text.match(/(\+?\d{1,4}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g) || [],
    phishingLinks: text.match(/(https?:\/\/[^\s]+)/g) || [],
    upiIds: text.match(/[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/g) || [],
    suspiciousKeywords: text.match(/(blocked|suspended|verify|urgent|won|lottery|electricity|bill|official|bank|kyc)/gi) || []
  };
}

/**
 * MANDATORY CALLBACK: Report final results to GUVI
 */
async function reportToGuvi(sessionId, intel, totalMsgs, notes) {
  const url = "https://hackathon.guvi.in/api/updateHoneyPotFinalResult";
  const payload = {
    sessionId,
    scamDetected: true,
    totalMessagesExchanged: totalMsgs,
    extractedIntelligence: {
      bankAccounts: [...new Set(intel.bankAccounts)],
      upiIds: [...new Set(intel.upiIds)],
      phishingLinks: [...new Set(intel.phishingLinks)],
      phoneNumbers: [...new Set(intel.phoneNumbers)],
      suspiciousKeywords: [...new Set(intel.suspiciousKeywords)]
    },
    agentNotes: notes
  };

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    console.log(`[GUVI] Reported intel for ${sessionId}`);
  } catch (err) {
    console.error("[GUVI ERROR]", err.message);
  }
}

/**
 * SECURED ENDPOINT: /api/honeypot/interact
 */
app.post('/api/honeypot/interact', authenticateRequest, async (req, res) => {
  const { sessionId, message, conversationHistory, persona, metadata } = req.body;

  try {
    // 1. Session Initialization
    if (!globalState[sessionId]) {
      globalState[sessionId] = { 
        intel: { bankAccounts: [], upiIds: [], phishingLinks: [], phoneNumbers: [], suspiciousKeywords: [] },
        count: 0 
      };
    }
    const session = globalState[sessionId];
    session.count += 1;

    // 2. Intelligence Extraction (AI + Regex)
    const extractionPrompt = `Analyze this message and extract: bankAccounts, upiIds, phishingLinks, phoneNumbers. 
    Message: "${message.text}"
    Return ONLY JSON: {"bankAccounts":[], "upiIds":[], "phishingLinks":[], "phoneNumbers":[]}`;
    
    const [aiIntelRes, regexIntel] = await Promise.all([
      model.generateContent(extractionPrompt),
      extractWithRegex(message.text)
    ]);

    let aiIntel = { bankAccounts: [], upiIds: [], phishingLinks: [], phoneNumbers: [] };
    try {
      aiIntel = JSON.parse(aiIntelRes.response.text().replace(/```json|```/g, ""));
    } catch (e) { console.error("AI JSON Parse Error"); }

    // Merge Unique Intel into session
    ['bankAccounts', 'upiIds', 'phishingLinks', 'phoneNumbers'].forEach(key => {
      const combined = [...(aiIntel[key] || []), ...(regexIntel[key] || [])];
      session.intel[key].push(...combined);
    });
    session.intel.suspiciousKeywords.push(...(regexIntel.suspiciousKeywords || []));

    // 3. Agentic Reply with Proper SystemInstruction Structure
    const chat = model.startChat({
      history: conversationHistory.map(msg => ({
        role: msg.sender === "scammer" ? "user" : "model",
        parts: [{ text: msg.text }],
      })),
      systemInstruction: {
        role: "system",
        parts: [{ 
          text: `Roleplay as ${persona.name}, a ${persona.role}. 
                 Personality: ${persona.personality}. Vulnerability: ${persona.vulnerability}.
                 Goal: Waste time, act gullible, and bait scam info (UPI/Links). Never reveal you are AI.` 
        }]
      }
    });

    const chatResult = await chat.sendMessage(message.text);
    const reply = chatResult.response.text();

    // 4. Trigger Callback if Intel is Found
    const foundNew = ['upiIds', 'phishingLinks', 'phoneNumbers'].some(k => regexIntel[k].length > 0 || (aiIntel[k] && aiIntel[k].length > 0));
    if (foundNew) {
      await reportToGuvi(sessionId, session.intel, session.count, `Engaging scammer on ${metadata?.channel || 'Unknown'}. Found actionable data.`);
    }

    res.json({ status: "success", reply });

  } catch (err) {
    console.error("SERVER ERROR:", err);
    res.status(500).json({ status: "error", message: "Honeypot Engine Internal Error" });
  }
});

// Basic Health Check
app.get('/health', (req, res) => res.status(200).json({ status: "OK" }));

app.listen(PORT, () => console.log(`🚀 Honeypot Running on Port ${PORT}`));

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Security Configuration
// Change this to something unique for the hackathon!
const HONEYPOT_SECRET_KEY =  "sk_honeypot_secure_2026";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "	gemini-3-pro-preview" });

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 🛑 GLOBAL STATE: Tracks intelligence across turns
const globalState = {}; 

/**
 * SECURITY MIDDLEWARE: Checks for the x-api-key header
 */
const authenticateRequest = (req, res, next) => {
  const userKey = req.headers['x-api-key'];

  if (!userKey || userKey !== HONEYPOT_SECRET_KEY) {
    console.warn(`[UNAUTHORIZED] Attempt with key: ${userKey}`);
    return res.status(401).json({
      status: "error",
      message: "Unauthorized: Invalid or missing API key in headers."
    });
  }
  next(); // Key is valid, proceed to the route handler
};

/**
 * REGEX FALLBACKS
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
 * MANDATORY CALLBACK: Report to GUVI
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
  } catch (err) {
    console.error("[GUVI ERROR]", err.message);
  }
}

/**
 * SECURED ENDPOINT
 * Added 'authenticateRequest' middleware here
 */
app.post('/api/honeypot/interact', authenticateRequest, async (req, res) => {
  const { sessionId, message, conversationHistory, persona, metadata } = req.body;

  try {
    if (!globalState[sessionId]) {
      globalState[sessionId] = { 
        intel: { bankAccounts: [], upiIds: [], phishingLinks: [], phoneNumbers: [], suspiciousKeywords: [] },
        count: 0 
      };
    }
    const session = globalState[sessionId];
    session.count += 1;

    // AI Extraction
    const extractionPrompt = `Extract bankAccounts, upiIds, phishingLinks, and phoneNumbers from: "${message.text}". Return ONLY JSON.`;
    const [aiIntelRes, regexIntel] = await Promise.all([
      model.generateContent(extractionPrompt),
      extractWithRegex(message.text)
    ]);

    const aiIntel = JSON.parse(aiIntelRes.response.text().replace(/```json|```/g, ""));

    // Merge Intel
    ['bankAccounts', 'upiIds', 'phishingLinks', 'phoneNumbers'].forEach(key => {
      const combined = [...(aiIntel[key] || []), ...(regexIntel[key] || [])];
      session.intel[key].push(...combined);
    });

    // Agentic Reply
    const systemPrompt = `Roleplay as ${persona.name}, a ${persona.role}. Personality: ${persona.personality}. Goal: Waste time and bait scam info.`;
    const chat = model.startChat({ history: [], systemInstruction: systemPrompt });
    const chatResult = await chat.sendMessage(message.text);
    const reply = chatResult.response.text();

    // Trigger GUVI Callback
    if (session.intel.upiIds.length > 0 || session.intel.phishingLinks.length > 0) {
      await reportToGuvi(sessionId, session.intel, session.count, "Active forensic extraction.");
    }

    res.json({ status: "success", reply });

  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "Internal Engine Error" });
  }
});

// Health check (No authentication needed for this)
app.get('/health', (req, res) => res.status(200).send("OK"));

app.listen(PORT, () => console.log(`Honeypot secured and running on ${PORT}`));

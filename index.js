import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
const PORT = process.env.PORT || 3000;


const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-flash-preview" });

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const globalState = {}; 


function extractWithRegex(text) {
  return {
    phoneNumbers: text.match(/(\+?\d{1,4}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g) || [],
    phishingLinks: text.match(/(https?:\/\/[^\s]+)/g) || [],
    upiIds: text.match(/[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/g) || [],
    // Add common high-risk keywords
    suspiciousKeywords: text.match(/(blocked|suspended|verify|urgent|won|lottery|electricity|bill|official|bank|kyc)/gi) || []
  };
}

async function reportToGuvi(sessionId, intel, totalMsgs, notes) {
  const url = "https://hackathon.guvi.in/api/updateHoneyPotFinalResult";
  const payload = {
    sessionId,
    scamDetected: true,
    totalMessagesExchanged: totalMsgs,
    extractedIntelligence: {
      bankAccounts: [...new Set(intel.bankAccounts)], // Unique values only
      upiIds: [...new Set(intel.upiIds)],
      phishingLinks: [...new Set(intel.phishingLinks)],
      phoneNumbers: [...new Set(intel.phoneNumbers)],
      suspiciousKeywords: [...new Set(intel.suspiciousKeywords)]
    },
    agentNotes: notes || "Autonomous engagement active."
  };

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    console.log(`[GUVI] Reported intel for session: ${sessionId}`);
  } catch (err) {
    console.error("[GUVI ERROR]", err.message);
  }
}

/**
 * MAIN ENDPOINT
 */
app.post('/api/honeypot/interact', async (req, res) => {
  const { sessionId, message, conversationHistory, persona, metadata } = req.body;

  try {
    // 1. Init Session State
    if (!globalState[sessionId]) {
      globalState[sessionId] = { 
        intel: { bankAccounts: [], upiIds: [], phishingLinks: [], phoneNumbers: [], suspiciousKeywords: [] },
        count: 0,
        scamConfirmed: false
      };
    }
    const session = globalState[sessionId];
    session.count += 1;

    // 2. Intelligence Extraction (AI + Regex)
    const extractionPrompt = `Extract bank accounts, UPI IDs, phishing links, and phone numbers from: "${message.text}". 
    Format: JSON { "bankAccounts":[], "upiIds":[], "phishingLinks":[], "phoneNumbers":[], "keywords":[] }`;
    
    const [aiIntelRes, regexIntel] = await Promise.all([
      model.generateContent(extractionPrompt),
      extractWithRegex(message.text)
    ]);

    const aiIntel = JSON.parse(aiIntelRes.response.text().replace(/```json|```/g, ""));

    // Merge AI & Regex results into global state
    ['bankAccounts', 'upiIds', 'phishingLinks', 'phoneNumbers'].forEach(key => {
      const combined = [...(aiIntel[key] || []), ...(regexIntel[key] || [])];
      session.intel[key].push(...combined);
    });
    session.intel.suspiciousKeywords.push(...(regexIntel.suspiciousKeywords || []));

    // 3. Generate Agentic Response
    const systemPrompt = `
      You are an AI Honeypot acting as ${persona.name}, a ${persona.role}. 
      Personality: ${persona.personality}. 
      Task: Waste the scammer's time. Be human, slightly gullible, but keep them talking.
      Goal: Get them to send payment links or bank info.
    `;

    const chat = model.startChat({ history: [], systemInstruction: systemPrompt });
    const chatResult = await chat.sendMessage(message.text);
    const reply = chatResult.response.text();

    // 4. Mandatory Callback Trigger
    // We report every time new intel is found to ensure scoring
    const hasNewIntel = ['upiIds', 'phishingLinks', 'phoneNumbers'].some(k => regexIntel[k].length > 0 || (aiIntel[k] && aiIntel[k].length > 0));
    
    if (hasNewIntel) {
      await reportToGuvi(sessionId, session.intel, session.count, `Engaging scammer using ${metadata.channel} channel.`);
    }

    // 5. Final Response to Platform
    res.json({ status: "success", reply });

  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "Internal Engine Error" });
  }
});

app.listen(PORT, () => console.log(`🚀 Honeypot API live on port ${PORT}`));

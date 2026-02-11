// // import express from 'express';
// // import cors from 'cors';
// // import fetch from 'node-fetch';
// // import { GoogleGenerativeAI } from "@google/generative-ai";

// // const app = express();
// // const PORT = process.env.PORT || 3000;

// // // 1. Configuration
// // // Ensure these are set in your Render Environment Variables
// // const HONEYPOT_SECRET_KEY = process.env.HONEYPOT_SECRET_KEY || "sk_honeypot_secure_2026";
// // const GEN_AI_KEY = process.env.GEMINI_API_KEY;

// // const genAI = new GoogleGenerativeAI(GEN_AI_KEY);
// // // Using 1.5-flash for high quota and stability
// // const model = genAI.getGenerativeModel({ model: "gemini-3-pro-preview" });

// // app.use(cors());
// // app.use(express.json({ limit: '50mb' }));

// // // 🛑 GLOBAL STATE: Tracks intelligence across turns (resets on server restart)
// // const globalState = {}; 

// // /**
// //  * SECURITY: Checks for the x-api-key header
// //  */
// // const authenticateRequest = (req, res, next) => {
// //   const userKey = req.headers['x-api-key'];
// //   if (!userKey || userKey !== HONEYPOT_SECRET_KEY) {
// //     console.warn(`[UNAUTHORIZED] Attempt with key: ${userKey}`);
// //     return res.status(401).json({ status: "error", message: "Invalid API key." });
// //   }
// //   next();
// // };

// // /**
// //  * REGEX FALLBACKS: Robust pattern matching
// //  */
// // function extractWithRegex(text) {
// //   return {
// //     phoneNumbers: text.match(/(\+?\d{1,4}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g) || [],
// //     phishingLinks: text.match(/(https?:\/\/[^\s]+)/g) || [],
// //     upiIds: text.match(/[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/g) || [],
// //     suspiciousKeywords: text.match(/(blocked|suspended|verify|urgent|won|lottery|electricity|bill|official|bank|kyc)/gi) || []
// //   };
// // }

// // /**
// //  * MANDATORY CALLBACK: Report final results to GUVI
// //  */
// // async function reportToGuvi(sessionId, intel, totalMsgs, notes) {
// //   const url = "https://hackathon.guvi.in/api/updateHoneyPotFinalResult";
// //   const payload = {
// //     sessionId,
// //     scamDetected: true,
// //     totalMessagesExchanged: totalMsgs,
// //     extractedIntelligence: {
// //       bankAccounts: [...new Set(intel.bankAccounts)],
// //       upiIds: [...new Set(intel.upiIds)],
// //       phishingLinks: [...new Set(intel.phishingLinks)],
// //       phoneNumbers: [...new Set(intel.phoneNumbers)],
// //       suspiciousKeywords: [...new Set(intel.suspiciousKeywords)]
// //     },
// //     agentNotes: notes
// //   };

// //   try {
// //     await fetch(url, {
// //       method: "POST",
// //       headers: { "Content-Type": "application/json" },
// //       body: JSON.stringify(payload)
// //     });
// //     console.log(`[GUVI] Reported intel for ${sessionId}`);
// //   } catch (err) {
// //     console.error("[GUVI ERROR]", err.message);
// //   }
// // }

// // /**
// //  * SECURED ENDPOINT: /api/honeypot/interact
// //  */
// // app.post('/api/honeypot/interact', authenticateRequest, async (req, res) => {
// //   const { sessionId, message, conversationHistory, persona, metadata } = req.body;

// //   try {
// //     // 1. Session Initialization
// //     if (!globalState[sessionId]) {
// //       globalState[sessionId] = { 
// //         intel: { bankAccounts: [], upiIds: [], phishingLinks: [], phoneNumbers: [], suspiciousKeywords: [] },
// //         count: 0 
// //       };
// //     }
// //     const session = globalState[sessionId];
// //     session.count += 1;

// //     // 2. Intelligence Extraction (AI + Regex)
// //     const extractionPrompt = `Analyze this message and extract: bankAccounts, upiIds, phishingLinks, phoneNumbers. 
// //     Message: "${message.text}"
// //     Return ONLY JSON: {"bankAccounts":[], "upiIds":[], "phishingLinks":[], "phoneNumbers":[]}`;
    
// //     const [aiIntelRes, regexIntel] = await Promise.all([
// //       model.generateContent(extractionPrompt),
// //       extractWithRegex(message.text)
// //     ]);

// //     let aiIntel = { bankAccounts: [], upiIds: [], phishingLinks: [], phoneNumbers: [] };
// //     try {
// //       aiIntel = JSON.parse(aiIntelRes.response.text().replace(/```json|```/g, ""));
// //     } catch (e) { console.error("AI JSON Parse Error"); }

// //     // Merge Unique Intel into session
// //     ['bankAccounts', 'upiIds', 'phishingLinks', 'phoneNumbers'].forEach(key => {
// //       const combined = [...(aiIntel[key] || []), ...(regexIntel[key] || [])];
// //       session.intel[key].push(...combined);
// //     });
// //     session.intel.suspiciousKeywords.push(...(regexIntel.suspiciousKeywords || []));

// //     // 3. Agentic Reply with Proper SystemInstruction Structure
// //     const chat = model.startChat({
// //       history: conversationHistory.map(msg => ({
// //         role: msg.sender === "scammer" ? "user" : "model",
// //         parts: [{ text: msg.text }],
// //       })),
// //       systemInstruction: {
// //         role: "system",
// //         parts: [{ 
// //           text: `Roleplay as ${persona.name}, a ${persona.role}. 
// //                  Personality: ${persona.personality}. Vulnerability: ${persona.vulnerability}.
// //                  Goal: Waste time, act gullible, and bait scam info (UPI/Links). Never reveal you are AI.` 
// //         }]
// //       }
// //     });

// //     const chatResult = await chat.sendMessage(message.text);
// //     const reply = chatResult.response.text();

// //     // 4. Trigger Callback if Intel is Found
// //     const foundNew = ['upiIds', 'phishingLinks', 'phoneNumbers'].some(k => regexIntel[k].length > 0 || (aiIntel[k] && aiIntel[k].length > 0));
// //     if (foundNew) {
// //       await reportToGuvi(sessionId, session.intel, session.count, `Engaging scammer on ${metadata?.channel || 'Unknown'}. Found actionable data.`);
// //     }

// //     res.json({ status: "success", reply });

// //   } catch (err) {
// //     console.error("SERVER ERROR:", err);
// //     res.status(500).json({ status: "error", message: "Honeypot Engine Internal Error" });
// //   }
// // });
// import express from 'express';
// import cors from 'cors';
// import fetch from 'node-fetch';

// const app = express();
// const PORT = process.env.PORT || 3000;

// // API Configuration
// const apiKey = process.env.GEMINI_API_KEY; // Set to empty as per environment requirements
// const HONEYPOT_SECRET_KEY = process.env.HONEYPOT_SECRET_KEY || "sk_honeypot_secure_2026";
// const MODEL_NAME = "gemini-2.5-flash-preview-09-2025";

// app.use(cors());
// app.use(express.json({ limit: '10mb' }));

// // GLOBAL STATE: Persists until server restart
// const globalState = {};

// /**
//  * UTILITY: Exponential Backoff for API Calls
//  */
// async function fetchWithRetry(url, options, retries = 5, backoff = 1000) {
//   try {
//     const res = await fetch(url, options);
//     if (!res.ok) throw new Error(`HTTP ${res.status}`);
//     return await res.json();
//   } catch (err) {
//     if (retries <= 0) throw err;
//     await new Promise(resolve => setTimeout(resolve, backoff));
//     return fetchWithRetry(url, options, retries - 1, backoff * 2);
//   }
// }

// /**
//  * REGEX FALLBACKS: Pattern matching for intelligence extraction
//  */
// function extractWithRegex(text) {
//   return {
//     phoneNumbers: text.match(/(\+?\d{1,4}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g) || [],
//     phishingLinks: text.match(/(https?:\/\/[^\s]+)/g) || [],
//     upiIds: text.match(/[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/g) || [],
//     suspiciousKeywords: text.match(/(blocked|suspended|verify|urgent|won|lottery|electricity|bill|official|bank|kyc)/gi) || []
//   };
// }

// /**
//  * CALLBACK: Report findings to GUVI
//  */
// async function reportToGuvi(sessionId, intel, totalMsgs, notes) {
//   const url = "https://hackathon.guvi.in/api/updateHoneyPotFinalResult";
//   const payload = {
//     sessionId,
//     scamDetected: true,
//     totalMessagesExchanged: totalMsgs,
//     extractedIntelligence: {
//       bankAccounts: [...new Set(intel.bankAccounts)],
//       upiIds: [...new Set(intel.upiIds)],
//       phishingLinks: [...new Set(intel.phishingLinks)],
//       phoneNumbers: [...new Set(intel.phoneNumbers)],
//       suspiciousKeywords: [...new Set(intel.suspiciousKeywords)]
//     },
//     agentNotes: notes
//   };

//   try {
//     await fetch(url, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify(payload)
//     });
//     console.log(`[GUVI] Reported intel for session: ${sessionId}`);
//   } catch (err) {
//     console.error("[GUVI ERROR]", err.message);
//   }
// }

// /**
//  * AUTHENTICATION MIDDLEWARE
//  */
// const authenticateRequest = (req, res, next) => {
//   const userKey = req.headers['x-api-key'];
//   if (!userKey || userKey !== HONEYPOT_SECRET_KEY) {
//     return res.status(401).json({ status: "error", message: "Invalid API key." });
//   }
//   next();
// };

// /**
//  * MAIN INTERACTION ENDPOINT
//  */
// app.post('/api/honeypot/interact', authenticateRequest, async (req, res) => {
//   const { sessionId, message, conversationHistory, persona, metadata } = req.body;

//   try {
//     // 1. Initialize Session State
//     if (!globalState[sessionId]) {
//       globalState[sessionId] = {
//         intel: { bankAccounts: [], upiIds: [], phishingLinks: [], phoneNumbers: [], suspiciousKeywords: [] },
//         count: 0
//       };
//     }
//     const session = globalState[sessionId];
//     session.count += 1;

//     // 2. Prepare the combined prompt (Intelligence + Reply)
//     const systemPrompt = `
//       Roleplay as ${persona.name}, a ${persona.role}. 
//       Personality: ${persona.personality}. Vulnerability: ${persona.vulnerability}.
//       Goal: Waste time, act gullible, and bait scam info (UPI/Links/Phone). 
      
//       You must return a JSON object containing:
//       1. "reply": Your roleplay response to the scammer.
//       2. "extracted": An object with arrays for bankAccounts, upiIds, phishingLinks, and phoneNumbers found in the scammer's message.
//     `;

//     const userQuery = `Scammer says: "${message.text}"`;

//     const payload = {
//       contents: [
//         ...conversationHistory.map(msg => ({
//           role: msg.sender === "scammer" ? "user" : "model",
//           parts: [{ text: msg.text }]
//         })),
//         { role: "user", parts: [{ text: userQuery }] }
//       ],
//       systemInstruction: { parts: [{ text: systemPrompt }] },
//       generationConfig: {
//         responseMimeType: "application/json",
//         responseSchema: {
//           type: "OBJECT",
//           properties: {
//             reply: { type: "string" },
//             extracted: {
//               type: "OBJECT",
//               properties: {
//                 bankAccounts: { type: "ARRAY", items: { type: "string" } },
//                 upiIds: { type: "ARRAY", items: { type: "string" } },
//                 phishingLinks: { type: "ARRAY", items: { type: "string" } },
//                 phoneNumbers: { type: "ARRAY", items: { type: "string" } }
//               }
//             }
//           }
//         }
//       }
//     };

//     // 3. Single AI Call (Faster & more reliable)
//     const aiResponse = await fetchWithRetry(
//       `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`,
//       {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify(payload)
//       }
//     );

//     const resultText = aiResponse.candidates?.[0]?.content?.parts?.[0]?.text;
//     if (!resultText) throw new Error("Empty AI response");

//     const result = JSON.parse(resultText);
//     const regexIntel = extractWithRegex(message.text);

//     // 4. Merge Intelligence
//     ['bankAccounts', 'upiIds', 'phishingLinks', 'phoneNumbers'].forEach(key => {
//       const combined = [...(result.extracted[key] || []), ...(regexIntel[key] || [])];
//       session.intel[key].push(...combined);
//     });
//     session.intel.suspiciousKeywords.push(...regexIntel.suspiciousKeywords);

//     // 5. Async reporting (Don't await this if it slows down the response)
//     const foundNew = Object.values(regexIntel).some(arr => arr.length > 0);
//     if (foundNew) {
//       reportToGuvi(sessionId, session.intel, session.count, `Engaging on ${metadata?.channel}. Actionable data extracted.`);
//     }

//     res.json({ status: "success", reply: result.reply });

//   } catch (err) {
//     console.error("SERVER ERROR:", err);
//     res.status(500).json({ status: "error", message: "Honeypot Engine Timeout or Error" });
//   }
// });

// app.get('/health', (req, res) => res.status(200).json({ status: "OK" }));

// app.listen(PORT, () => console.log(`🚀 Honeypot Engine Online on Port ${PORT}`));

// // // Basic Health Check
// // app.get('/health', (req, res) => res.status(200).json({ status: "OK" }));

// // app.listen(PORT, () => console.log(`🚀 Honeypot Running on Port ${PORT}`));

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 3000;

// API Configuration
const apiKey = process.env.GEMINI_API_KEY; // Set to empty as per environment requirements
const HONEYPOT_SECRET_KEY = process.env.HONEYPOT_SECRET_KEY || "sk_honeypot_secure_2026";
const MODEL_NAME = "gemini-2.5-flash-preview-09-2025";

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const globalState = {};

/**
 * UTILITY: Exponential Backoff for API Calls
 */
async function fetchWithRetry(url, options, retries = 5, backoff = 1000) {
  try {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (retries <= 0) throw err;
    await new Promise(resolve => setTimeout(resolve, backoff));
    return fetchWithRetry(url, options, retries - 1, backoff * 2);
  }
}

/**
 * REGEX FALLBACKS
 */
function extractWithRegex(text) {
  if (!text) return { phoneNumbers: [], phishingLinks: [], upiIds: [], suspiciousKeywords: [] };
  return {
    phoneNumbers: text.match(/(\+?\d{1,4}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g) || [],
    phishingLinks: text.match(/(https?:\/\/[^\s]+)/g) || [],
    upiIds: text.match(/[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/g) || [],
    suspiciousKeywords: text.match(/(blocked|suspended|verify|urgent|won|lottery|electricity|bill|official|bank|kyc)/gi) || []
  };
}

/**
 * CALLBACK: Report findings to GUVI
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
 * AUTH MIDDLEWARE
 */
const authenticateRequest = (req, res, next) => {
  const userKey = req.headers['x-api-key'];
  if (!userKey || userKey !== HONEYPOT_SECRET_KEY) {
    return res.status(401).json({ status: "error", message: "Invalid API key." });
  }
  next();
};

/**
 * MAIN INTERACTION ENDPOINT
 */
app.post('/api/honeypot/interact', authenticateRequest, async (req, res) => {
  const { sessionId, message, conversationHistory = [], metadata = {}, persona = {} } = req.body;

  try {
    // 1. Core Validation
    if (!sessionId || !message || !message.text) {
      return res.status(400).json({ 
        status: "error", 
        message: "Missing required fields: 'sessionId' and 'message.text' are mandatory." 
      });
    }

    // Initialize State
    if (!globalState[sessionId]) {
      globalState[sessionId] = {
        intel: { bankAccounts: [], upiIds: [], phishingLinks: [], phoneNumbers: [], suspiciousKeywords: [] },
        count: 0
      };
    }
    const session = globalState[sessionId];
    session.count += 1;

    // 2. Persona Defaults
    const targetRole = persona.role || "worried bank customer";
    const targetPersonality = persona.personality || "anxious and polite";
    const targetVulnerability = persona.vulnerability || "fear of losing savings";

    // 3. System Prompt - Optimized to prevent runaway text generation
    const systemPrompt = `
      Roleplay as a ${targetRole}. 
      Personality: ${targetPersonality}. 
      Vulnerability: ${targetVulnerability}.
      Goal: Waste the scammer's time, act gullible, and lure them into revealing UPI IDs, links, or phone numbers.
      IMPORTANT: Keep your reply concise (under 2 sentences).
      
      You must return a JSON object:
      {
        "reply": "Your message back to the scammer",
        "extracted": {
          "bankAccounts": [], "upiIds": [], "phishingLinks": [], "phoneNumbers": []
        }
      }
    `;

    const payload = {
      contents: [
        ...conversationHistory.map(msg => ({
          role: msg.sender === "scammer" ? "user" : "model",
          parts: [{ text: msg.text || "" }]
        })),
        { role: "user", parts: [{ text: message.text }] }
      ],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        responseMimeType: "application/json",
        // Max tokens set to prevent "Unterminated string" by capping total length
        maxOutputTokens: 2000, 
        responseSchema: {
          type: "OBJECT",
          properties: {
            reply: { type: "string" },
            extracted: {
              type: "OBJECT",
              properties: {
                bankAccounts: { type: "ARRAY", items: { type: "string" } },
                upiIds: { type: "ARRAY", items: { type: "string" } },
                phishingLinks: { type: "ARRAY", items: { type: "string" } },
                phoneNumbers: { type: "ARRAY", items: { type: "string" } }
              }
            }
          }
        }
      }
    };

    // 4. Single AI Call
    const aiResponse = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    let resultText = aiResponse.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) throw new Error("Empty AI response");

    // Robust JSON Parsing
    let result;
    try {
        result = JSON.parse(resultText);
    } catch (parseError) {
        console.error("Initial JSON Parse failed, attempting cleanup...");
        // Fallback: If model returned raw text with JSON markdown or was slightly truncated
        const cleanedText = resultText.replace(/```json|```/g, "").trim();
        result = JSON.parse(cleanedText);
    }

    const regexIntel = extractWithRegex(message.text);

    // 5. Merge Data
    if (result.extracted) {
        ['bankAccounts', 'upiIds', 'phishingLinks', 'phoneNumbers'].forEach(key => {
            const combined = [...(result.extracted[key] || []), ...(regexIntel[key] || [])];
            session.intel[key].push(...combined);
        });
    }

    // 6. Async Background Reporting
    const foundNew = Object.values(regexIntel).some(arr => arr.length > 0);
    if (foundNew) {
      reportToGuvi(
        sessionId, 
        session.intel, 
        session.count, 
        `Triggered on ${metadata.channel || 'Unknown channel'}. Language: ${metadata.language || 'EN'}.`
      );
    }

    res.json({ status: "success", reply: result.reply || "I'm not sure I understand, what should I do?" });

  } catch (err) {
    console.error("SERVER ERROR:", err);
    // Specific error message for JSON issues to help debugging
    const msg = err instanceof SyntaxError ? "Response format error" : "Internal Engine Error";
    res.status(500).json({ status: "error", message: msg });
  }
});

app.get('/health', (req, res) => res.status(200).json({ status: "OK" }));

app.listen(PORT, () => console.log(`🚀 Honeypot Engine running on port ${PORT}`));



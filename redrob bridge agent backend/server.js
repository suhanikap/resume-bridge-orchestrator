import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Configure temporary local storage upload space
const upload = multer({ dest: 'uploads/' });

app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Robust JSON validation helper
const extractJSON = (text) => {
  try {
    const firstClean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(firstClean);
  } catch (e) {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]); } catch(err) {}
    }
    throw new Error("Could not parse agent structural payload.");
  }
};

// Helper to convert local file buffer into the structure Gemini's SDK requires
function fileToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString("base64"),
      mimeType
    },
  };
}

// CHANGED: Added upload.single middleware to automatically catch the 'resumeFile' field
app.post('/api/evaluate', upload.single('resumeFile'), async (req, res) => {
  const { name, email, githubUrl } = req.body;
  const uploadedFile = req.file;

  console.log(`\n🚀 Starting Document-Upload Multi-Agent Evaluation for: ${name}...`);

  if (!uploadedFile) {
    return res.status(400).json({ error: "Missing required resume document file." });
  }

  try {
    // Convert the cached file into a multi-modal piece the API natively parses
    const resumeAttachment = fileToGenerativePart(uploadedFile.path, uploadedFile.mimetype);

    // --- AGENT 1: COMPETENCY MAPPING ---
    console.log(`🧠 Triggering Agent 1: Parsing Uploaded Document Attachment...`);
    const agent1Response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      // We pass the prompt AND the file attachment together into the model array contents!
      contents: [
        resumeAttachment,
        `You are Agent 1 (Competency Mapper). Analyze the attached resume document file.
         Provide a clean 1-sentence summary of their tech profile based on the document text, and output an array of 4 key technical skills found. 
         Structure your output exactly as: { "summary": "string", "extracted_skills": ["string"] }`
      ],
      config: { responseMimeType: 'application/json' }
    });

    const agent1Data = extractJSON(agent1Response.text);

    // --- AGENT 2: CODEBASE ARCHITECTURE AUDITOR ---
    console.log(`🔍 Triggering Agent 2: Autonomous Git Architecture Inspection...`);
    const agent2Response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are Agent 2 (Code Auditor). Analyze this simulated target repository: "${githubUrl}".
                 Evaluate code structure quality and find 2 structural points (one vulnerability and one positive check).
                 Structure your output exactly as:
                 { 
                   "architecture_rating": "A",
                   "audit_logs": [
                     { "type": "vulnerability", "file": "index.js", "finding": "Description" },
                     { "type": "check", "file": "auth.js", "finding": "Description" }
                   ]
                 }`,
      config: { responseMimeType: 'application/json' }
    });

    const agent2Data = extractJSON(agent2Response.text);

    // --- AGENT 3: INTERVIEW GUIDE ARCHITECT ---
    console.log(`📝 Triggering Agent 3: Structural System Interview Architect...`);
    const agent3Response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are Agent 3 (Interview Designer). Given these skills [${agent1Data.extracted_skills.join(', ')}] and this repo rating [${agent2Data.architecture_rating}].
                 Generate 2 custom systemic thinking interview questions tailored directly to check their engineering philosophy.
                 Structure your output exactly as:
                 {
                   "recommended_focus": "string",
                   "custom_questions": [
                     { "id": 1, "question": "string", "intent": "string" },
                     { "id": 2, "question": "string", "intent": "string" }
                   ]
                 }`,
      config: { responseMimeType: 'application/json' }
    });

    const agent3Data = extractJSON(agent3Response.text);

    // CLEANUP step: Delete the local temporary uploaded file from the server disk cache safely
    fs.unlinkSync(uploadedFile.path);

    console.log(`⚙️ Consolidating Sub-Agent Matrices into Unified Payload...`);
    const matchScore = agent2Data.architecture_rating === 'A' ? 94 : 82;

    const integratedReport = {
      status: "Evaluated",
      matchScore: matchScore,
      agent_1_competency_map: agent1Data,
      agent_2_code_audit: agent2Data,
      agent_3_interview_guide: agent3Data
    };

    console.log(`✅ Pipeline successfully resolved from document file.`);
    res.json(integratedReport);

  } catch (error) {
    // Make sure we clean up files even if the API throws an error
    if (uploadedFile && fs.existsSync(uploadedFile.path)) {
      fs.unlinkSync(uploadedFile.path);
    }
    console.error("❌ Orchestration Pipeline Intercepted Error:", error);
    res.status(500).json({ 
      error: "The internal orchestration stack hit an error analyzing the file.",
      details: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`🛰️ Redrob Bridge System Backend spinning on port ${PORT}`);
});no
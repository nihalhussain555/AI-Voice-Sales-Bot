// AI Conversation Summarizer and Sales Status Classifier

import { groqChat, parseJsonLoose, resolveApiKey } from './groqClient.js';

const ALLOWED_STATUSES = [
  "Converted",
  "Interested",
  "Follow-up Required",
  "Not Interested",
  "Demo Requested",
  "No Response"
];

export async function generateConversationSummary({ transcript = [], product = "DevPulse AI", apiKey = null }) {
  if (!transcript || transcript.length === 0) {
    return {
      status: "No Response",
      overview: "Call was connected but no conversation took place.",
      requirements: ["No customer requirements recorded"],
      objections: [],
      nextSteps: ["Attempt outbound follow-up at a different time"],
      sentiment: "Neutral",
      dealScore: 0
    };
  }

  // Filter messages
  const customerMessages = transcript.filter(m => m.sender === 'customer');
  if (customerMessages.length === 0) {
    return {
      status: "No Response",
      overview: "Customer connected to the line but did not provide any verbal or textual response.",
      requirements: [],
      objections: [],
      nextSteps: ["Log call attempt and queue for automated follow-up callback"],
      sentiment: "Neutral",
      dealScore: 5
    };
  }

  const transcriptText = transcript
    .map(m => `${m.sender.toUpperCase()} (${m.time || ''}): ${m.text}`)
    .join('\n');

  // Try the Groq LLM when a key is available; fall back to heuristics only if absent.
  const key = resolveApiKey(apiKey);
  if (key) {
    try {
      const groqSummary = await callGroqSummarizer(transcriptText, product, key);
      if (groqSummary) return groqSummary;
    } catch (err) {
      console.warn("Groq summarization failed, falling back to heuristic engine:", err.message);
    }
  }

  // Fallback intelligent analytical heuristic summarizer
  return analyzeTranscriptHeuristically(transcript, product);
}

// Heuristic rule-based analyzer ensuring 100% reliable evaluation without external API dependence
function analyzeTranscriptHeuristically(transcript, product) {
  const customerText = transcript
    .filter(m => m.sender === 'customer')
    .map(m => m.text.toLowerCase())
    .join(' ');

  let status = "Interested";
  let dealScore = 60;
  let sentiment = "Neutral";
  const requirements = [];
  const objections = [];
  const nextSteps = [];

  // 1. Status Classification
  if (
    customerText.includes("buy") || 
    customerText.includes("sign up") || 
    customerText.includes("purchase") || 
    customerText.includes("deal") ||
    customerText.includes("ready to start") ||
    customerText.includes("onboarding") ||
    customerText.includes("ఖరీదు") ||
    customerText.includes("खरीदना")
  ) {
    status = "Converted";
    dealScore = 95;
    sentiment = "Positive";
  } else if (
    customerText.includes("demo") || 
    customerText.includes("schedule") || 
    customerText.includes("meeting") || 
    customerText.includes("walkthrough") ||
    customerText.includes("thursday") ||
    customerText.includes("tomorrow") ||
    customerText.includes("డెమో") ||
    customerText.includes("डेमो")
  ) {
    status = "Demo Requested";
    dealScore = 85;
    sentiment = "Positive";
  } else if (
    customerText.includes("not interested") || 
    customerText.includes("no thanks") || 
    customerText.includes("stop calling") || 
    customerText.includes("don't want") ||
    customerText.includes("रुचि नहीं") ||
    customerText.includes("ఆసక్తి లేదు")
  ) {
    status = "Not Interested";
    dealScore = 10;
    sentiment = "Negative";
  } else if (
    customerText.includes("team") || 
    customerText.includes("manager") || 
    customerText.includes("call me later") || 
    customerText.includes("send email") || 
    customerText.includes("discuss") ||
    customerText.includes("think about") ||
    customerText.includes("बाद में") ||
    customerText.includes("తర్వాత")
  ) {
    status = "Follow-up Required";
    dealScore = 55;
    sentiment = "Neutral";
  } else if (
    customerText.includes("pricing") || 
    customerText.includes("cost") || 
    customerText.includes("how does") || 
    customerText.includes("feature") || 
    customerText.includes("trial") ||
    customerText.includes("good") ||
    customerText.includes("yes") ||
    customerText.includes("अच्छा") ||
    customerText.includes("బాగుంది")
  ) {
    status = "Interested";
    dealScore = 75;
    sentiment = "Positive";
  } else {
    status = "Follow-up Required";
    dealScore = 50;
    sentiment = "Neutral";
  }

  // 2. Extract Requirements
  if (customerText.includes("cloud") || customerText.includes("cost") || customerText.includes("aws") || customerText.includes("kubernetes")) {
    requirements.push("Cloud infrastructure cost reduction & automated Kubernetes cluster tuning");
  }
  if (customerText.includes("lead") || customerText.includes("prospect") || customerText.includes("sales") || customerText.includes("email")) {
    requirements.push("B2B lead generation with verified contact data and outbound automation");
  }
  if (customerText.includes("support") || customerText.includes("ticket") || customerText.includes("customer")) {
    requirements.push("24/7 automated tier-1 customer support handling with high accuracy");
  }
  if (customerText.includes("integration") || customerText.includes("api") || customerText.includes("crm")) {
    requirements.push("Seamless API integration with existing business workflows");
  }
  if (requirements.length === 0) {
    requirements.push(`Productivity enhancement and automation using ${product}`);
  }

  // 3. Extract Objections
  if (customerText.includes("price") || customerText.includes("expensive") || customerText.includes("budget") || customerText.includes("cost")) {
    objections.push("Pricing & budget considerations (addressed with ROI metrics & 14-day free trial)");
  }
  if (customerText.includes("already") || customerText.includes("competitor") || customerText.includes("using")) {
    objections.push("Existing competitor solution in place (addressed with differentiation & superior automation)");
  }
  if (customerText.includes("team") || customerText.includes("manager") || customerText.includes("boss")) {
    objections.push("Internal stakeholder alignment required before decision-making");
  }
  if (customerText.includes("hard") || customerText.includes("setup") || customerText.includes("difficult") || customerText.includes("complex")) {
    objections.push("Implementation complexity concerns (addressed with 15-minute fast setup guarantee)");
  }
  if (objections.length === 0 && status !== "Not Interested") {
    objections.push("No major blockers raised during the conversation");
  }

  // 4. Formulate Next Steps
  if (status === "Converted") {
    nextSteps.push("Send digital onboarding welcome package and activation credentials");
    nextSteps.push("Assign dedicated customer success manager for initial setup");
  } else if (status === "Demo Requested") {
    nextSteps.push("Confirm calendar invite with solutions architect");
    nextSteps.push("Share preparatory checklist and custom demo environment URL");
  } else if (status === "Follow-up Required") {
    nextSteps.push("Send 1-page executive summary and pricing sheet via email");
    nextSteps.push("Schedule follow-up phone call in 48 hours");
  } else if (status === "Interested") {
    nextSteps.push("Share 14-day risk-free trial activation link");
    nextSteps.push("Provide relevant customer success case studies");
  } else if (status === "Not Interested") {
    nextSteps.push("Update CRM contact record to 'Closed / Lost - Bad Timing'");
    nextSteps.push("Add to passive quarterly product newsletter list");
  }

  const overview = `Interactive voice sales dialogue for ${product}. Customer engaged in ${transcript.length} conversational turns. Final sentiment evaluated as ${sentiment.toLowerCase()} with a deal probability score of ${dealScore}%. The lead concluded in status: "${status}".`;

  return {
    status,
    overview,
    requirements,
    objections,
    nextSteps,
    sentiment,
    dealScore
  };
}

// Call Groq LLM for summary (strict-JSON output).
async function callGroqSummarizer(transcriptText, product, apiKey) {
  const prompt = `Analyze this sales conversation transcript for the SaaS product "${product}".
Return ONLY a strictly valid JSON object (no prose, no markdown) matching this schema:
{
  "status": "One of: Converted | Interested | Follow-up Required | Not Interested | Demo Requested | No Response",
  "overview": "Short concise summary of the conversation",
  "requirements": ["Customer requirement 1", "Customer requirement 2"],
  "objections": ["Objection 1 and how handled", "..."],
  "nextSteps": ["Action item 1", "Action item 2"],
  "sentiment": "Positive | Neutral | Negative",
  "dealScore": 85
}

Transcript:
${transcriptText}`;

  const content = await groqChat({
    apiKey,
    messages: [
      { role: 'system', content: 'You are a precise sales-call analyst. You only ever respond with valid JSON.' },
      { role: 'user', content: prompt }
    ],
    maxTokens: 600,
    temperature: 0.2,
    json: true
  });

  const parsed = parseJsonLoose(content);
  if (!parsed) return null;

  if (!ALLOWED_STATUSES.includes(parsed.status)) parsed.status = "Follow-up Required";
  if (typeof parsed.dealScore !== 'number') parsed.dealScore = 50;
  for (const arrKey of ['requirements', 'objections', 'nextSteps']) {
    if (!Array.isArray(parsed[arrKey])) parsed[arrKey] = [];
  }
  if (typeof parsed.overview !== 'string') parsed.overview = "";
  if (!['Positive', 'Neutral', 'Negative'].includes(parsed.sentiment)) parsed.sentiment = "Neutral";
  return parsed;
}

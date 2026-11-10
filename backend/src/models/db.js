import fs from 'fs';
import path from 'path';

import { paths, ensureDataDirs } from '../config/env.js';

const DATA_DIR = paths.data;
const DB_FILE = path.join(DATA_DIR, 'calls.json');
const RECORDINGS_DIR = paths.recordings;

ensureDataDirs();

// Initial seed data for demonstration if empty
const SEED_CALLS = [
  {
    id: "call-demo-001",
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
    customerName: "Alex Rivera",
    company: "ScaleGrid Inc.",
    product: "DevPulse AI",
    language: "English",
    duration: 184, // seconds
    status: "Demo Requested",
    recordingUrl: "/recordings/sample-demo.wav",
    transcript: [
      { sender: "bot", text: "Hello! Thanks for connecting with DevPulse AI. I'm Alex from sales. Are you currently looking to optimize your cloud infrastructure and slash monthly AWS costs?", time: "00:03" },
      { sender: "customer", text: "Hi! Yes, our AWS bill has ballooned past $35k a month, and our engineering team spends too much time doing manual cluster resizing.", time: "00:15" },
      { sender: "bot", text: "That is a huge pain point we solve every day. DevPulse continuously analyzes Kubernetes cluster usage and automatically downsizes idle instances without downtime, typically saving 35 to 45 percent immediately. How many Kubernetes clusters are you currently managing?", time: "00:32" },
      { sender: "customer", text: "Around 12 clusters across production and staging. How difficult is the setup?", time: "00:46" },
      { sender: "bot", text: "It literally takes under 15 minutes! You just install a lightweight Helm chart with read-only permissions first so you can inspect potential savings before enabling auto-tuning. Would you like a quick 15-minute live demo with our principal solutions architect this Thursday?", time: "01:05" },
      { sender: "customer", text: "Thursday works great. Can you book it for 2 PM EST?", time: "01:18" },
      { sender: "bot", text: "You got it! I've scheduled your live demo for Thursday at 2 PM EST. You'll receive a calendar invite shortly. We're excited to help you save on your cloud spend!", time: "01:30" }
    ],
    summary: {
      overview: "Productive discovery call with Alex Rivera from ScaleGrid Inc. Customer expressed urgent need to rein in a $35k/month AWS bill and automate manual Kubernetes resizing.",
      requirements: [
        "Automated cloud cost reduction for 12 Kubernetes clusters (staging + prod)",
        "Zero-downtime cluster right-sizing",
        "Quick implementation under 15 minutes without disrupting workflows"
      ],
      objections: [
        "Setup complexity and effort required from their busy engineering team (handled by explaining the 15-minute read-only Helm chart)"
      ],
      nextSteps: [
        "Send calendar invite for Thursday at 2:00 PM EST with Principal Solutions Architect",
        "Email pre-demo Kubernetes sizing checklist and ROI calculator"
      ],
      sentiment: "Positive",
      dealScore: 88
    }
  },
  {
    id: "call-demo-002",
    timestamp: new Date(Date.now() - 3600000 * 8).toISOString(),
    customerName: "Rahul Sharma",
    company: "FinFlow Tech",
    product: "OmniLeads CRM",
    language: "Hindi",
    duration: 142,
    status: "Interested",
    recordingUrl: "/recordings/sample-demo.wav",
    transcript: [
      { sender: "bot", text: "नमस्ते राहुल जी! OmniLeads CRM में आपका स्वागत है। क्या आप अपनी B2B सेल्स टीम के लिए हाई-क्वालिटी लीड्स और आउटरीच ऑटोमेशन ढूंढ रहे हैं?", time: "00:04" },
      { sender: "customer", text: "नमस्ते! हाँ, हमारी सेल्स टीम अभी मैनुअली लिंक्डइन पर प्रोस्पेक्टिंग कर रही है, जिसमें काफी समय बर्बाद होता है।", time: "00:19" },
      { sender: "bot", text: "बिल्कुल सही समय पर बात हो रही है! OmniLeads AI आपकी टारगेट इंडस्ट्री के वेरिफाइड ईमेल और डायरेक्ट फोन नंबर 1-क्लिक में निकालता है और पर्सनलाइज्ड ईमेल सीक्वेंसेस ऑटोमैटिक भेजता है। इससे आपकी टीम का रोज़ाना 3 घंटा बचता है।", time: "00:39" },
      { sender: "customer", text: "यह तो काफी अच्छा लग रहा है। इसका मंथली प्राइसिंग क्या है?", time: "00:52" },
      { sender: "bot", text: "हमारा स्टार्टर प्लान सिर्फ $49 प्रति माह से शुरू होता है जिसमें 1,000 वेरिफाइड लीड्स शामिल हैं। क्या आप 14 दिन का फ्री ट्रायल शुरू करना चाहेंगे?", time: "01:10" },
      { sender: "customer", text: "मैं पहले अपनी टीम से डिस्कस करूँगा और आपको कल बताता हूँ।", time: "01:23" },
      { sender: "bot", text: "ज़रूर राहुल जी! मैं आपको डिटेल्स और केस स्टडीज व्हाट्सएप और ईमेल पर भेज देता हूँ। कल हम फॉलो-अप करेंगे!", time: "01:38" }
    ],
    summary: {
      overview: "Engaging outbound conversation in Hindi with Rahul Sharma. Lead is actively looking to automate manual LinkedIn prospecting for his B2B sales team.",
      requirements: [
        "Verified B2B emails and phone numbers lookup",
        "Automated personalized outreach sequences",
        "Save 2-3 hours daily per sales development representative"
      ],
      objections: [
        "Need internal stakeholder review before purchasing or starting trial"
      ],
      nextSteps: [
        "Send product brochure, pricing tier sheet, and case study via email",
        "Schedule follow-up call for tomorrow morning"
      ],
      sentiment: "Positive",
      dealScore: 72
    }
  }
];

function readDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(SEED_CALLS, null, 2));
      return SEED_CALLS;
    }
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading database:", err);
    return SEED_CALLS;
  }
}

function writeDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error("Error writing database:", err);
    return false;
  }
}

export const db = {
  getCalls: () => {
    const calls = readDB();
    return calls.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  },

  getCallById: (id) => {
    const calls = readDB();
    return calls.find(c => c.id === id);
  },

  saveCall: (callData) => {
    const calls = readDB();
    const newCall = {
      // Phone/CRM fields (channel, callSid, direction, from, to, mode, outcome…)
      // must survive, so start from the payload and only fill in defaults.
      ...callData,
      id: callData.id || `call-${Date.now()}`,
      timestamp: callData.timestamp || new Date().toISOString(),
      customerName: callData.customerName || "Customer",
      company: callData.company || "Enterprise Lead",
      product: callData.product || "DevPulse AI",
      language: callData.language || "English",
      duration: callData.duration || 0,
      status: callData.status || "Follow-up Required",
      recordingUrl: callData.recordingUrl || null,
      transcript: callData.transcript || [],
      summary: callData.summary || {
        overview: "No summary generated.",
        requirements: [],
        objections: [],
        nextSteps: [],
        sentiment: "Neutral",
        dealScore: 50
      }
    };

    calls.unshift(newCall);
    writeDB(calls);
    return newCall;
  },

  deleteCall: (id) => {
    let calls = readDB();
    const index = calls.findIndex(c => c.id === id);
    if (index !== -1) {
      const removed = calls.splice(index, 1)[0];
      writeDB(calls);
      // Delete recording file if it exists and is local
      if (removed.recordingUrl && removed.recordingUrl.startsWith('/recordings/')) {
        const filePath = path.join(RECORDINGS_DIR, path.basename(removed.recordingUrl));
        if (fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch (e) {}
        }
      }
      return true;
    }
    return false;
  }
};

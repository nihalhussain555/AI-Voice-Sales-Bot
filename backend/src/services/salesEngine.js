// SaaS Products Catalog with rich sales scripts, objection handlers, and pitch points
export const SAAS_PRODUCTS = {
  "devpulse": {
    id: "devpulse",
    name: "DevPulse AI",
    tagline: "Autonomous Cloud & DevOps Cost Optimizer",
    pitch: "DevPulse AI continuously analyzes your Kubernetes and cloud infrastructure, cutting AWS/GCP bills by 40% with automated right-sizing and zero downtime.",
    pricing: "14-day risk-free trial, then $199/month for up to 10 clusters. Enterprise plans available.",
    features: [
      "Real-time Kubernetes pod and node right-sizing",
      "Automated spot instance orchestration with 99.99% availability SLA",
      "One-click Helm chart installation in under 15 minutes",
      "Executive ROI dashboard showing dollar-for-dollar daily savings"
    ],
    targetCustomer: "DevOps Engineers, CTOs, Infrastructure Leads, VP of Engineering",
    commonObjections: {
      price: "Our customers see an average 4.2x ROI in their first month alone, meaning the platform easily pays for itself within days.",
      competitor: "Unlike legacy tools that only send email alerts, DevPulse actually automates remediation safely with read-only trial verification first.",
      complexity: "Setup takes just 15 minutes via a standard Helm chart with zero code changes required."
    }
  },
  "omnileads": {
    id: "omnileads",
    name: "OmniLeads CRM",
    tagline: "AI B2B Prospecting & Automated Outreach Engine",
    pitch: "OmniLeads CRM finds verified decision-maker emails and direct phone numbers, and runs hyper-personalized multichannel campaigns that 5x your qualified pipeline.",
    pricing: "Starter at $49/mo (1,000 verified leads), Pro at $149/mo (unlimited warmups + 5,000 leads).",
    features: [
      "98% accuracy verified B2B contact database with 250M+ verified profiles",
      "AI personalized icebreaker generator based on LinkedIn activity",
      "Automated multi-channel sequencing across Email, LinkedIn, and Phone",
      "Built-in email deliverability warmup and spam protection"
    ],
    targetCustomer: "B2B Founders, Sales Directors, SDR Managers, Growth Agencies",
    commonObjections: {
      price: "At $49 a month, closing just one new customer from our 1,000 verified leads delivers over a 10x return.",
      competitor: "Unlike Apollo or ZoomInfo, we include integrated AI voice notes and automated deliverability warmup at zero extra charge.",
      timing: "Prospects are shopping right now. Starting our 14-day trial today means your team can book meetings by this Friday."
    }
  },
  "supportgenie": {
    id: "supportgenie",
    name: "SupportGenie AI",
    tagline: "24/7 Autonomous Customer Support AI Agent",
    pitch: "SupportGenie handles tier-1 and tier-2 customer support tickets over voice and chat with human-grade empathy, resolving 80% of issues in seconds.",
    pricing: "Flexible plan starting at $99/mo for 2,000 automated resolutions with 99.8% customer satisfaction.",
    features: [
      "Instant voice and text resolution across Zendesk, Freshdesk, Intercom, and WhatsApp",
      "Supports 50+ languages natively with regional accent adaptation",
      "Auto-syncs with your Notion, Help Center docs, and product APIs",
      "Smooth human escalation when high-touch assistance is required"
    ],
    targetCustomer: "E-commerce Brands, SaaS Support Heads, Operations Directors",
    commonObjections: {
      price: "A human support agent costs upwards of $3,500/month. SupportGenie handles 5x the volume for less than $100.",
      competitor: "Traditional chatbots use rigid decision trees that frustrate users. SupportGenie uses contextual LLMs that understand nuance.",
      accuracy: "It strictly adheres to your verified documentation and never hallucinates answers outside your knowledge base."
    }
  }
};

// Generates system prompt for LLM
export function buildSalesSystemPrompt(productInfo, language = 'English') {
  return `You are "Jordan", a world-class, charismatic, and consultative Senior Sales Account Executive representing ${productInfo.name}.
Product Tagline: ${productInfo.tagline}
Core Pitch: ${productInfo.pitch}
Pricing & Offer: ${productInfo.pricing}
Key Features:
${productInfo.features ? productInfo.features.map(f => "- " + f).join("\n") : "High-performance modern SaaS"}

OBJECTIVE:
1. Speak in ${language}. (If Hindi, use natural conversational Hindi/Hinglish. If Telugu, speak natural friendly Telugu. If English, speak fluent conversational English).
2. Keep your responses short, conversational, and punchy (1 to 3 sentences maximum)! Voice conversations must not have long monologues.
3. Actively listen, validate customer pain points, handle objections gracefully, and advance the deal toward a clear Call-to-Action:
   - Schedule a 15-minute live demo
   - Start a 14-day free trial
   - Sign up on the spot
4. Maintain a warm, confident, consultative, and enthusiastic tone. Never sound like a robotic script.`;
}

// Fallback smart rule-based sales engine for zero-API-key mode
export function generateSmartSalesResponse({ productKey = 'devpulse', customProduct = null, message = '', history = [], language = 'English' }) {
  const product = customProduct || SAAS_PRODUCTS[productKey] || SAAS_PRODUCTS['devpulse'];
  const msg = (message || '').toLowerCase().trim();
  const turnCount = history.filter(h => h.sender === 'bot').length;

  const isHindi = language.toLowerCase().includes('hindi') || /[\u0900-\u097F]/.test(message);
  const isTelugu = language.toLowerCase().includes('telugu') || /[\u0C00-\u0C7F]/.test(message);

  // 1. Initial Greeting if empty or first turn
  if (turnCount === 0 && (!msg || msg.includes('hello') || msg.includes('hi') || msg.includes('hey') || msg.includes('start'))) {
    if (isTelugu) {
      return `నమస్కారం! నేను ${product.name} నుండి సేల్స్ స్పెషలిస్ట్‌ని మాట్లాడుతున్నాను. మీ వ్యాపారాన్ని తదుపరి స్థాయికి తీసుకెళ్లడానికి మా సాఫ్ట్‌వేర్ ఎలా సహాయపడుతుందో తెలుసుకోవడానికి ఆసక్తిగా ఉన్నారా?`;
    }
    if (isHindi) {
      return `नमस्ते! मैं ${product.name} की टीम से बात कर रहा हूँ। क्या आप अपनी टीम के काम को आसान बनाने और बिजनेस ग्रोथ बढ़ाने के लिए तैयार हैं?`;
    }
    return `Hi there! I'm from the ${product.name} team. We help fast-growing teams like yours solve major bottlenecks. Are you currently exploring ways to upgrade your workflow?`;
  }

  // 2. Pricing & Cost Queries
  if (msg.includes('price') || msg.includes('cost') || msg.includes('how much') || msg.includes('expensive') || msg.includes('खर्च') || msg.includes('कीमत') || msg.includes('ధర') || msg.includes('ఖర్చు')) {
    if (isTelugu) {
      return `మా ప్లాన్ చాలా సరసమైనది: ${product.pricing}. మొదటి నెలలోనే మీరు 4 రెట్లు ROI చూస్తారు. మీరు 14 రోజుల ఉచిత ట్రయల్‌తో ప్రారంభించాలనుకుంటున్నారా?`;
    }
    if (isHindi) {
      return `हमारा प्राइसिंग काफी किफायती है: ${product.pricing}। अधिकांश ग्राहकों को पहले ही महीने में 4x ROI मिल जाता है। क्या आप 14 दिन का फ्री ट्रायल देखना चाहेंगे?`;
    }
    return `Our plans are very straightforward: ${product.pricing}. Most of our clients see a 4x ROI in their first 30 days. Would you like to test drive it with a 14-day free trial?`;
  }

  // 3. Demo / Walkthrough Requests
  if (msg.includes('demo') || msg.includes('show me') || msg.includes('walkthrough') || msg.includes('meeting') || msg.includes('call') || msg.includes('డెమో') || msg.includes('डेमो')) {
    if (isTelugu) {
      return `తప్పకుండా! నేను మీకు ఒక ప్రత్యేక లైవ్ డెమోను సెట్ చేయగలను. రేపు లేదా గురువారం మీకు ఏ సమయం అనుకూలంగా ఉంటుంది?`;
    }
    if (isHindi) {
      return `बिल्कुल! मैं हमारे सीनियर सॉल्यूशन आर्किटेक्ट के साथ 15 मिनट का लाइव डेमो बुक कर देता हूँ। क्या कल दोपहर 2 बजे आपके लिए सही रहेगा?`;
    }
    return `I'd love to set that up! We can run a focused 15-minute live demo showing your exact workflow. Does tomorrow afternoon or Thursday work better for you?`;
  }

  // 4. Competitor or Existing Solution
  if (msg.includes('already have') || msg.includes('competitor') || msg.includes('using another') || msg.includes('other tool') || msg.includes('पहले से')) {
    const objText = product.commonObjections?.competitor || "We seamlessly integrate alongside your existing stack with zero migration headaches.";
    if (isTelugu) {
      return `అద్భుతం! చాలామంది మా కస్టమర్లు కూడా ఇంతకుముందు ఇతర టూల్స్ వాడారు, కానీ ${product.name} ప్రత్యేక ఆటోమేషన్ వల్ల వారికి 40% ఎక్కువ సమయం ఆదా అయింది.`;
    }
    if (isHindi) {
      return `बहुत बढ़िया! हमारे कई ग्राहक पहले अन्य टूल्स इस्तेमाल कर रहे थे, लेकिन ${product.name} के ऑटोमेशन और आसान सेटअप के कारण वे पूरी तरह स्विच कर गए।`;
    }
    return `That's great you already have experience in this space! The key difference is ${objText}. Would you be open to seeing a quick side-by-side comparison?`;
  }

  // 5. Objections: Need to discuss with team / manager / boss
  if (msg.includes('team') || msg.includes('manager') || msg.includes('boss') || msg.includes('think about it') || msg.includes('सोचना') || msg.includes('మాట్లాడాలి')) {
    if (isTelugu) {
      return `ఖచ్చితంగా, మీ బృందంతో చర్చించడం చాలా ముఖ్యం. నేను మీకు ఒక చిన్న ROI సారాంశం మరియు కేస్ స్టడీని ఈమెయిల్ చేయవచ్చా?`;
    }
    if (isHindi) {
      return `बिल्कुल, टीम से चर्चा करना बहुत जरूरी है। क्या मैं आपको एक 1-पेज की ROI समरी और केस स्टडी ईमेल कर दूँ ताकि आपके लिए डिस्कशन आसान हो जाए?`;
    }
    return `Totally understand! Getting the team aligned is crucial. Can I send you a 1-page executive ROI summary and case study so you have all the numbers ready for your team?`;
  }

  // 6. Buying Intent / Conversion / Sign up
  if (msg.includes('buy') || msg.includes('sign up') || msg.includes('ready') || msg.includes('start') || msg.includes('yes') || msg.includes('agree') || msg.includes('हाँ') || msg.includes('అవును')) {
    if (isTelugu) {
      return `అద్భుతం! మీ స్వాగతం కోసం మేము సిద్ధంగా ఉన్నాము. నేను మీ ఈమెయిల్‌కు తక్షణ ఆన్‌బోర్డింగ్ లింక్‌ను పంపుతున్నాను. వెల్‌కమ్ ఆన్‌బోర్డ్!`;
    }
    if (isHindi) {
      return `शानदार! हम आपके साथ काम करने के लिए उत्साहित हैं। मैं तुरंत आपके ईमेल पर ऑनबोर्डिंग और एक्टिवेशन लिंक भेज रहा हूँ। आपका बहुत-बहुत स्वागत है!`;
    }
    return `Fantastic! You're making a great decision. I'll shoot the onboarding activation link straight to your inbox so you can get started right away. Welcome aboard!`;
  }

  // 7. Not Interested / Rejection
  if (msg.includes('not interested') || msg.includes('no thanks') || msg.includes("don't want") || msg.includes('रुचि नहीं') || msg.includes('ఆసక్తి లేదు')) {
    if (isTelugu) {
      return `నేను అర్థం చేసుకున్నాను, మీ సమయానికి ధన్యవాదాలు! భవిష్యత్తులో మీకు ఏదైనా సహాయం అవసరమైతే, మేము ఎల్లప్పుడూ సిద్ధంగా ఉంటాము. మీకు మంచి రోజు కలగాలని కోరుకుంటున్నాను!`;
    }
    if (isHindi) {
      return `मैं समझ सकता हूँ, अपना कीमती समय देने के लिए धन्यवाद! यदि भविष्य में आपको इसकी आवश्यकता हो, तो हम हमेशा उपलब्ध हैं। आपका दिन शुभ हो!`;
    }
    return `I completely respect that! Thanks so much for taking the time to chat today. If your priorities ever shift in the future, we'll be right here. Have a wonderful rest of your day!`;
  }

  // 8. General Feature pitch / Engagement
  if (turnCount === 1) {
    if (isTelugu) {
      return `${product.pitch} ఇది మీ కంపెనీ పనితీరును వేగవంతం చేస్తుంది. మీ ప్రస్తుత వర్క్‌ఫ్లోలో అతిపెద్ద సవాలు ఏమిటి?`;
    }
    if (isHindi) {
      return `${product.pitch} इससे आपकी टीम का कई घंटों का समय बचता है। क्या आप जानना चाहेंगे कि यह आपकी मौजूदा प्रणाली के साथ कैसे काम करता है?`;
    }
    return `${product.pitch} It is purpose-built to save your team countless hours. What's the biggest challenge you're facing with this right now?`;
  }

  // 9. Closing push
  if (isTelugu) {
    return `మేము 100% సంతృప్తి హామీని మరియు ఉచిత ట్రయల్‌ను అందిస్తున్నాము. దీన్ని స్వయంగా ప్రయత్నించడానికి మీకు ఆసక్తి ఉందా?`;
  }
  if (isHindi) {
    return `हम 14 दिनों का नो-रिस्क ट्रायल देते हैं जिसमें किसी क्रेडिट कार्ड की आवश्यकता नहीं होती। क्या आप इसे खुद आज़माना चाहेंगे?`;
  }
  return `We offer a full 14-day zero-risk trial with no credit card required to get started. Would you be open to trying it out for your team?`;
}

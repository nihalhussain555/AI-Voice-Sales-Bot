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

// How each supported language should be phrased. Keyed lowercase so "Hindi" and
// "hindi-IN" both land on the same guidance.
const LANGUAGE_GUIDANCE = {
  english: 'Speak fluent conversational English',
  hindi: 'Use natural conversational Hindi, with the Hinglish mix buyers actually use',
  telugu: 'Speak natural, friendly Telugu',
  malayalam: 'Speak natural, conversational Malayalam',
  tamil: 'Speak natural, conversational Tamil',
  arabic: 'Use clear, warm Modern Standard Arabic with a neutral business tone'
};

function languageGuidance(language) {
  const requested = String(language || '').toLowerCase();
  const match = Object.entries(LANGUAGE_GUIDANCE).find(([name]) => requested.includes(name));
  return match ? match[1] : `Keep the phrasing natural for ${language}`;
}

// Generates system prompt for LLM
export function buildSalesSystemPrompt(productInfo, language = 'English') {
  return `You are "Jordan", a world-class, charismatic, and consultative Senior Sales Account Executive representing ${productInfo.name}.
Product Tagline: ${productInfo.tagline}
Core Pitch: ${productInfo.pitch}
Pricing & Offer: ${productInfo.pricing}
Key Features:
${productInfo.features ? productInfo.features.map(f => "- " + f).join("\n") : "High-performance modern SaaS"}

OBJECTIVE:
1. ${languageGuidance(language)}.
2. Keep your responses short, conversational, and punchy (1 to 3 sentences maximum)! Voice conversations must not have long monologues.
3. Actively listen, validate customer pain points, handle objections gracefully, and advance the deal toward a clear Call-to-Action:
   - Schedule a 15-minute live demo
   - Start a 14-day free trial
   - Sign up on the spot
4. Maintain a warm, confident, consultative, and enthusiastic tone. Never sound like a robotic script.`;
}

// The rule-based engine answers one turn in one language: the operator's
// selection wins, otherwise the script the customer actually typed or spoke.
const LANGUAGE_SCRIPTS = {
  Hindi: /[\u0900-\u097F]/,
  Telugu: /[\u0C00-\u0C7F]/,
  Malayalam: /[\u0D00-\u0D7F]/,
  Tamil: /[\u0B80-\u0BFF]/,
  Arabic: /[\u0600-\u06FF]/
};

function detectLanguageKey(language, message) {
  const requested = String(language || '').toLowerCase();
  const chosen = Object.keys(LANGUAGE_SCRIPTS).find(name => requested.includes(name.toLowerCase()));
  if (chosen) return chosen;
  const written = Object.entries(LANGUAGE_SCRIPTS).find(([, script]) => script.test(message || ''));
  return written ? written[0] : 'English';
}

// English is the floor: a branch with no copy for the chosen language still answers.
function say(langKey, strings) {
  return strings[langKey] || strings.English;
}

const has = (text, needles) => needles.some(needle => text.includes(needle));

// Intent keywords per branch, in every supported language. The non-Latin entries
// are what a typed or dictated turn actually contains in that language.
const INTENTS = {
  greeting: ['hello', 'hi', 'hey', 'start', 'नमस्ते', 'నమస్కారం', 'നമസ്കാരം', 'வணக்கம்', 'مرحبا', 'السلام'],
  pricing: ['price', 'cost', 'how much', 'expensive', 'खर्च', 'कीमत', 'ధర', 'ఖర్చు', 'വില', 'விலை', 'السعر', 'سعر'],
  demo: ['demo', 'show me', 'walkthrough', 'meeting', 'call', 'डेमो', 'డెమో', 'ഡെമോ', 'டெமோ', 'ديمو', 'عرض'],
  competitor: ['already have', 'competitor', 'using another', 'other tool', 'पहले से', 'മറ്റൊരു', 'வேறு', 'منافس'],
  team: ['team', 'manager', 'boss', 'think about it', 'सोचना', 'మాట్లాడాలి', 'ടീം', 'குழு', 'فريق'],
  buying: ['buy', 'sign up', 'ready', 'start', 'yes', 'agree', 'हाँ', 'అవును', 'അതെ', 'ஆம்', 'نعم'],
  rejection: ['not interested', 'no thanks', "don't want", 'रुचि नहीं', 'ఆసక్తి లేదు', 'താൽപ്പര്യമില്ല', 'தேவையில்லை', 'لا أهتم']
};

// Fallback smart rule-based sales engine for zero-API-key mode
export function generateSmartSalesResponse({ productKey = 'devpulse', customProduct = null, message = '', history = [], language = 'English' }) {
  const product = customProduct || SAAS_PRODUCTS[productKey] || SAAS_PRODUCTS['devpulse'];
  const msg = (message || '').toLowerCase().trim();
  const turnCount = history.filter(h => h.sender === 'bot').length;
  const lang = detectLanguageKey(language, message);

  // 1. Initial Greeting if empty or first turn
  if (turnCount === 0 && (!msg || has(msg, INTENTS.greeting))) {
    return say(lang, {
      Telugu: `నమస్కారం! నేను ${product.name} నుండి సేల్స్ స్పెషలిస్ట్‌ని మాట్లాడుతున్నాను. మీ వ్యాపారాన్ని తదుపరి స్థాయికి తీసుకెళ్లడానికి మా సాఫ్ట్‌వేర్ ఎలా సహాయపడుతుందో తెలుసుకోవడానికి ఆసక్తిగా ఉన్నారా?`,
      Hindi: `नमस्ते! मैं ${product.name} की टीम से बात कर रहा हूँ। क्या आप अपनी टीम के काम को आसान बनाने और बिजनेस ग्रोथ बढ़ाने के लिए तैयार हैं?`,
      Malayalam: `നമസ്കാരം! ഞാൻ ${product.name} ടീമിൽ നിന്ന് സംസാരിക്കുകയാണ്. വേഗത്തിൽ വളരുന്ന ടീമുകളുടെ പ്രധാന ബുദ്ധിമുട്ടുകൾ പരിഹരിക്കാൻ ഞങ്ങൾ സഹായിക്കുന്നു. നിങ്ങളുടെ പ്രവർത്തനരീതി മെച്ചപ്പെടുത്താനുള്ള വഴികൾ തേടുന്നുണ്ടോ?`,
      Tamil: `வணக்கம்! நான் ${product.name} குழுவில் இருந்து பேசுகிறேன். வேகமாக வளரும் அணிகளின் முக்கிய சிக்கல்களைத் தீர்க்க நாங்கள் உதவுகிறோம். உங்கள் பணிமுறையை மேம்படுத்தும் வழிகளை நீங்கள் தேடுகிறீர்களா?`,
      Arabic: `مرحبًا! أنا من فريق ${product.name}. نساعد الفرق سريعة النمو مثلكم على إزالة أكبر العوائق من عملها. هل تبحثون حاليًا عن طرق لتحسين طريقة العمل لديكم؟`,
      English: `Hi there! I'm from the ${product.name} team. We help fast-growing teams like yours solve major bottlenecks. Are you currently exploring ways to upgrade your workflow?`
    });
  }

  // 2. Pricing & Cost Queries
  if (has(msg, INTENTS.pricing)) {
    return say(lang, {
      Telugu: `మా ప్లాన్ చాలా సరసమైనది: ${product.pricing}. మొదటి నెలలోనే మీరు 4 రెట్లు ROI చూస్తారు. మీరు 14 రోజుల ఉచిత ట్రయల్‌తో ప్రారంభించాలనుకుంటున్నారా?`,
      Hindi: `हमारा प्राइसिंग काफी किफायती है: ${product.pricing}। अधिकांश ग्राहकों को पहले ही महीने में 4x ROI मिल जाता है। क्या आप 14 दिन का फ्री ट्रायल देखना चाहेंगे?`,
      Malayalam: `ഞങ്ങളുടെ പ്ലാനുകൾ വളരെ ലളിതമാണ്: ${product.pricing}. ആദ്യ 30 ദിവസത്തിനുള്ളിൽ ഭൂരിഭാഗം ക്ലയന്റുകളും 4x ROI നേടുന്നു. 14 ദിവസത്തെ സൗജന്യ ട്രയൽ പരീക്ഷിച്ചു നോക്കില്ലേ?`,
      Tamil: `எங்கள் திட்டங்கள் மிக எளிமையானவை: ${product.pricing}. முதல் 30 நாட்களிலேயே எங்கள் வாடிக்கையாளர்கள் பெரும்பாலோர் 4 மடங்கு ROI பார்க்கிறார்கள். 14 நாள் இலவச சோதனையைத் தொடங்க விரும்புகிறீர்களா?`,
      Arabic: `خططنا بسيطة وواضحة: ${product.pricing}. أغلب عملائنا يحققون عائدًا يقدّر بأربعة أضعاف خلال أول 30 يومًا. هل تودّون البدء بتجربة مجانية لمدة 14 يومًا؟`,
      English: `Our plans are very straightforward: ${product.pricing}. Most of our clients see a 4x ROI in their first 30 days. Would you like to test drive it with a 14-day free trial?`
    });
  }

  // 3. Demo / Walkthrough Requests
  if (has(msg, INTENTS.demo)) {
    return say(lang, {
      Telugu: `తప్పకుండా! నేను మీకు ఒక ప్రత్యేక లైవ్ డెమోను సెట్ చేయగలను. రేపు లేదా గురువారం మీకు ఏ సమయం అనుకూలంగా ఉంటుంది?`,
      Hindi: `बिल्कुल! मैं हमारे सीनियर सॉल्यूशन आर्किटेक्ट के साथ 15 मिनट का लाइव डेमो बुक कर देता हूँ। क्या कल दोपहर 2 बजे आपके लिए सही रहेगा?`,
      Malayalam: `തീർച്ചയായും! നിങ്ങളുടെ യഥാർത്ഥ വർക്ക്‌ഫ്ലോ കാണിക്കുന്ന 15 മിനിറ്റ് ലൈവ് ഡെമോ ഞാൻ ഏർപ്പാടാക്കാം. നാളെ ഉച്ചയ്ക്ക് ശേഷമോ വെള്ളിയാഴ്ചയോ ഏതാണ് നിങ്ങൾക്ക് എളുപ്പം?`,
      Tamil: `கண்டிப்பாக! உங்கள் உண்மையான பணிமுறையைக் காட்டும் 15 நிமிட நேரடி டெமோவை நான் ஏற்பாடு செய்கிறேன். நாளை மதியம் அல்லது வெள்ளி — எது உங்களுக்கு வசதி?`,
      Arabic: `بالتأكيد! سأنسّق لكم عرضًا حيًا لمدة 15 دقيقة يوضح طريقة عملكم بالضبط. هل يناسبكم مساء الغد أم يوم الجمعة؟`,
      English: `I'd love to set that up! We can run a focused 15-minute live demo showing your exact workflow. Does tomorrow afternoon or Thursday work better for you?`
    });
  }

  // 4. Competitor or Existing Solution
  if (has(msg, INTENTS.competitor)) {
    const objText = product.commonObjections?.competitor || "We seamlessly integrate alongside your existing stack with zero migration headaches.";
    return say(lang, {
      Telugu: `అద్భుతం! చాలామంది మా కస్టమర్లు కూడా ఇంతకుముందు ఇతర టూల్స్ వాడారు, కానీ ${product.name} ప్రత్యేక ఆటోమేషన్ వల్ల వారికి 40% ఎక్కువ సమయం ఆదా అయింది.`,
      Hindi: `बहुत बढ़िया! हमारे कई ग्राहक पहले अन्य टूल्स इस्तेमाल कर रहे थे, लेकिन ${product.name} के ऑटोमेशन और आसान सेटअप के कारण वे पूरी तरह स्विच कर गए।`,
      Malayalam: `നിങ്ങൾക്ക് ഇതിനകം പരിചയമുണ്ട്, അത് വലിയ ഗുണമാണ്! ${product.name}-ന്റെ പ്രധാന വ്യത്യാസം ഓട്ടോമേഷനാണ്; ഉപയോക്താക്കൾ ശരാശരി 40% സമയം ലാഭിക്കുന്നു. രണ്ടും താരതമ്യം ചെയ്യുന്ന ചെറിയ വിവരം നോക്കാമോ?`,
      Tamil: `நீங்கள் ஏற்கனவே அனுபவம் கொண்டிருப்பது நல்லதே! ${product.name}-ன் முக்கிய வேறுபாடு தானியங்கி அமைப்பு; பயனர்கள் சராசரியாக 40% நேரத்தைச் சேமிக்கிறார்கள். இரண்டையும் ஒப்பிடும் குறுகிய காட்சியைப் பார்க்க விரும்புகிறீர்களா?`,
      Arabic: `جميل أن لديكم خبرة مسبقة في هذا المجال! الفرق الأساسي هو أن ${product.name} ينفّذ التصحيحات تلقائيًا، ويوفّر عملاؤنا في المتوسط 40% من وقتهم. هل تودّون مقارنة سريعة جنبًا إلى جنب؟`,
      English: `That's great you already have experience in this space! The key difference is ${objText}. Would you be open to seeing a quick side-by-side comparison?`
    });
  }

  // 5. Objections: Need to discuss with team / manager / boss
  if (has(msg, INTENTS.team)) {
    return say(lang, {
      Telugu: `ఖచ్చితంగా, మీ బృందంతో చర్చించడం చాలా ముఖ్యం. నేను మీకు ఒక చిన్న ROI సారాంశం మరియు కేస్ స్టడీని ఈమెయిల్ చేయవచ్చా?`,
      Hindi: `बिल्कुल, टीम से चर्चा करना बहुत जरूरी है। क्या मैं आपको एक 1-पेज की ROI समरी और केस स्टडी ईमेल कर दूँ ताकि आपके लिए डिस्कशन आसान हो जाए?`,
      Malayalam: `മനസ്സിലായി, ടീമുമായി ചർച്ച ചെയ്യേണ്ടത് വളരെ പ്രധാനമാണ്. നിങ്ങൾക്ക് വേണ്ട കണക്കുകൾ എളുപ്പത്തിൽ അവതരിപ്പിക്കാൻ ഒരു പേജ് ROI ചുരുക്കവും കേസ് സ്റ്റഡിയും ഇമെയിൽ ചെയ്‌ട്ട് അയയ്‌ക്കാമോ?`,
      Tamil: `புரிகிறது, குழுவுடன் கலந்தாலோசிப்பது மிக முக்கியம். உங்கள் விவாதிப்பு எளிதாக வேண்டுமென்றால் தேவையான எண்களுடன் ஒரு பக்க ROI சுருக்கத்தையும் கேஸ் ஸ்டடிையும் மின்னஞ்சல் செய்யட்டுமா?`,
      Arabic: `أتفهّم ذلك تمامًا! توافق الفريق أمر جوهري. هل تسمحون لي بإرسال ملخص ROI من صفحة واحدة مع دراسة حالة ليكون لديكم كل الأرقام الجاهزة لنقاشكم؟`,
      English: `Totally understand! Getting the team aligned is crucial. Can I send you a 1-page executive ROI summary and case study so you have all the numbers ready for your team?`
    });
  }

  // 6. Buying Intent / Conversion / Sign up
  if (has(msg, INTENTS.buying)) {
    return say(lang, {
      Telugu: `అద్భుతం! మీ స్వాగతం కోసం మేము సిద్ధంగా ఉన్నాము. నేను మీ ఈమెయిల్‌కు తక్షణ ఆన్‌బోర్డింగ్ లింక్‌ను పంపుతున్నాను. వెల్‌కమ్ ఆన్‌బోర్డ్!`,
      Hindi: `शानदार! हम आपके साथ काम करने के लिए उत्साहित हैं। मैं तुरंत आपके ईमेल पर ऑनबोर्डिंग और एक्टिवेशन लिंक भेज रहा हूँ। आपका बहुत-बहुत स्वागत है!`,
      Malayalam: `അതിശയം! നിങ്ങൾ നല്ല തീരുമാനമാണ് എടുക്കുന്നത്. ഉടൻ ആരംഭിക്കാൻ ഓൺബോർഡിംഗ് ആക്‌ടിവേഷൻ ലിങ്ക് ഞാൻ നിങ്ങളുടെ ഇമെയിലിലേക്ക് അയയ്‌ക്കുന്നു. സ്വാഗതം!`,
      Tamil: `அருமை! நீங்கள் சரியான முடிவு எடுக்கிறீர்கள். உடனே தொடங்க உங்கள் மின்னஞ்சலுக்கு ஆன்போர்டிங் லிங்கை அனுப்புகிறேன். வரவேற்கிறோம்!`,
      Arabic: `رائع! لقد اتخذتم قرارًا سليمًا. سأرسل رابط التفعيل مباشرة إلى بريدكم لتبدأوا فورًا. أهلًا بكم بيننا!`,
      English: `Fantastic! You're making a great decision. I'll shoot the onboarding activation link straight to your inbox so you can get started right away. Welcome aboard!`
    });
  }

  // 7. Not Interested / Rejection
  if (has(msg, INTENTS.rejection)) {
    return say(lang, {
      Telugu: `నేను అర్థం చేసుకున్నాను, మీ సమయానికి ధన్యవాదాలు! భవిష్యత్తులో మీకు ఏదైనా సహాయం అవసరమైతే, మేము ఎల్లప్పుడూ సిద్ధంగా ఉంటాము. మీకు మంచి రోజు కలగాలని కోరుకుంటున్నాను!`,
      Hindi: `मैं समझ सकता हूँ, अपना कीमती समय देने के लिए धन्यवाद! यदि भविष्य में आपको इसकी आवश्यकता हो, तो हम हमेशा उपलब्ध हैं। आपका दिन शुभ हो!`,
      Malayalam: `ബഹുമാനിക്കുന്നു! ഇന്ന് സംസാരിക്കാൻ സമയം നൽകിയതിന് നന്ദി. ഭാവിയിൽ മുൻഗണനകൾ മാറിയാൽ ഞങ്ങളുണ്ട്. നിങ്ങളുടെ ദിവസം ശോഭയുള്ളതാകട്ടെ!`,
      Tamil: `மதிக்கிறோம்! இன்று பேச நேரம் ஒதுக்கியதற்கு நன்றி. எதிர்காலத்தில் உங்கள் முன்னுரிமைகள் மாறினால் நாங்கள் உள்ளோம். உங்கள் நாள் நல்லதாகட்டும்!`,
      Arabic: `أحترم قرارك تمامًا! شكرًا لكم على وقتكم في الحديث اليوم. إن تغيّرت أولوياتكم مستقبلًا فنحن هنا. أتمنى لكم يومًا سعيدًا!`,
      English: `I completely respect that! Thanks so much for taking the time to chat today. If your priorities ever shift in the future, we'll be right here. Have a wonderful rest of your day!`
    });
  }

  // 8. General Feature pitch / Engagement
  if (turnCount === 1) {
    return say(lang, {
      Telugu: `${product.pitch} ఇది మీ కంపెనీ పనితీరును వేగవంతం చేస్తుంది. మీ ప్రస్తుత వర్క్‌ఫ్లోలో అతిపెద్ద సవాలు ఏమిటి?`,
      Hindi: `${product.pitch} इससे आपकी टीम का कई घंटों का समय बचता है। क्या आप जानना चाहेंगे कि यह आपकी मौजूदा प्रणाली के साथ कैसे काम करता है?`,
      Malayalam: `${product.pitch} നിങ്ങളുടെ ടീമിന്റെ നിരവധി മണിക്കൂറങ്ങൾ ലാഭിക്കാനായിട്ടാണ് ഇത് നിർമ്മിച്ചിരിക്കുന്നത്. ഇപ്പോൾ നിങ്ങൾ നേരിടുന്ന ഏറ്റവും വലിയ വെല്ലുവിളി എന്താണ്?`,
      Tamil: `${product.pitch} உங்கள் குழுவின் பல மணி நேரத்தைச் சேமிக்கவே இது வடிவமைக்கப்பட்டுள்ளது. தற்போது நீங்கள் சந்திக்கும் மிகப்பெரிய சவால் என்ன?`,
      Arabic: `${product.pitch} صُمّم هذا الحل خصيصًا ليوفّر على فريقكم ساعات طويلة. ما أكبر تحدٍّ تواجهونه حاليًا في هذا الموضوع؟`,
      English: `${product.pitch} It is purpose-built to save your team countless hours. What's the biggest challenge you're facing with this right now?`
    });
  }

  // 9. Closing push
  return say(lang, {
    Telugu: `మేము 100% సంతృప్తి హామీని మరియు ఉచిత ట్రయల్‌ను అందిస్తున్నాము. దీన్ని స్వయంగా ప్రయత్నించడానికి మీకు ఆసక్తి ఉందా?`,
    Hindi: `हम 14 दिनों का नो-रिस्क ट्रायल देते हैं जिसमें किसी क्रेडिट कार्ड की आवश्यकता नहीं होती। क्या आप इसे खुद आज़माना चाहेंगे?`,
    Malayalam: `ക്രെഡിറ്റ് കാർഡ് ഒന്നും വേണ്ട, 14 ദിവസത്തെ റിസ്‌ക് ഇല്ലാത്ത ട്രയൽ ഞങ്ങൾ നൽകുന്നു. നിങ്ങളുടെ ടീമിനായി അത് പരീക്ഷിക്കാൻ താൽപ്പര്യമുണ്ടോ?`,
    Tamil: `கிரெடிட் கார்ட் தேவையில்லை, 14 நாள் ஆபத்தில்லா சோதனையை நாங்கள் வழங்குகிறோம். உங்கள் குழுவுக்கு அதைச் சோதிக்க விரும்புகிறீர்களா?`,
    Arabic: `نمنحكم تجربة كاملة لمدة 14 يومًا بلا مخاطرة وبدون بطاقة ائتمان. هل تودّون تجربتها مع فريقكم؟`,
    English: `We offer a full 14-day zero-risk trial with no credit card required to get started. Would you be open to trying it out for your team?`
  });
}

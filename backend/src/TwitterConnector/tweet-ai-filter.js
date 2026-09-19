import crypto from 'node:crypto';
import { geminiClient } from '../services/ai/gemini-client.js';
import { logger } from '../config/logger.js';

export const TWEET_HAZARD_SCHEMA = {
  type: 'object',
  properties: {
    isEmergencyHazard: {
      type: 'boolean',
      description:
        'True ONLY if the text describes a genuine real-world emergency, disaster, hazard, accident, fire, explosion, chemical spill, structural collapse, or medical incident. False for metaphors, slang (e.g. "this song is fire", "fired from job"), sports, food, entertainment, politics, or casual non-emergency chatter.',
    },
    isRelevantToAhmedabadRegion: {
      type: 'boolean',
      description:
        'True if the incident occurs in or affects the Ahmedabad metropolitan area, Gujarat, or nearby surrounding operational sectors (e.g. SG Highway, Ashram Road, Paldi, Navrangpura, Maninagar, Sabarmati, Bopal, Gota, Odhav, Vastrapur, Satellite, C.G. Road, Sarkhej, Chandkheda, Naroda, CTM, ISKCON bridge, Thaltej, etc.), or if it is a general regional Gujarat hazard. False if explicitly located in another distant city or country (e.g. Mumbai, Delhi, London, Tokyo).',
    },
    hazardType: {
      type: 'string',
      enum: [
        'FIRE',
        'ACCIDENT',
        'FLOOD',
        'EXPLOSION',
        'HAZMAT',
        'COLLAPSE',
        'MEDICAL',
        'OTHER_HAZARD',
        'NONE',
      ],
      description: 'The classified emergency hazard category.',
    },
    severity: {
      type: 'string',
      enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
      description: 'Estimated urgency and threat severity level.',
    },
    extractedLocationName: {
      type: 'string',
      description:
        'Extracted neighborhood, landmark, road, or area in Ahmedabad (default to "Ahmedabad Metro" if specific locality unstated).',
    },
    latitude: {
      type: 'number',
      description:
        'Estimated latitude in Ahmedabad (bounded between 22.90 and 23.18, default 23.0225).',
    },
    longitude: {
      type: 'number',
      description:
        'Estimated longitude in Ahmedabad (bounded between 72.45 and 72.68, default 72.5714).',
    },
    confidence: {
      type: 'number',
      description:
        'Confidence score between 0.0 and 1.0 that this is an actual local Ahmedabad emergency hazard.',
    },
    reasoning: {
      type: 'string',
      description:
        'Brief 1-sentence analytical reasoning for why this is or is not an active local emergency in Ahmedabad.',
    },
  },
  required: [
    'isEmergencyHazard',
    'isRelevantToAhmedabadRegion',
    'hazardType',
    'severity',
    'extractedLocationName',
    'latitude',
    'longitude',
    'confidence',
    'reasoning',
  ],
};

export const TWEET_HAZARD_SYSTEM_PROMPT = `You are the ResQai AI Emergency Intelligence Officer dedicated to the Ahmedabad Metropolitan & Gujarat Disaster Operations Center.

Your critical duty is to read incoming live social media posts (Tweets/Bluesky/Citizen posts) and use deep contextual semantic understanding to:
1. FILTER OUT all false alarms, slang, metaphors, news metaphors, and non-emergencies:
   - "This track is fire 🔥" -> FALSE
   - "Got fired today" -> FALSE
   - "Team had a major crash in rankings" -> FALSE
   - "Explosion of flavors at this new cafe" -> FALSE
   - "Traffic was an absolute nightmare yesterday" (complaint, not active incident) -> FALSE
2. ONLY ACCEPT actual, urgent physical emergency incidents:
   - Active structure or vehicle fires
   - Road traffic accidents / collisions / pileups with injury or road block
   - Building or bridge structural collapse
   - Chemical / gas leaks or toxic hazmat plumes
   - Urban flash floods or drowning emergencies
   - Severe explosions, transformer blasts, or industrial emergencies
3. VERIFY LOCAL GEOGRAPHIC RELEVANCE TO AHMEDABAD:
   - Must be in Ahmedabad, Gujarat, or known local localities (SG Highway, Ashram Road, Paldi, Navrangpura, Maninagar, Sabarmati, Bopal, Gota, Odhav, Vastrapur, Satellite, C.G. Road, Sarkhej, Chandkheda, Naroda, CTM, ISKCON, Memnagar, Thaltej, Civil Hospital, etc.).
   - If a post describes an event in another distant city or country (e.g. "Fire in New York", "Accident on Mumbai-Pune Expressway", "Delhi metro delay"), reject with isRelevantToAhmedabadRegion=false.
4. Pinpoint Coordinates in Ahmedabad:
   - Latitude: 22.90 to 23.18 (default: 23.0225)
   - Longitude: 72.45 to 72.68 (default: 72.5714)
   
Return strictly valid JSON matching the schema.`;

// Known Ahmedabad landmarks for fallback heuristic
const AHMEDABAD_LANDMARKS = [
  { name: 'SG Highway', lat: 23.0289, lng: 72.5245 },
  { name: 'Paldi', lat: 23.0154, lng: 72.5684 },
  { name: 'Navrangpura', lat: 23.0362, lng: 72.5582 },
  { name: 'Maninagar', lat: 22.9975, lng: 72.6018 },
  { name: 'Sabarmati', lat: 23.0782, lng: 72.5849 },
  { name: 'Bopal', lat: 23.0318, lng: 72.4823 },
  { name: 'Gota', lat: 23.0891, lng: 72.5312 },
  { name: 'Odhav', lat: 23.0387, lng: 72.6612 },
  { name: 'Vastrapur', lat: 23.0354, lng: 72.5281 },
  { name: 'Satellite', lat: 23.0289, lng: 72.5245 },
  { name: 'Ashram Road', lat: 23.0391, lng: 72.5701 },
  { name: 'Chandkheda', lat: 23.1102, lng: 72.5834 },
  { name: 'Sarkhej', lat: 22.9892, lng: 72.5012 },
  { name: 'Naroda', lat: 23.0689, lng: 72.6512 },
  { name: 'Forge District', lat: 23.0596, lng: 72.5587 },
  { name: 'Civil Hospital', lat: 23.0538, lng: 72.6034 },
];

const FALSE_POSITIVE_SLANG = [
  'song is fire',
  'track is fire',
  'mixtape',
  'album is fire',
  'movie was fire',
  'food is fire',
  'got fired',
  'fired from',
  'fired me',
  'crash course',
  'market crash',
  'crypto crash',
  'price crash',
  'crash into bed',
  'explosion of flavor',
  'flood of tears',
  'flood of emotions',
  'flood of messages',
  'emergency meeting in among us',
  'fire emoji',
];

const aiAnalysisCache = new Map();

function hashText(text) {
  return crypto.createHash('sha256').update(text.trim().toLowerCase()).digest('hex').slice(0, 16);
}

/**
 * Fast heuristic fallback when Gemini is unconfigured or rate limited
 */
function heuristicAhmedabadFilter(text) {
  const lower = text.toLowerCase();

  // 1. Check for obvious slang false positives
  if (FALSE_POSITIVE_SLANG.some((slang) => lower.includes(slang))) {
    return {
      isEmergencyHazard: false,
      isRelevantToAhmedabadRegion: false,
      hazardType: 'NONE',
      severity: 'LOW',
      extractedLocationName: 'Unknown',
      latitude: 23.0225,
      longitude: 72.5714,
      confidence: 0.85,
      reasoning: 'Filtered out non-emergency slang / metaphorical phrasing.',
      aiVerified: false,
    };
  }

  // 2. Check for hazard keywords
  const hasFire = /\b(fire|blaze|smoke|flames|burning)\b/i.test(text);
  const hasAccident = /\b(accident|crash|collision|overturned|pileup)\b/i.test(text);
  const hasHazmat = /\b(gas leak|chemical|toxic|hazmat|explosion|blast)\b/i.test(text);
  const hasFlood = /\b(flood|waterlogging|submerged|inundated)\b/i.test(text);
  const hasCollapse = /\b(collapse|collapsed|debris|trapped)\b/i.test(text);

  const isHazard = hasFire || hasAccident || hasHazmat || hasFlood || hasCollapse;

  // 3. Check for Ahmedabad geographic keywords
  const matchedLoc = AHMEDABAD_LANDMARKS.find((lm) => lower.includes(lm.name.toLowerCase()));
  const mentionsAhmedabad =
    lower.includes('ahmedabad') ||
    lower.includes('amdavad') ||
    lower.includes('gujarat') ||
    Boolean(matchedLoc);

  const hazardType =
    hasFire ? 'FIRE' :
    hasAccident ? 'ACCIDENT' :
    hasHazmat ? 'HAZMAT' :
    hasFlood ? 'FLOOD' :
    hasCollapse ? 'COLLAPSE' : 'OTHER_HAZARD';

  const severity =
    hasExplosionOrCollapse(lower) ? 'CRITICAL' :
    hasFire || hasHazmat ? 'HIGH' : 'MEDIUM';

  const loc = matchedLoc || { name: 'Ahmedabad Metro Area', lat: 23.0225, lng: 72.5714 };

  return {
    isEmergencyHazard: isHazard,
    isRelevantToAhmedabadRegion: mentionsAhmedabad || isHazard,
    hazardType: isHazard ? hazardType : 'NONE',
    severity,
    extractedLocationName: loc.name,
    latitude: loc.lat,
    longitude: loc.lng,
    confidence: mentionsAhmedabad ? 0.88 : 0.72,
    reasoning: isHazard
      ? `Heuristically detected ${hazardType} hazard in ${loc.name}.`
      : 'No critical physical hazard detected.',
    aiVerified: false,
  };
}

function hasExplosionOrCollapse(text) {
  return text.includes('explosion') || text.includes('blast') || text.includes('collapse') || text.includes('trapped');
}

/**
 * Analyzes tweet with Google Gemini API for deep semantic contextual understanding & Ahmedabad geo-filtering.
 */
export async function filterTweetWithGemini(tweetText, author = '') {
  if (!tweetText || typeof tweetText !== 'string') {
    return { isEmergencyHazard: false, isRelevantToAhmedabadRegion: false };
  }

  const textHash = hashText(tweetText);
  if (aiAnalysisCache.has(textHash)) {
    return aiAnalysisCache.get(textHash);
  }

  // Pre-screen obvious false positives before spending API calls
  const lower = tweetText.toLowerCase();
  if (FALSE_POSITIVE_SLANG.some((slang) => lower.includes(slang))) {
    const rejected = {
      isEmergencyHazard: false,
      isRelevantToAhmedabadRegion: false,
      hazardType: 'NONE',
      severity: 'LOW',
      extractedLocationName: 'Non-Emergency',
      latitude: 23.0225,
      longitude: 72.5714,
      confidence: 0.95,
      reasoning: 'Slang/metaphor detected in pre-screen.',
      aiVerified: false,
    };
    aiAnalysisCache.set(textHash, rejected);
    return rejected;
  }

  // If Gemini client is not configured, use heuristic
  if (!geminiClient.isConfigured()) {
    const result = heuristicAhmedabadFilter(tweetText);
    aiAnalysisCache.set(textHash, result);
    return result;
  }

  try {
    const userPrompt = `ANALYZE THE FOLLOWING SOCIAL MEDIA POST:
Author: ${author || '@citizen'}
Text: "${tweetText}"

Evaluate whether this describes a genuine real-world emergency hazard occurring in or relevant to Ahmedabad/Gujarat, extract coordinates in Ahmedabad, classify the hazard type and severity, and provide your reasoning.`;

    const { output } = await geminiClient.generateStructured(userPrompt, {
      systemPrompt: TWEET_HAZARD_SYSTEM_PROMPT,
      responseSchema: TWEET_HAZARD_SCHEMA,
    });

    const isHazard = Boolean(output.isEmergencyHazard);
    const isAhmedabad = Boolean(output.isRelevantToAhmedabadRegion);

    // Validate coordinates to keep them inside Ahmedabad bounding box
    let lat = Number(output.latitude);
    let lng = Number(output.longitude);
    if (!Number.isFinite(lat) || lat < 22.85 || lat > 23.25) lat = 23.0225;
    if (!Number.isFinite(lng) || lng < 72.40 || lng > 72.75) lng = 72.5714;

    const analyzedResult = {
      isEmergencyHazard: isHazard,
      isRelevantToAhmedabadRegion: isAhmedabad,
      hazardType: output.hazardType || 'OTHER_HAZARD',
      severity: output.severity || 'HIGH',
      extractedLocationName: output.extractedLocationName || 'Ahmedabad Metro',
      latitude: lat,
      longitude: lng,
      confidence: Number(output.confidence ?? 0.92),
      reasoning: output.reasoning || 'Context verified by Google Gemini AI.',
      aiVerified: true,
      aiModel: geminiClient.model,
    };

    logger.info(
      {
        isHazard,
        isAhmedabad,
        hazardType: analyzedResult.hazardType,
        loc: analyzedResult.extractedLocationName,
        reasoning: analyzedResult.reasoning,
      },
      'ai.tweet_filtered_with_gemini'
    );

    aiAnalysisCache.set(textHash, analyzedResult);
    return analyzedResult;
  } catch (error) {
    logger.warn({ err: error.message }, 'ai.tweet_gemini_filter_failed_using_fallback');
    const fallbackResult = heuristicAhmedabadFilter(tweetText);
    aiAnalysisCache.set(textHash, fallbackResult);
    return fallbackResult;
  }
}

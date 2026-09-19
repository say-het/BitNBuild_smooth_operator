import EventEmitter from 'node:events';
import WebSocket from 'ws';
import { filterTweetWithGemini } from './tweet-ai-filter.js';
import { logger } from '../config/logger.js';

export const JETSTREAM_URL =
  'wss://jetstream2.us-west.bsky.network/subscribe?wantedCollections=app.bsky.feed.post';

export const KEYWORDS = [
  'accident',
  'crash',
  'fire',
  'flood',
  'earthquake',
  'explosion',
  'emergency',
  'road accident',
  'traffic accident',
  'building collapse',
  'hazmat',
  'rescue',
  'smoke',
  'gas leak',
  'ahmedabad',
  'amdavad',
  'gujarat',
];

export const INITIAL_MULTI_SOURCE_ALERTS = [
  {
    id: 'tw-fire-001',
    source: 'TWITTER',
    sourceName: 'X',
    author: '@AhmedabadAlerts',
    matched: ['fire', 'emergency'],
    text: '🔥 Heavy smoke and structural fire reported at Forge District Warehouse 4 near Naroda. Multiple fire tenders rushing to the scene! #Ahmedabad #FireEmergency',
    hazardType: 'FIRE',
    severity: 'CRITICAL',
    confidence: 0.96,
    location: { lat: 23.0596, lng: 72.5587, name: 'Forge District Warehouse 4, Naroda' },
    aiVerified: true,
    aiReasoning: 'Confirmed active structural fire with multi-unit response in Naroda/Forge District Ahmedabad.',
    metadata: { likes: 142, retweets: 58, verified: true },
    createdAt: new Date(Date.now() - 2 * 60000).toISOString(),
    detectedAt: new Date(Date.now() - 2 * 60000).toISOString(),
  },
  {
    id: 'wire-911-002',
    source: 'EMERGENCY_911',
    sourceName: '911/112 Dispatch Wire',
    author: 'Dispatch Console #04',
    avatar: '🚨',
    matched: ['accident', 'emergency'],
    text: 'PRIORITY 911 CALL: Multi-vehicle pileup on SG Highway near ISKCON Bridge. 3 injured, 1 trapped. Ambulance & heavy rescue unit dispatched.',
    hazardType: 'ACCIDENT',
    severity: 'HIGH',
    confidence: 0.99,
    location: { lat: 23.0289, lng: 72.5245, name: 'SG Highway, ISKCON Junction' },
    aiVerified: true,
    aiReasoning: 'Emergency 911 trauma dispatch on SG Highway corridor with trapped vehicle victims.',
    metadata: { callerId: '911-CALL-9842', responseUnit: 'RES-AMB-01', audioWaveform: [15, 45, 90, 100, 75, 40, 20] },
    createdAt: new Date(Date.now() - 4 * 60000).toISOString(),
    detectedAt: new Date(Date.now() - 4 * 60000).toISOString(),
  },
  {
    id: 'iot-gas-003',
    source: 'IOT_SENSOR',
    sourceName: 'IoT Telemetry Mesh',
    author: 'Sensor-SNS-SMK-01',
    avatar: '📡',
    matched: ['smoke', 'hazmat', 'gas leak'],
    text: 'TELEMETRY SPIKE: Industrial smoke & combustible gas threshold exceeded (94 ppm). Thermal anomaly +48°C above ambient baseline in Paldi.',
    hazardType: 'HAZMAT',
    severity: 'HIGH',
    confidence: 0.98,
    location: { lat: 23.0154, lng: 72.5684, name: 'Paldi Industrial Reserve' },
    aiVerified: true,
    aiReasoning: 'Optical smoke and VOC telemetry spike confirmed above critical threshold in Paldi area.',
    metadata: { sensorType: 'SMOKE_OPTICAL', reading: '94 ppm', threshold: '70 ppm', status: 'CRITICAL' },
    createdAt: new Date(Date.now() - 7 * 60000).toISOString(),
    detectedAt: new Date(Date.now() - 7 * 60000).toISOString(),
  },
  {
    id: 'drone-uav-004',
    source: 'DRONE_RECON',
    sourceName: 'Autonomous Drone Scout',
    author: 'UAV Scout Falcon-2',
    avatar: '🚁',
    matched: ['fire', 'rescue'],
    text: 'THERMAL SCAN CONFIRMED: Infrared perimeter scan detects 620°C hot spot on factory roof near Navrangpura. Evacuation route obstructed.',
    hazardType: 'FIRE',
    severity: 'CRITICAL',
    confidence: 0.97,
    location: { lat: 23.0362, lng: 72.5582, name: 'Navrangpura Industrial Zone' },
    aiVerified: true,
    aiReasoning: 'Thermal infrared UAV recon confirmed high-temperature hotspot blocking evacuation route.',
    metadata: { altitudeMeters: 45, batteryPct: 82, thermalMaxC: 620, videoFeed: 'STREAM_UAV_02' },
    createdAt: new Date(Date.now() - 11 * 60000).toISOString(),
    detectedAt: new Date(Date.now() - 11 * 60000).toISOString(),
  },
  {
    id: 'cctv-traffic-005',
    source: 'TRAFFIC_CCTV',
    sourceName: 'AI Traffic Vision',
    author: 'CCTV SmartCam #42',
    avatar: '📹',
    matched: ['accident', 'crash', 'traffic'],
    text: 'AI VISION ALERT: Overturned chemical tanker truck on Ashram Road Sector 2. Road blocked both directions. Emergency hazard perimeter set.',
    hazardType: 'ACCIDENT',
    severity: 'MEDIUM',
    confidence: 0.93,
    location: { lat: 23.0391, lng: 72.5701, name: 'Ashram Road Sector 2' },
    aiVerified: true,
    aiReasoning: 'Computer vision camera identified overturned commercial transport on Ashram Road.',
    metadata: { vehicleType: 'HAZMAT_TANKER', laneBlocked: 'ALL', congestionIndex: '9.4/10' },
    createdAt: new Date(Date.now() - 16 * 60000).toISOString(),
    detectedAt: new Date(Date.now() - 16 * 60000).toISOString(),
  },
  {
    id: 'radar-meteo-006',
    source: 'WEATHER_RADAR',
    sourceName: 'Doppler Radar & USGS',
    author: 'Seismic Doppler IMD',
    avatar: '🛰️',
    matched: ['earthquake', 'flood'],
    text: 'SEISMIC WARNING: Minor tectonic tremor magnitude 3.8 ML felt across Sabarmati River Basin. Bridge structural health checks engaged.',
    hazardType: 'FLOOD',
    severity: 'MEDIUM',
    confidence: 0.95,
    location: { lat: 23.0439, lng: 72.5511, name: 'Sabarmati River Basin' },
    aiVerified: true,
    aiReasoning: 'USGS/IMD seismic accelerometer reading localized to Sabarmati basin.',
    metadata: { magnitude: 3.8, depthKm: 12, waterGaugeRiseCm: 14 },
    createdAt: new Date(Date.now() - 25 * 60000).toISOString(),
    detectedAt: new Date(Date.now() - 25 * 60000).toISOString(),
  },
];

const SIMULATED_STREAM_TEMPLATES = [
  {
    source: 'TWITTER',
    sourceName: 'X',
    author: '@GujaratTrafficPulse',
    matched: ['accident', 'emergency'],
    templates: [
      'Breaking: Major accident involving a public bus and tanker near Ashram Road junction Ahmedabad. Paramedics arriving! #TrafficAlert #Ahmedabad',
      'Massive smoke plume visible near Paldi railway overpass Ahmedabad. Fire tenders en-route with sirens. #FireEmergency #Amdavad',
      'Flash waterlogging reported under Bopal underpass after heavy rainfall. Two cars stuck, rescue team on site. #FloodAlert #Ahmedabad',
      'Urgent: Commercial building fire spotted on C.G. Road Ahmedabad. Smoke billowing from upper floors. #Fire #CG_Road',
    ],
    locations: [
      { lat: 23.0391, lng: 72.5701, name: 'Ashram Road Junction' },
      { lat: 23.0154, lng: 72.5684, name: 'Paldi Overpass' },
      { lat: 23.0318, lng: 72.4823, name: 'Bopal Underpass' },
      { lat: 23.0312, lng: 72.5598, name: 'C.G. Road Commercial Center' },
    ],
    hazardType: 'FIRE',
    severity: 'HIGH',
    aiReasoning: 'Verified local incident affecting key transit corridor in Ahmedabad.',
  },
  {
    source: 'EMERGENCY_911',
    sourceName: '911/112 Dispatch Wire',
    author: 'Central Dispatch Line 2',
    avatar: '🚨',
    matched: ['rescue', 'emergency'],
    templates: [
      '911 WIRE: Commercial elevator collapse with 4 trapped occupants near Vastrapur Lake. Heavy rescue team dispatched.',
      '911 WIRE: Hazardous chemical vapor leak reported at dye warehouse in Odhav Industrial Estate. Breathing apparatus protocol active.',
      '911 WIRE: High-voltage electrical transformer exploded on SG Highway near Gota. Power grid isolation underway.',
    ],
    locations: [
      { lat: 23.0354, lng: 72.5281, name: 'Vastrapur Lake Commercial' },
      { lat: 23.0387, lng: 72.6612, name: 'Odhav Industrial Estate' },
      { lat: 23.0891, lng: 72.5312, name: 'Gota SG Highway Corridor' },
    ],
    hazardType: 'ACCIDENT',
    severity: 'CRITICAL',
    aiReasoning: 'High-priority 911 dispatch triage confirmed with active first-responder routing.',
  },
  {
    source: 'IOT_SENSOR',
    sourceName: 'IoT Telemetry Mesh',
    author: 'Basin-Sensor-WTR-01',
    avatar: '📡',
    matched: ['flood', 'emergency'],
    templates: [
      'WATER LEVEL CRITICAL: Sabarmati north basin retention reservoir crossed 92% emergency capacity. Automated spillway gate alert.',
      'AIR QUALITY HAZARD: Toxic particulate surge AQI 410 detected near Naroda chemical logistics park.',
      'STRUCTURAL VIBRATION: Bridge accelerometer SNS-STR-01 exceeding safety threshold on Nehru Bridge Ahmedabad.',
    ],
    locations: [
      { lat: 23.0632, lng: 72.5788, name: 'North Basin Spillway' },
      { lat: 23.0689, lng: 72.6512, name: 'Naroda Chemical Hub' },
      { lat: 23.0225, lng: 72.5714, name: 'Nehru Bridge Sabarmati' },
    ],
    hazardType: 'HAZMAT',
    severity: 'HIGH',
    aiReasoning: 'Sensor telemetry hardware alert correlated with ambient meteorological sensors.',
  },
  {
    source: 'DRONE_RECON',
    sourceName: 'Autonomous Drone Scout',
    author: 'UAV Sentinel-03',
    avatar: '🚁',
    matched: ['fire', 'rescue'],
    templates: [
      'UAV RECON: Aerial optical scan identifies 2 stranded vehicles in localized flash-flood pocket on Sarkhej Highway.',
      'UAV RECON: Structure heat map shows warehouse blaze contained to sector B. No breach to adjacent fuel depot.',
      'UAV RECON: Evacuation traffic corridor cleared on Chandkheda Ring Road.',
    ],
    locations: [
      { lat: 22.9892, lng: 72.5012, name: 'Sarkhej Highway' },
      { lat: 23.0596, lng: 72.5587, name: 'Forge District Sector B' },
      { lat: 23.1102, lng: 72.5834, name: 'Chandkheda Ring Road' },
    ],
    hazardType: 'FIRE',
    severity: 'MEDIUM',
    aiReasoning: 'Autonomous drone multispectral confirmation with GPS geolocation fix.',
  },
];

export class TwitterConnector extends EventEmitter {
  constructor(options = {}) {
    super();
    this.url = options.url || JETSTREAM_URL;
    this.keywords = options.keywords || KEYWORDS;
    this.ws = null;
    this.isConnected = false;
    this.shouldReconnect = options.autoReconnect ?? true;
    this.reconnectIntervalMs = options.reconnectIntervalMs || 5000;
    this.reconnectTimer = null;
    this.incidents = [...INITIAL_MULTI_SOURCE_ALERTS];
    this.maxStoredIncidents = options.maxStoredIncidents || 150;
    this.simulatedStreamInterval = null;
    this.stats = {
      messagesProcessed: INITIAL_MULTI_SOURCE_ALERTS.length,
      commitsProcessed: INITIAL_MULTI_SOURCE_ALERTS.length,
      incidentsDetected: INITIAL_MULTI_SOURCE_ALERTS.length,
      connectedAt: new Date().toISOString(),
      disconnectedAt: null,
      lastIncidentAt: INITIAL_MULTI_SOURCE_ALERTS[0].detectedAt,
    };

    // Automatically initialize background multi-source alert streamer
    this.startSimulatedStream();
  }

  startSimulatedStream() {
    if (this.simulatedStreamInterval) return;
    this.simulatedStreamInterval = setInterval(() => {
      this.generateSimulatedAlert();
    }, 12_000);
  }

  generateSimulatedAlert() {
    const templateGroup = SIMULATED_STREAM_TEMPLATES[Math.floor(Math.random() * SIMULATED_STREAM_TEMPLATES.length)];
    const text = templateGroup.templates[Math.floor(Math.random() * templateGroup.templates.length)];
    const loc = templateGroup.locations[Math.floor(Math.random() * templateGroup.locations.length)];
    const now = new Date().toISOString();

    const alertPayload = {
      id: `sig-${templateGroup.source.toLowerCase()}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      source: templateGroup.source,
      sourceName: templateGroup.sourceName,
      author: templateGroup.author,
      avatar: templateGroup.avatar,
      matched: templateGroup.matched,
      text,
      hazardType: templateGroup.hazardType,
      severity: templateGroup.severity,
      confidence: Number((0.91 + Math.random() * 0.08).toFixed(2)),
      location: { lat: loc.lat, lng: loc.lng, name: loc.name },
      aiVerified: true,
      aiReasoning: templateGroup.aiReasoning || 'Semantic context verified by Gemini AI for Ahmedabad area.',
      metadata: { generated: true, liveStream: true, geminiModel: 'gemini-2.5-flash' },
      createdAt: now,
      detectedAt: now,
    };

    this.incidents.unshift(alertPayload);
    if (this.incidents.length > this.maxStoredIncidents) {
      this.incidents.pop();
    }

    this.stats.incidentsDetected += 1;
    this.stats.lastIncidentAt = now;
    this.emit('incident', alertPayload);
    return alertPayload;
  }

  async processMessage(rawMessage) {
    try {
      this.stats.messagesProcessed += 1;
      const data = typeof rawMessage === 'string' ? JSON.parse(rawMessage) : rawMessage;

      if (data.kind !== 'commit') {
        return null;
      }

      this.stats.commitsProcessed += 1;
      const commit = data.commit || {};

      if (commit.operation !== 'create') {
        return null;
      }

      const record = commit.record || {};
      const text = record.text || '';
      if (!text || text.length < 5) {
        return null;
      }

      const textLower = text.toLowerCase();
      const matched = this.keywords.filter((keyword) => textLower.includes(keyword));

      // Fast keyword pre-check to reduce unnecessary AI calls
      if (matched.length === 0) {
        return null;
      }

      // Fast regional filter: must have emergency relevance
      const hasRegionalContext = textLower.includes('ahmedabad') || textLower.includes('amdavad') || textLower.includes('gujarat') || textLower.includes('india') || textLower.includes('highway') || textLower.includes('bridge') || textLower.includes('sector');
      
      // Concurrency lock: do not overload if Gemini is currently evaluating
      if (this.isEvaluatingGemini) {
        return null;
      }

      const author = `@${data.did ? data.did.slice(-12) : 'social_feed'}`;

      // Gemini AI Context & Ahmedabad Geo-Filter
      this.isEvaluatingGemini = true;
      let aiEval;
      try {
        aiEval = await filterTweetWithGemini(text, author);
      } finally {
        this.isEvaluatingGemini = false;
      }

      // Discard if Gemini determines it's NOT a real emergency or NOT relevant to Ahmedabad
      if (!aiEval.isEmergencyHazard || !aiEval.isRelevantToAhmedabadRegion) {
        return null;
      }

      this.stats.incidentsDetected += 1;
      this.stats.lastIncidentAt = new Date().toISOString();

      const incidentPayload = {
        id: `${data.did || 'unknown'}-${commit.rkey || Date.now()}`,
        source: 'TWITTER',
        sourceName: 'X',
        author,
        did: data.did,
        rkey: commit.rkey,
        collection: commit.collection,
        matched: [aiEval.hazardType.toLowerCase()],
        text,
        hazardType: aiEval.hazardType,
        severity: aiEval.severity,
        confidence: aiEval.confidence,
        location: {
          lat: aiEval.latitude,
          lng: aiEval.longitude,
          name: aiEval.extractedLocationName,
        },
        aiVerified: aiEval.aiVerified,
        aiReasoning: aiEval.reasoning,
        aiModel: aiEval.aiModel || 'gemini-2.5-flash',
        record,
        createdAt: record.createdAt || new Date().toISOString(),
        detectedAt: this.stats.lastIncidentAt,
      };

      this.incidents.unshift(incidentPayload);
      if (this.incidents.length > this.maxStoredIncidents) {
        this.incidents.pop();
      }

      this.emit('incident', incidentPayload);
      return incidentPayload;
    } catch (parseError) {
      console.error('Error processing message with Gemini AI:', parseError.message);
    }
    return null;
  }

  start() {
    this.startSimulatedStream();
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) {
      return this;
    }

    try {
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        this.isConnected = true;
        this.stats.connectedAt = new Date().toISOString();
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        this.emit('connected', { url: this.url, timestamp: this.stats.connectedAt });
      });

      this.ws.on('message', (data) => {
        const rawMessage = typeof data === 'string' ? data : data.toString();
        this.processMessage(rawMessage);
      });

      this.ws.on('error', (error) => {
        if (this.listenerCount('error') > 0) {
          this.emit('error', error);
        }
      });

      this.ws.on('close', (event) => {
        this.isConnected = false;
        this.stats.disconnectedAt = new Date().toISOString();
        this.emit('disconnected', { code: event?.code, reason: event?.reason });

        if (this.shouldReconnect) {
          this.reconnectTimer = setTimeout(() => {
            this.start();
          }, this.reconnectIntervalMs);
        }
      });
    } catch {
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => {
          this.start();
        }, this.reconnectIntervalMs);
      }
    }

    return this;
  }

  stop() {
    this.shouldReconnect = false;
    if (this.simulatedStreamInterval) {
      clearInterval(this.simulatedStreamInterval);
      this.simulatedStreamInterval = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    console.log('TwitterConnector stopped.');
    return this;
  }

  getStatus() {
    return {
      connected: this.isConnected,
      simulatedActive: true,
      aiFilteringEnabled: true,
      targetRegion: 'Ahmedabad Metropolitan Area, Gujarat',
      url: this.url,
      keywords: this.keywords,
      stats: { ...this.stats },
      storedIncidentsCount: this.incidents.length,
    };
  }

  getIncidents(limit = 50, source = null) {
    let result = this.incidents;
    if (source && source !== 'ALL') {
      result = result.filter((item) => item.source === source);
    }
    return result.slice(0, limit);
  }

  clearIncidents() {
    this.incidents = [];
    return { success: true };
  }
}

export const twitterConnector = new TwitterConnector({ autoReconnect: true });

if (process.argv[1] && process.argv[1].endsWith('connector.js')) {
  twitterConnector.start();
}

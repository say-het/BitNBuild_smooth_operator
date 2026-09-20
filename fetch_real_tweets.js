import { WebSocket } from 'ws';
import http from 'node:https';

const KEYWORD = 'fire';
const JETSTREAM_URL = 'wss://jetstream2.us-west.bsky.network/subscribe?wantedCollections=app.bsky.feed.post';

console.log('='.repeat(70));
console.log(`🔥 STANDALONE REAL-TIME POST FETCHING SCRIPT`);
console.log(`Searching for keyword: "${KEYWORD}"`);
console.log('='.repeat(70));

// ------------------------------------------------------------------
// 1. REAL-TIME FIREHOSE STREAM (Bluesky / Jetstream)
// ------------------------------------------------------------------
function startJetstreamStream() {
  console.log(`\n[1/2] Connecting to real-time Jetstream feed (${JETSTREAM_URL})...\n`);

  try {
    const ws = new WebSocket(JETSTREAM_URL);

    ws.on('open', () => {
      console.log('✅ Connected to live real-time stream! Listening for posts containing "fire"...\n');
    });

    let matchCount = 0;

    ws.on('message', (data) => {
      try {
        const payload = JSON.parse(data.toString());
        if (payload.kind !== 'commit' || payload.commit?.operation !== 'create') return;

        const text = payload.commit?.record?.text || '';
        const textLower = text.toLowerCase();

        if (textLower.includes(KEYWORD)) {
          matchCount += 1;
          const timestamp = payload.commit?.record?.createdAt || new Date().toISOString();
          const author = payload.did || 'unknown';

          console.log(`🚨 REAL POST #${matchCount} [${new Date(timestamp).toLocaleTimeString()}]`);
          console.log(`Author : ${author}`);
          console.log(`Content: ${text.trim()}`);
          console.log('-'.repeat(70));
        }
      } catch (err) {
        // ignore parse error
      }
    });

    ws.on('error', (err) => {
      console.error('❌ WebSocket error:', err.message);
    });

    ws.on('close', () => {
      console.log('⚠️ Live stream closed. Reconnecting in 3s...');
      setTimeout(startJetstreamStream, 3000);
    });
  } catch (err) {
    console.error('Failed to create WebSocket:', err.message);
  }
}

// ------------------------------------------------------------------
// 2. OPTIONAL TWITTER / X API v2 (if TWITTER_BEARER_TOKEN is set)
// ------------------------------------------------------------------
function fetchTwitterApiV2() {
  const token = process.env.TWITTER_BEARER_TOKEN;
  if (!token) {
    console.log('[2/2] Twitter API v2 token not provided in environment (TWITTER_BEARER_TOKEN).');
    console.log('      To test official X/Twitter API v2, set TWITTER_BEARER_TOKEN=your_token and run this script again.\n');
    return;
  }

  console.log('[2/2] Fetching recent tweets from Twitter API v2...');
  const options = {
    hostname: 'api.twitter.com',
    path: `/2/tweets/search/recent?query=${encodeURIComponent(KEYWORD)}&tweet.fields=created_at,author_id`,
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'StandaloneTweetFetcher/1.0',
    },
  };

  http.get(options, (res) => {
    let body = '';
    res.on('data', (chunk) => (body += chunk));
    res.on('end', () => {
      try {
        const json = JSON.parse(body);
        if (json.data && Array.isArray(json.data)) {
          console.log(`\nFound ${json.data.length} recent tweets from X API v2:`);
          json.data.forEach((t) => {
            console.log(`- [${t.created_at}] ${t.text}`);
          });
        } else {
          console.log('X API Response:', json);
        }
      } catch (e) {
        console.error('Failed to parse X API response:', e.message);
      }
    });
  }).on('error', (err) => {
    console.error('Twitter API request failed:', err.message);
  });
}

// Execute
fetchTwitterApiV2();
startJetstreamStream();

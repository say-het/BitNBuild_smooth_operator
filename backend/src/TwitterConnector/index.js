import { TwitterConnector, twitterConnector, KEYWORDS, JETSTREAM_URL } from './connector.js';
import { twitterConnectorRouter } from './routes.js';

export {
  TwitterConnector,
  twitterConnector,
  twitterConnectorRouter,
  KEYWORDS,
  JETSTREAM_URL,
};

export default twitterConnector;

// Allow direct execution: `node src/TwitterConnector/index.js`
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  twitterConnector.start();
}

const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { URL } = require('url');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function resolveProvider() {
  const provider = String(process.env.BLOCKCHAIN_PROVIDER || 'local').trim().toLowerCase();
  return provider === 'fabric' ? 'fabric' : 'local';
}

function buildBlockHash({ previousHash, blockType, recordRef, offchainUri, payloadHash, timestamp }) {
  return sha256(`${previousHash}|${blockType}|${recordRef}|${offchainUri}|${payloadHash}|${timestamp}`);
}

async function appendViaFabricGateway(payload) {
  const gatewayUrl = String(process.env.FABRIC_GATEWAY_URL || '').trim();
  if (!gatewayUrl) {
    throw new Error('FABRIC_GATEWAY_URL is required when BLOCKCHAIN_PROVIDER=fabric');
  }

  const endpoint = `${gatewayUrl.replace(/\/$/, '')}/ledger/append`;
  const headers = {
    'content-type': 'application/json'
  };

  const apiKey = String(process.env.FABRIC_GATEWAY_API_KEY || '').trim();
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const body = await requestJson(endpoint, {
    method: 'POST',
    headers,
    body: payload
  });

  return {
    tx_id: body?.txId || body?.tx_id || null,
    block_ref: body?.blockRef || body?.block_ref || null,
    current_hash: body?.currentHash || body?.current_hash || payload.current_hash,
    ledger_timestamp: body?.timestamp || body?.ledger_timestamp || payload.timestamp
  };
}

function requestJson(rawUrl, options) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(rawUrl);
    const client = urlObj.protocol === 'https:' ? https : http;

    const payloadString = JSON.stringify(options.body || {});
    const req = client.request(
      {
        protocol: urlObj.protocol,
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: `${urlObj.pathname}${urlObj.search}`,
        method: options.method || 'GET',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payloadString),
          ...(options.headers || {})
        }
      },
      res => {
        let data = '';
        res.on('data', chunk => {
          data += chunk;
        });
        res.on('end', () => {
          let parsed = {};
          try {
            parsed = data ? JSON.parse(data) : {};
          } catch (_) {
            parsed = {};
          }

          if (Number(res.statusCode || 500) >= 400) {
            return reject(new Error(parsed?.message || 'Failed to anchor hash on Fabric gateway'));
          }

          return resolve(parsed);
        });
      }
    );

    req.on('error', err => reject(err));
    req.write(payloadString);
    req.end();
  });
}

class BlockchainLedgerService {
  static async anchorHashBlock({ blockType, recordRef, offchainUri, payloadHash, previousHash }) {
    const timestamp = new Date().toISOString();
    const currentHash = buildBlockHash({
      previousHash,
      blockType,
      recordRef,
      offchainUri,
      payloadHash,
      timestamp
    });

    const provider = resolveProvider();
    if (provider === 'fabric') {
      const fabricResult = await appendViaFabricGateway({
        block_type: blockType,
        record_ref: recordRef,
        offchain_uri: offchainUri,
        payload_hash: payloadHash,
        previous_hash: previousHash,
        current_hash: currentHash,
        timestamp
      });

      return {
        provider,
        previous_hash: previousHash,
        current_hash: String(fabricResult.current_hash || currentHash),
        ledger_timestamp: fabricResult.ledger_timestamp,
        external_tx_id: fabricResult.tx_id,
        external_block_ref: fabricResult.block_ref
      };
    }

    return {
      provider: 'local',
      previous_hash: previousHash,
      current_hash: currentHash,
      ledger_timestamp: timestamp,
      external_tx_id: null,
      external_block_ref: null
    };
  }
}

module.exports = BlockchainLedgerService;

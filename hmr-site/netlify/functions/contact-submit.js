const crypto = require('crypto');

const REQUIRED_FIELDS = ['name', 'email', 'message'];
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

const base64url = (input) => Buffer.from(input).toString('base64url');

const createSignedJwt = ({ serviceAccountEmail, privateKey }) => {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccountEmail,
    scope: GOOGLE_SHEETS_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64url');
  return `${unsigned}.${signature}`;
};

const fetchAccessToken = async ({ serviceAccountEmail, privateKey }) => {
  const assertion = createSignedJwt({ serviceAccountEmail, privateKey });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });

  if (!response.ok) {
    throw new Error(`OAuth token request failed: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const payload = JSON.parse(event.body || '{}');
    const missing = REQUIRED_FIELDS.filter((field) => !String(payload[field] || '').trim());

    if (missing.length) {
      return json(400, { error: `Missing required fields: ${missing.join(', ')}` });
    }

    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
    const range = process.env.GOOGLE_SHEETS_RANGE || 'Sheet1!A:F';

    if (!serviceAccountEmail || !privateKey || !spreadsheetId) {
      return json(500, { error: 'Missing Google Sheets environment configuration.' });
    }

    const token = await fetchAccessToken({ serviceAccountEmail, privateKey });
    const row = [
      new Date().toISOString(),
      payload.name,
      payload.organisation || '',
      payload.email,
      payload.message,
      event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || ''
    ];

    const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;

    const appendResponse = await fetch(sheetsUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: [row] })
    });

    if (!appendResponse.ok) {
      throw new Error(`Sheets append failed: ${appendResponse.status}`);
    }

    return json(200, { ok: true });
  } catch (error) {
    console.error('Contact submit failed', error);
    return json(500, { error: 'Unable to submit enquiry right now.' });
  }
};

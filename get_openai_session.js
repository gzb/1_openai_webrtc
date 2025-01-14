process.env.NODE_OPTIONS = '--openssl-legacy-provider';

import express from "express";
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

dotenv.config();

const app = express();
app.use(express.json());

// Get __dirname equivalent in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Debugging: Print __dirname and the static files path
console.log('__dirname:', __dirname);
console.log('Static files path:', path.join(__dirname, 'public'));

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));


// AES encryption function
function aesEncrypt(text, key) {
  const hashKey = crypto.createHash('sha256').update(key).digest();
  const cipher = crypto.createCipheriv('aes-256-cbc', hashKey, Buffer.alloc(16, 0));
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return encrypted;
}

// AES decryption function
function aesDecrypt(encrypted, key) {
  const hashKey = crypto.createHash('sha256').update(key).digest();
  const decipher = crypto.createDecipheriv('aes-256-cbc', hashKey, Buffer.alloc(16, 0));
  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Convert DES token to 6-digit number
function desTokenToNumber(desToken) {
  const hash = crypto.createHash('sha256').update(desToken).digest('hex');
  return parseInt(hash.slice(0, 6), 16) % 1000000;
}


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// User authentication
app.post('/login', (req, res) => {
  const { user_name, user_pass } = req.body;
  const des_pass = '12345678'; // 8-character key
  const des_token = aesEncrypt(user_name + des_pass, des_pass);
  const user_ok_password = desTokenToNumber(des_token).toString().padStart(6, '0');

  if (user_pass === user_ok_password) {
    const currentTime = new Date().toISOString();
    const user_token = aesEncrypt(`${user_name}|${user_pass}|${des_pass}|${currentTime}`, des_pass);
    res.json({ success: true, user_token });
  } else {
    res.json({ success: false });
  }
});

// Get pass by username
app.post('/get_pass_by_username', (req, res) => {
  const { user_name } = req.body;
  const des_pass = '12345678'; // 8-character key
  const des_token = aesEncrypt(user_name + des_pass, des_pass);
  const user_ok_password = desTokenToNumber(des_token).toString().padStart(6, '0');
  res.json({ success: true, user_ok_password });
});

// Validate user token
function validateUserToken(user_token) {
  if (!user_token) {
    return false;
  }
  const des_pass = '12345678'; // 8-character key
  const decrypted = aesDecrypt(user_token, des_pass);
  const [user_name, user_pass, des_pass_from_token, time] = decrypted.split('|');
  const tokenTime = new Date(time);
  const currentTime = new Date();
  const timeDiff = (currentTime - tokenTime) / (1000 * 60 * 60 * 24); // Time difference in days
  return timeDiff <= 1;
}

// Validate user token endpoint
app.post('/validate_token', (req, res) => {
  const { user_token } = req.body;
  const isValid = validateUserToken(user_token);
  res.json({ valid: isValid });
});

// An endpoint which would work with the client code above - it returns
// the contents of a REST API request to this protected endpoint
app.get("/session", async (req, res) => {
  const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
  //const r = await fetch("https://webrtc.fsou.com/openai_realtime", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-realtime-preview-2024-12-17",
      voice: "verse",
    }),
  });
  const data = await r.json();

  // Send back the JSON we received from the OpenAI REST API
  res.send(data);
});

// New endpoint to validate user token and get OpenAI session
app.post('/session_by_token', async (req, res) => {
  const { user_token } = req.body;
  if (validateUserToken(user_token)) {
    try {
      const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-realtime-preview-2024-12-17",
          voice: "verse",
        }),
      });
      const data = await r.json();
      res.send(data);
    } catch (error) {
      res.status(500).send({ error: 'Failed to get OpenAI session' });
    }
  } else {
    res.status(401).send({ error: 'User not logged in' });
  }
});

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
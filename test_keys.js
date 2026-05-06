import fs from 'fs';
import path from 'path';

// Parse .env.local
const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

const parseEnv = (key) => {
  const match = envContent.match(new RegExp(`${key}="(.*?)"`));
  if (match) return match[1].split(',').map(k => k.trim()).filter(Boolean);
  return [];
};

const keys = {
  SambaNova: parseEnv('SAMBANOVA_API_KEY'),
  Groq: parseEnv('GROQ_API_KEY'),
  Cerebras: parseEnv('CEREBRAS_API_KEY')
};

const models = {
  SambaNova: ['DeepSeek-V3.2'],
  Groq: ['llama-3.3-70b-versatile'],
  Cerebras: ['llama3.1-70b']
};

const endpoints = {
  SambaNova: 'https://api.sambanova.ai/v1/chat/completions',
  Groq: 'https://api.groq.com/openai/v1/chat/completions',
  Cerebras: 'https://api.cerebras.ai/v1/chat/completions'
};

async function testKey(provider, key, model) {
  try {
    const res = await fetch(endpoints[provider], {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1
      })
    });
    
    if (res.ok) {
      return { success: true };
    } else {
      return { success: false, error: `${res.status} ${res.statusText}` };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function runAllTests() {
  console.log("=== JARVIS SYSTEMS CHECK ===\n");
  
  let allPass = true;
  
  for (const provider of ['SambaNova', 'Groq', 'Cerebras']) {
    console.log(`[Testing ${provider} Pool] (${keys[provider].length} keys found)`);
    const model = models[provider][0];
    
    let validKeys = 0;
    for (let i = 0; i < keys[provider].length; i++) {
      const key = keys[provider][i];
      process.stdout.write(`  Key ${i + 1}/${keys[provider].length}... `);
      const result = await testKey(provider, key, model);
      if (result.success) {
        console.log("✅ OK");
        validKeys++;
      } else {
        console.log(`❌ FAILED (${result.error})`);
        allPass = false;
      }
    }
    console.log(`-> ${provider}: ${validKeys}/${keys[provider].length} keys active.\n`);
  }
  
  if (allPass) {
    console.log("STATUS: ALL SYSTEMS NOMINAL. All API keys are fully functional.");
  } else {
    console.log("STATUS: WARNING. Some keys in the pool are inactive or restricted.");
  }
}

runAllTests();

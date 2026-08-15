// /api/insight.js
// Server-side proxy for the Groq call. Keeps GROQ_API_KEY out of the browser.
// Set GROQ_API_KEY as an environment variable in your Vercel project settings
// (Project → Settings → Environment Variables), then redeploy.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('GROQ_API_KEY is not set in this environment');
    return res.status(500).json({ error: 'Server is missing GROQ_API_KEY' });
  }

  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || prompt.length > 4000) {
    return res.status(400).json({ error: 'Invalid prompt' });
  }

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        max_tokens: 180,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      if (groqRes.status === 429) {
        // Groq's free tier is 30 requests/min and ~6K tokens/min, shared across
        // the whole account — this fires whenever that's exhausted. It's not a
        // code bug, but every hit means the user silently got template text
        // instead of a real insight, so it's worth its own log line.
        console.warn('Groq rate limit hit (429):', errText);
        return res.status(429).json({ error: 'Rate limited', reason: 'rate_limit' });
      }
      console.error('Groq error:', groqRes.status, errText);
      return res.status(502).json({ error: 'Upstream AI error', reason: 'upstream_error' });
    }

    const data = await groqRes.json();
    const insight = data.choices?.[0]?.message?.content?.trim() || null;
    return res.status(200).json({ insight });
  } catch (err) {
    console.error('Insight handler threw:', err);
    return res.status(500).json({ error: 'Something went wrong', reason: 'exception' });
  }
}
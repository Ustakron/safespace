# Deploy to Vercel

This project is now a Next.js app with serverless backend routes.

## Local

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Vercel

1. Import this folder in Vercel.
2. Set `AUTH_SECRET` to a long random value.
3. Set `GEMINI_API_KEY` from Google AI Studio.
4. Optional: set `GEMINI_MODEL` if you want to override the default `gemini-3.5-flash`.
5. For persistent accounts, add Vercel KV or Upstash Redis and set:
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
6. Deploy.

Without KV, auth works locally with `.data/users.json`; on Vercel, user data may reset between serverless instances.

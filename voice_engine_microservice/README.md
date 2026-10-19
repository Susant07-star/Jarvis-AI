# J.A.R.V.I.S. Voice Matching Service

This optional FastAPI service uses SpeechBrain's ECAPA speaker-recognition model to compare an uploaded audio sample with a configured owner embedding and any supplied known profiles. The root Node service can call it when the voice integration is configured.

This is a prototype speaker-similarity feature. It is **not** a reliable identity check, strong anti-spoofing control, or security boundary.

## Run with Docker

The included `Dockerfile` runs Uvicorn on port `7860`:

```bash
docker build -t jarvis-voice-engine .
docker run --rm -p 7860:7860 \
  -e VOICE_API_KEY="replace-with-a-unique-secret" \
  -e BOSS_VOICE_EMBEDDING="base64-embedding" \
  jarvis-voice-engine
```

The service loads the SpeechBrain model at startup. A healthy `/` response reports whether the model loaded and whether an owner embedding is configured.

## Environment variables

| Variable | Purpose |
|---|---|
| `VOICE_API_KEY` | Bearer token required by `/verify` and `/enroll`. Set a unique secret; the source contains an unsafe development fallback if it is omitted. |
| `BOSS_VOICE_EMBEDDING` | Base64-encoded float32 speaker embedding used for the owner comparison. Treat as sensitive biometric data. |

The root Node app uses `HUGGINGFACE_VOICE_API_URL` and `HUGGINGFACE_VOICE_API_KEY` to reach the deployed service; the remote secret must match `VOICE_API_KEY`.

## HTTP endpoints

- `GET /` reports service/model/profile configuration status.
- `POST /verify` accepts `audio_file` and optional `known_profiles` multipart fields and returns a speaker category, similarity score, and `liveness` flag.
- `POST /enroll` accepts `audio_file` and returns a base64 embedding. It requires the bearer token.

## Limitations and data handling

- The current liveness test uses a basic audio DC-offset/peak heuristic. It can be bypassed or produce false results; a `liveness: true` value is not proof that audio came from a live person.
- Speaker matching is based on cosine similarity thresholds in `app.py`; accuracy depends on audio quality, device, environment, and enrollment data.
- The current service accepts embeddings for known profiles in the request. Protect requests and responses, and do not persist, commit, or share embeddings without explicit consent.
- The `enroll_boss.py` helper disables TLS certificate verification for its HTTPS request. Review and fix that behavior before using the helper with sensitive voice data over an untrusted network.
- The root `.env.example` has demonstration secret values. Never reuse them.

Use an independent authentication factor for any sensitive action. Voice results should not authorize shell, desktop, financial, account, or data access by themselves.

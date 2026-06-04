# J.A.R.V.I.S. Voice Biometrics Engine

This microservice runs on a Free Hugging Face Space (Docker CPU). It handles all audio processing, extracting voice embeddings via SpeechBrain, and verifying if the speaker is the Boss.

## 1. Deploying to Hugging Face
1. Create a new Hugging Face Space.
2. Select **Docker** as the SDK.
3. Select **Blank** template.
4. Clone your Space repo locally and copy the contents of this folder into it:
   - `app.py`
   - `Dockerfile`
   - `requirements.txt`
5. Push the code to the Hugging Face Space.
6. In your Space **Settings -> Variables and Secrets**, add a Secret:
   - Name: `VOICE_API_KEY`
   - Value: `jarvis_secure_key_123!` (Make sure this matches your Render `.env`!)

## 2. Enrolling the Boss Voice (Military Grade Security)
To ensure no one can spoof your voice, you must generate a highly secure voice print (embedding) and hardcode it into the Hugging Face Space.

Run this script locally on your PC (you need a microphone):

```bash
# Install PyAudio (used for recording)
pip install pyaudio

# Run the enrollment script
python enroll_boss.py --url https://YOUR-SPACE-URL.hf.space --key jarvis_secure_key_123!
```

1. The script will record 5 seconds of your voice.
2. It will send it securely to your Hugging Face Space.
3. The Space will return a long Base64 string (your Voice Print Embedding).
4. Go to your Hugging Face Space **Settings -> Variables and Secrets**.
5. Add a new Secret:
   - Name: `BOSS_VOICE_EMBEDDING`
   - Value: (Paste the long string here)
6. Restart the Space.

J.A.R.V.I.S. will now reject anyone whose voice doesn't match that exact print!

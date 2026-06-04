from fastapi import FastAPI, UploadFile, File, Header, HTTPException
import shutil
import os
import logging
# from speechbrain.inference.speaker import SpeakerRecognition

app = FastAPI()
logging.basicConfig(level=logging.INFO)

# GLOBAL: We will load the SpeechBrain model here so it only loads once on boot.
# verification = SpeakerRecognition.from_hparams(source="speechbrain/spkrec-ecapa-voxceleb", savedir="tmp_model")

# Replace this with a strong, random password later
API_SECRET_KEY = "jarvis_secure_key_123!" 

@app.get("/")
def health_check():
    return {"status": "J.A.R.V.I.S. Voice Engine is Online and Secure"}

@app.post("/verify")
async def verify_voice(
    audio_file: UploadFile = File(...),
    authorization: str = Header(None)
):
    # 1. Security Check
    if not authorization or authorization != f"Bearer {API_SECRET_KEY}":
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid API Key")
    
    # 2. Save uploaded audio temporarily
    file_path = f"/tmp/{audio_file.filename}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(audio_file.file, buffer)
        
    logging.info(f"Received audio file for verification: {audio_file.filename}")
    
    # 3. TODO: Run SpeechBrain Verification
    # This will compare the uploaded file against the hardcoded Boss profile
    # score, prediction = verification.verify_files("boss_profile.wav", file_path)
    
    # 4. Cleanup
    if os.path.exists(file_path):
        os.remove(file_path)
    
    # 5. Return result
    return {
        "status": "success",
        "speaker": "unknown", # Placeholder until we activate SpeechBrain
        "confidence": 0.0     # Placeholder
    }

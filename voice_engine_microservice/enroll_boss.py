import os
import sys
import time
import wave
import argparse
import urllib.request
import urllib.error
from urllib.request import Request
import json
import ssl

try:
    import pyaudio
except ImportError:
    print("Error: PyAudio is not installed. Please install it using:")
    print("pip install pyaudio")
    sys.exit(1)

# Audio recording parameters
CHUNK = 1024
FORMAT = pyaudio.paInt16
CHANNELS = 1
RATE = 16000
RECORD_SECONDS = 5
WAVE_OUTPUT_FILENAME = "boss_voice_sample.wav"

def record_audio():
    """Record 5 seconds of audio from the default microphone."""
    p = pyaudio.PyAudio()

    print("\n" + "="*50)
    print("🎙️  J.A.R.V.I.S. BOSS ENROLLMENT SEQUENCE  🎙️")
    print("="*50)
    print(f"\nGet ready to speak for {RECORD_SECONDS} seconds...")
    time.sleep(2)

    stream = p.open(format=FORMAT,
                    channels=CHANNELS,
                    rate=RATE,
                    input=True,
                    frames_per_buffer=CHUNK)

    print("\n* RECORDING NOW! Please say a few sentences clearly. *")

    frames = []

    for i in range(0, int(RATE / CHUNK * RECORD_SECONDS)):
        data = stream.read(CHUNK)
        frames.append(data)

    print("\n* RECORDING COMPLETE! *")

    stream.stop_stream()
    stream.close()
    p.terminate()

    wf = wave.open(WAVE_OUTPUT_FILENAME, 'wb')
    wf.setnchannels(CHANNELS)
    wf.setsampwidth(p.get_sample_size(FORMAT))
    wf.setframerate(RATE)
    wf.writeframes(b''.join(frames))
    wf.close()
    print(f"Saved audio to {WAVE_OUTPUT_FILENAME}")
    return WAVE_OUTPUT_FILENAME

def generate_embedding(audio_file, hf_url, api_key):
    """Send the audio file to the Hugging Face Space to generate the base64 embedding."""
    print("\nGenerating secure voice print via J.A.R.V.I.S. Voice Engine...")
    
    url = f"{hf_url.rstrip('/')}/enroll"
    
    # Read file
    with open(audio_file, 'rb') as f:
        audio_data = f.read()

    # Create multipart/form-data request manually (to avoid needing 'requests' library)
    import mimetypes
    import uuid
    boundary = uuid.uuid4().hex
    
    body = bytearray()
    body.extend(f"--{boundary}\r\n".encode('utf-8'))
    body.extend(f'Content-Disposition: form-data; name="audio_file"; filename="boss.wav"\r\n'.encode('utf-8'))
    body.extend(f"Content-Type: audio/wav\r\n\r\n".encode('utf-8'))
    body.extend(audio_data)
    body.extend(f"\r\n--{boundary}--\r\n".encode('utf-8'))

    req = Request(url, data=body)
    req.add_header('Content-Type', f'multipart/form-data; boundary={boundary}')
    req.add_header('Authorization', f'Bearer {api_key}')

    # Ignore SSL errors if any (useful for some local dev)
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    try:
        response = urllib.request.urlopen(req, context=ctx)
        result = json.loads(response.read().decode('utf-8'))
        
        embedding = result.get("embedding")
        if not embedding:
            print("Error: Engine did not return an embedding!")
            return None
            
        print("\n" + "="*50)
        print("✅ BOSS VOICE PRINT GENERATED SUCCESSFULLY ✅")
        print("="*50)
        print("\n⚠️ IMPORTANT ⚠️")
        print("Go to your Hugging Face Space Settings -> Variables and Secrets.")
        print("Add a new SECRET with the following name and value:\n")
        print("Name:  BOSS_VOICE_EMBEDDING")
        print(f"Value: {embedding}")
        print("\nAfter saving, restart your Hugging Face Space!")
        
        # Also save to a file just in case it's too long for the console
        with open("boss_embedding.txt", "w") as f:
            f.write(embedding)
        print("\n(The embedding has also been saved to boss_embedding.txt)")
        
    except urllib.error.HTTPError as e:
        print(f"\n❌ Error from Voice Engine: {e.code} - {e.read().decode('utf-8')}")
    except Exception as e:
        print(f"\n❌ Failed to connect: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Enroll Boss Voice Print")
    parser.add_argument("--url", required=True, help="Hugging Face Space URL (e.g. https://digital12-jarvis.hf.space)")
    parser.add_argument("--key", required=True, help="Your VOICE_API_KEY")
    parser.add_argument("--skip-record", action="store_true", help="Skip recording and use existing boss_voice_sample.wav")
    
    args = parser.parse_args()
    
    audio_file = WAVE_OUTPUT_FILENAME
    if not args.skip_record:
        record_audio()
    elif not os.path.exists(audio_file):
        print(f"Error: {audio_file} not found. Run without --skip-record first.")
        sys.exit(1)
        
    generate_embedding(audio_file, args.url, args.key)

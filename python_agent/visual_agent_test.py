import requests
import base64
import json
import time

def test_visual_agent():
    print("Testing the Visual Agent Set-of-Mark Injection...")
    
    # First ensure the browser is open by telling it to go to Wikipedia
    print("1. Opening a test page (Wikipedia)...")
    requests.post("http://127.0.0.1:8000/execute", json={
        "commands": [{"type": "open_tab", "url": "https://en.wikipedia.org"}]
    })
    
    time.sleep(3) # Wait for load
    
    # Now call the new mark-page endpoint
    print("2. Calling /mark-page endpoint...")
    response = requests.post("http://127.0.0.1:8000/mark-page")
    
    if response.status_code != 200:
        print(f"Error: {response.text}")
        return
        
    data = response.json()
    
    if data.get("status") == "success":
        # Save the screenshot
        img_data = base64.b64decode(data["image"])
        with open("test_marked_screenshot.png", "wb") as f:
            f.write(img_data)
            
        elements = data["elements"]
        print(f"\nSuccess! Captured screenshot with {len(elements)} marked elements.")
        print("Saved marked screenshot to: python_agent/test_marked_screenshot.png")
        print("\nFirst 5 elements detected:")
        for el in elements[:5]:
            print(f"  Box [{el['id']}]: '{el['text']}' at (X: {el['center_x']:.1f}, Y: {el['center_y']:.1f})")
    else:
        print("Failed to mark page.")

if __name__ == "__main__":
    test_visual_agent()

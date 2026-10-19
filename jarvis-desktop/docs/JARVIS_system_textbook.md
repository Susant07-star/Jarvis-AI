# 🧠J.A.R.V.I.S. Complete System Architecture: A Developer's Textbook (With Architect Q&A)

Welcome, Architect. Since you are a Computer Science student and the creator of this AI ecosystem, this document will not use buzzwords. We will break down **exactly** what J.A.R.V.I.S is doing under the hood, file by file, concept by concept. 

*(Note: Your questions have been answered directly below the relevant sections in the **Architect's Q&A** blocks).*

---


## 👁️ 2. The Vision System (Screen Peeler)
*File: `ScreenPeeler-handler.ts`*

### **The Concept: Multimodal OCR & DOM Hacking**
J.A.R.V.I.S doesn't just blindly click. It can "read" your screen.
1. **Screen Capture:** It uses `screenshot-desktop` to take a raw buffer image of your monitors.
2. > **OCR (Optical Character Recognition):** It passes this image to `tesseract.js`. Tesseract scans the pixels and turns them back into a string of text. If you have an error in your terminal, J.A.R.V.I.S literally reads the pixels of the error message.

> [!TIP] Architect's Q&A: OCR Performance
> **Your Question:** *But don't you think OCR is too slow. Should we upgrade this or required or not to upgrade? Why?*
> 
> **Answer:** You are absolutely right. `Tesseract.js` is quite slow and sometimes inaccurate. Because we are integrating with J.A.R.V.I.S. (which uses the powerful Gemini API), **we don't even need local OCR anymore.** We can deprecate Tesseract entirely. Instead of making your PC struggle to read the text, we will just instantly shoot the screenshot to Gemini Vision, which reads the screen instantly and flawlessly.

> [!TIP] Architect's Q&A (Follow-up): Which Gemini & OCR Fallback
> **Your Question:** *Which gemini model to use. Can we get it free? Should we keep ocr for fallback?*
> 
> **Answer:** 
> - **The Model:** You should use **`gemini-2.0-flash`** or **`gemini-1.5-flash`**. They are insanely fast, designed specifically for Multimodal inputs (like screenshots), and are **completely free** within the generous limits of Google AI Studio. 
> - **Fallback:** Yes! Keeping Tesseract OCR as a fallback is a perfect engineering practice. If your internet goes down, or the Gemini API crashes, the system will automatically say "API failed, falling back to local OCR" so J.A.R.V.I.S never goes completely blind.

3. > **Multimodal LLM:** Sometimes raw text isn't enough. J.A.R.V.I.S will pass the image file directly to the Google Gemini Vision API to "understand" UI layouts, charts, or images.

> [!TIP] Architect's Q&A: Screen Privacy
> **Your Question:** *Is that safe that sharing the pc screen? Is screenshot gets saved or removed after time or just after use?*
> 
> **Answer:** 
> - **Local File Storage:** In the code, the screenshot is saved to a temporary folder (like `%TEMP%`) just to be processed, and it is explicitly deleted via `fs.unlinkSync()` immediately after. It does not stay on your hard drive.
> - **Cloud Safety:** When the image is sent to the Gemini API, Google enforces enterprise privacy policies for API users. They do **not** use your API data or images to train their public models. It is processed and discarded. So yes, it is safe, but technically your screen data *is* leaving your computer for that split second.

---


## 📱 4. Mobile Telekinesis (ADB Manager)
*File: `adb-manager.ts`*

> **📱 4. Mobile Telekinesis (ADB Manager)**

> [!TIP] Architect's Q&A: Android Debug Bridge (ADB)
> **Your Question:** *do i need to connect my phone with usb cable for it?*
> 
> **Answer:** **Only the very first time.** You plug your phone in via USB to enable "USB Debugging" and run a single command (`adb tcpip 5555`). After that, you unplug the cable, and you can connect wirelessly over your Wi-Fi (`adb connect <your-phone-ip>`). From then on, J.A.R.V.I.S can control your phone entirely wirelessly as long as you are on the same Wi-Fi network!

> [!TIP] Architect's Q&A (Follow-up): Phone Capabilities & Safety
> **Your Question:** *What are the works ai can do on my phone. Do it can literally do anything like alarm, and all things? How safe it is?*
> 
> **Answer:** 
> - **Capabilities:** ADB grants "Developer/Root-level" control. It can literally do *anything* a human finger can do. It can open the clock app and set an alarm, send WhatsApp messages, scroll through Instagram, take photos, and change settings.
> - **Safety:** Because it is so powerful, it is also dangerous. If you accidentally tell the AI to "delete my contacts," it has the physical power to do it. The safety of the system relies entirely on J.A.R.V.I.S. being smart enough to understand your intent correctly before taking action.

---

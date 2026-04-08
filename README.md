# DefendHer - Women Safety Web Application

A complete, feature-rich Women Safety Web Application built using entirely free technologies. This application allows users to quickly trigger an SOS, automatically send their live location via email to saved emergency contacts, view nearby safe zones, trigger a fake call, and actively participate in a community alert system.

## Features

**Core Features**
- **Authentication:** Secure user registration and login.
- **SOS Trigger (Button & Voice):** Send emergency emails containing your live location and a map link.
- **Emergency Contacts:** Add and manage emergency contacts (stored in MongoDB).
- **Live Tracking:** The map continuously updates and tracks your location when an SOS is active.
- **Interactive Maps:** Built with Leaflet.js and OpenStreetMap (no paid APIs).

**Advanced Features**
- **Fake Call Overlay:** A simulated incoming call UI with a ringing tone to help users exit uncomfortable situations.
- **Danger Zone Mapping:** Users can drop pins on the map to define unsafe areas. These appear as red zones for all users.
- **Community Alerts:** If a nearby user triggers an SOS, a pulsing red siren marker appears on everyone's map to raise awareness.
- **Auto Evidence Capture:** When SOS is engaged, the browser silently accesses the device camera to snap a photo and stores it securely in the database.
- **Safe Route Suggestion:** Integrated Leaflet Routing Machine provides a directed path from the user's location to a chosen safe haven (e.g., Police Station or Hospital).

---

## Tech Stack
- **Frontend:** HTML5, CSS3 Custom Properties (Glassmorphism UI), Vanilla JavaScript.
- **Backend:** Node.js, Express.js
- **Database:** MongoDB
- **Maps:** Leaflet.js, OpenStreetMap
- **Routing:** Leaflet Routing Machine (OSRM)
- **Emails:** Nodemailer

---

## Step-by-Step Setup Instructions

### 1. Prerequisites
Ensure you have the following installed on your machine:
- [Node.js](https://nodejs.org/) (v16.x or higher)
- [MongoDB Community Server](https://www.mongodb.com/try/download/community) (Running locally, or a free MongoDB Atlas URI).

### 2. Configure the Backend
1. Open a terminal and navigate to the `backend` folder:
   ```bash
   cd backend
   ```
2. Install the required Node.js dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file based on the provided example:
   - Duplicate the `.env.example` file and rename it to `.env`.
   - Fill in your details. Specifically, for **Nodemailer**, you must use a real Gmail account and a specific "App Password" (not your normal password):
     ```env
     PORT=5000
     MONGODB_URI=mongodb://localhost:27017/womensafety
     JWT_SECRET=super_secret_key
     EMAIL_USER=your_real_email@gmail.com
     EMAIL_PASS=your_16_digit_app_password
     
     TWILIO_ACCOUNT_SID=your_twilio_account_sid
     TWILIO_AUTH_TOKEN=your_twilio_auth_token
     TWILIO_PHONE_NUMBER=your_twilio_phone_number
     ```
     *Note: To generate a Gmail App Password, enable 2-Step Verification on your Google Account, search for "App Passwords", and create a new one. For Twilio SMS, sign up for a Trial Account.*

### 3. Run the Backend Server
1. While still in the `backend` directory, start the server:
   ```bash
   npm start
   ```
   *You should see a message indicating the server is running on port 5000 and that MongoDB connected successfully.*

### 4. Run the Frontend
Because the frontend uses modern browser APIs (like Geolocation and MediaDevices for the camera), it must be served over an HTTP server (not simply double-clicking `index.html` via `file://`).

**Option A: Using VS Code (Recommended)**
1. Open the entire `Women safety` project folder in **Visual Studio Code**.
2. Install the **Live Server** extension by Ritwick Dey.
3. Open `frontend/index.html` in the editor.
4. Click **"Go Live"** in the bottom right corner of VS Code to start a local development server.

**Option B: Using Node.js `serve` package**
1. Open a new terminal.
2. Install the global serve tool:
   ```bash
   npm install -g serve
   ```
3. Serve the frontend directory:
   ```bash
   serve frontend
   ```
4. Open your browser to `http://localhost:3000` (or whichever port the tool provides).

---

## Testing the App
1. **Register** a new account and log in.
2. **Add a Contact** in the "Contacts" tab using your own secondary email address to test the Nodemailer alerts.
3. Go back to the **Home** tab and ensure you grant the browser **Location** and **Camera** permissions when prompted.
4. Click **SOS** to trigger an emergency alert.
5. Check your secondary email for the Live Location map link.

## Extra Configurations
- **Voice SOS:** Make sure your environment isn't blocking the Web Speech API. Speak clearly ("Help" or "Emergency") while logged into the dashboard to invoke an SOS.
- **Evidence Capture:** You will notice a brief camera startup before it shuts down again; this captures a momentary still frame internally for the database.

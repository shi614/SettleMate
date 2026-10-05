import axios from 'axios';

// Both the Android emulator and a USB-connected physical device reach the
// backend through "localhost:4000" here, same as Metro's own JS bundle port:
// `adb reverse tcp:4000 tcp:4000` forwards the device's localhost:4000 to
// this machine's localhost:4000. Run that once per `adb` session before
// launching the app (see mobile/README or the root README for the command).
// On Wi-Fi only (no USB), swap this for your machine's LAN IP instead.
const DEV_HOST = 'localhost';

export const API_BASE_URL = `http://${DEV_HOST}:4000/api`;

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 8000,
});

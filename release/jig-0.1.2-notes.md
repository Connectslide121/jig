# Jig 0.1.2

- Fix Teams meetings getting stuck at “None” with no audio when joining with the camera off.
- Show connection failures instead of leaving a stalled meeting waiting indefinitely.
- Remember the Meetings lobby's Agenda/Week view and restore Microsoft sign-in across restarts using OS-protected storage.
- Download Windows updates inside Jig and offer **Install and restart**. Get started automatically checks and shows your installed version.

Install this version once using the installer below if you are on 0.1.0 or 0.1.1. Future Windows updates download inside Jig. Installation waits for your action; active meetings and running chats prevent restart.

The camera-off join defect was traced to Microsoft's SDK rejecting an empty video-stream list. Live meeting and installed update/restart verification remain pending.

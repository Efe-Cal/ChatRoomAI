# ChatRoomAI

A real-time chat application with optional AI assistant integration for each room.

Visit https://chatroomai-bwto.onrender.com

## Features

- Join chat rooms with a nickname
- Real-time messaging using Socket.IO
- Enable/disable AI assistant per room
- Responsive and modern UI

## Setup

1. **Install dependencies**  
   ```
   npm install
   ```

2. **Run the server**  
   ```
   node index.js
   ```

3. **Open in browser**  
   Visit [http://localhost:3500](http://localhost:3500)

## Usage

- Enter your name and a room name to join.
- Type messages and send.
- Enable the "AI" checkbox to let the AI respond to messages.
- Adjust the number of messages sent to the AI for context.
- Use `/ai your question` to ask the AI directly.
- Use `/clear` to reset the AI context for the room.

## Notes

- AI responses are powered by [Hack Club's AI API](https://ai.hackclub.com/).

---

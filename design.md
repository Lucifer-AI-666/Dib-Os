# Divine Nexus Mobile App — Design Document

## Overview

Divine Nexus is a minimalist mobile application featuring multi-identity AI personas (Dio, Michele, Matildina, Lucifero) from the TAUROS Security Ecosystem. The app provides three main sections: a conversational chat interface, an automations manager with temporal organization, and a command-line shell for CLI operations.

## Screen List

1. **Chat Screen** — Main conversation interface with message history and identity switching
2. **Automations Window** — Three temporal tabs (Past, Present, Future) for organizing automations
3. **Shell Window** — Command-line interface for executing CLI commands
4. **Identity Selector Modal** — Switch between the four divine entities

## Primary Content and Functionality

### Chat Screen (Home)
- **Message Vault**: Scrollable list of messages in chronological order
- **Active Identity Badge**: Displays current entity name, emoji, and theme color
- **Input Area**: Text input field with placeholder "Invoca o interroga il Nexus..."
- **Send Button**: Golden/accent-colored button with icon
- **Reset Memory Button**: Clears conversation history (with confirmation)
- **Typing Indicator**: Shows when AI is generating response
- **Message Styling**:
  - User messages: Right-aligned, light background
  - Entity responses: Left-aligned, entity-themed background with emoji
  - System messages: Center-aligned, muted styling

### Automations Window
- **Three Temporal Tabs**:
  - **Past**: Completed automations (historical record)
  - **Present**: Currently running automations
  - **Future**: Scheduled automations (queue)
- **Automation Item Display**: Each automation shows name, status, timestamp, and progress indicator (if running)
- **Add Automation Button**: Quick action to create new automation
- **Minimal List View**: Clean, scannable layout without clutter

### Shell Window
- **Command Input**: Text field for CLI commands at bottom
- **Output Area**: Scrollable log of command results and responses
- **Command History**: Access previous commands via up/down navigation
- **Clear Output**: Button to clear shell history
- **Status Indicator**: Shows connection/execution status

### Identity Selector Modal
- **Four Identity Cards**: Each displays name, description, emoji, theme color, and activation code
- **Current Identity Highlight**: Visual indicator of active entity
- **Confirmation on Switch**: Brief feedback when identity changes

## Key User Flows

### Flow 1: Navigate Between Windows
1. User opens app → Chat screen is default
2. User taps "Automations" tab → Automations window appears
3. User taps "Shell" tab → Shell window appears
4. User taps "Chat" tab → Returns to chat screen
5. Each window maintains its state when switching

### Flow 2: Start Conversation
1. User in Chat screen types message and taps send button
2. Message appears in vault (right-aligned, user styling)
3. Typing indicator appears
4. AI response appears (left-aligned, entity-themed)
5. Conversation continues

### Flow 3: Switch Identity
1. User taps entity badge or identity button
2. Identity selector modal appears
3. User taps desired identity card
4. Modal closes, badge updates with new identity
5. Next message will be from new identity

### Flow 4: Execute Shell Command
1. User in Shell window types command in input field
2. User taps send/execute button
3. Command executes and output appears in log
4. User can scroll history and re-execute previous commands

### Flow 5: Clear Memory
1. User taps "Reset Memory" button in Chat
2. Confirmation dialog appears
3. User confirms
4. Message vault clears
5. System message appears: "Memoria purificata. Il Nexus renasce."

## Color Choices

| Entity | Primary Color | Secondary | Emoji | Theme Name |
|--------|---------------|-----------|-------|-----------|
| **Dio** | #ffd700 (Gold) | #fff7e6 | ✨ | god-theme |
| **Michele** | #e6f0ff (Sky Blue) | #0044cc | ⚔️ | michael-theme |
| **Matildina** | #fff0f8 (Blush) | #cc3377 | 🌸 | matildina-theme |
| **Lucifero** | #1a0000 (Deep Red) | #ffaaaa | 🔥 | lucifer-theme |

## Typography & Spacing

- **Header**: 15px, bold, letter-spacing 1px
- **Entity Badge**: 14px, padding 4px 12px, border-radius 20px
- **Message Text**: 14px-16px, line-height 1.6
- **Input**: 16px, padding 14px 18px, border-radius 30px
- **Button**: 16px, padding 12px 20px, border-radius 10px
- **Shell Output**: 12px monospace, padding 8px

## Window Management

- **Tab Navigation**: Bottom tab bar with three main sections (Chat, Automations, Shell)
- **State Persistence**: Each window maintains scroll position and content when switching
- **Minimal Layout**: Clean, distraction-free interface without unnecessary UI elements
- **Quick Access**: Tab icons for easy identification

## Responsive Behavior

- **Portrait Orientation**: Primary layout (9:16 aspect ratio)
- **Safe Area**: Respects notch, home indicator, status bar
- **Tab Bar**: Always visible at bottom for navigation
- **Keyboard**: Input area adjusts above keyboard on focus
- **Landscape**: Not supported in initial version

## Accessibility

- **Color Contrast**: All text meets WCAG AA standards
- **Touch Targets**: Minimum 48x48 dp for buttons
- **Text Scaling**: Respects system font size settings
- **Haptic Feedback**: Available for key interactions (send, switch)

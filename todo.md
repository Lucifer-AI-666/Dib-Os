# Divine Nexus — Project TODO

## Core Features

- [ ] Chat interface with message vault (scrollable history)
- [ ] Multi-identity system (Dio, Michele, Matildina, Lucifero)
- [ ] Identity switching with modal selector
- [ ] Active identity badge display
- [ ] Gemini AI integration for responses
- [ ] Message input with send button
- [ ] Typing indicator animation
- [ ] Reset memory functionality with confirmation
- [ ] Theme switching (light/dark mode)
- [ ] Settings screen
- [ ] About screen

## UI Components

- [ ] ScreenContainer wrapper for safe area
- [ ] Message bubble component (user/entity/system variants)
- [ ] Identity card component for selector
- [ ] Input area with send button
- [ ] Typing indicator with animation
- [ ] Identity badge display
- [ ] Tab bar with navigation
- [ ] Modal for identity selection
- [ ] Confirmation dialog for memory reset

## Styling & Branding

- [ ] Generate custom app logo/icon
- [ ] Update app.config.ts with branding info
- [ ] Configure color palette for four identities
- [ ] Implement theme switching (god-theme, michael-theme, matildina-theme, lucifer-theme)
- [ ] Add gradient backgrounds for identity themes
- [ ] Ensure dark mode support

## Backend Integration

- [ ] Set up Gemini API key environment variable
- [ ] Create API endpoint for chat messages
- [ ] Implement message history storage (AsyncStorage or database)
- [ ] Add identity context to API requests
- [ ] Error handling for API failures

## Testing & Validation

- [ ] Test chat flow end-to-end
- [ ] Test identity switching
- [ ] Test memory reset functionality
- [ ] Test theme switching
- [ ] Verify responsive design on different screen sizes
- [ ] Test on iOS and Android simulators

## Deployment

- [ ] Create checkpoint before first delivery
- [ ] Generate APK for Android
- [ ] Test on physical devices

## Updated Features (Minimalist Version)

- [ ] Automations window with three temporal tabs (Past, Present, Future)
- [ ] Automations list display with status indicators
- [ ] Shell window with CLI command input
- [ ] Shell output log with command history
- [ ] Tab-based navigation (Chat, Automations, Shell)
- [ ] Automations item component (Past/Present/Future)
- [ ] Shell output component with monospace styling
- [ ] Command input component for shell
- [ ] Shell command execution backend
- [ ] Automations storage and management
- [ ] Temporal organization of automations (Past/Present/Future)
- [ ] Test tab navigation between Chat, Automations, Shell
- [ ] Test automations temporal organization
- [ ] Test shell command execution

## Groq AI Integration
- [x] Configure Groq API key as environment variable
- [x] Create server-side AI chat endpoint
- [x] Update chat screen to call Groq API for intelligent responses
- [x] Add system prompts per identity (Dio, Michele, Matildina, Lucifero)
- [x] Test AI responses end-to-end

# Multi-window synchronization function user guide

## 📋 Overview

The multi-window synchronization function allows you to synchronize the mouse and keyboard operations of a main window to multiple slave windows in real time to achieve batch operations and automated control.

## ✨ Features

### Phase 1: MVP Basic Version
- ✅ **Mouse event synchronization**: move, click, right click
- ✅ **Keyboard input synchronization**: key press and release
- ✅ **Master-Slave Window Management**: Supports one main window to control multiple slave windows
- ✅ **Relative coordinate mapping**: automatically adapt to different window sizes

### Phase 2: Enhanced version
- ✅ **Extension Window Sync**: Support browser extension pop-ups
- ✅ **Scroll wheel event optimization**: layered scrolling strategy, intelligent processing of small scrolling, medium scrolling and large scrolling
- ✅ **Event Filtering and Throttling**: Configurable throttling parameters to reduce system load
- ✅ **CDP page scroll synchronization**: Precisely synchronize page scroll position through Chrome DevTools Protocol

## 🚀 Quick Start

### 1. Install dependencies

```bash
npm install
```

The project will automatically install the `uiohook-napi` dependency.

### 2. Compile Native Addon

```bash
# Windows
npm run build:native-addon

# macOS (x64)
npm run build:native-addon:mac-x64

# macOS (arm64)
npm run build:native-addon:mac-arm64
```

### 3. Start the application

```bash
npm run watch
```

## 📖 API usage

### Called from the rendering process

```typescript
// Start synchronization
const result = await ipcRenderer.invoke('multi-window-sync-start', {
masterWindowId: 1, // Main window ID
slaveWindowIds: [2, 3, 4], // From the window ID array
options: { // Optional configuration
    enableMouseSync: true,
    enableKeyboardSync: true,
    enableWheelSync: true,
enableCdpSync: false, // CDP synchronization requires the window to open the debugging port
    mouseMoveThrottleMs: 10,
    mouseMoveThresholdPx: 2,
    wheelThrottleMs: 50,
    cdpSyncIntervalMs: 100
  }
});

if (result.success) {
console.log('Synchronization started');
} else {
console.error('Startup failed:', result.error);
}

// Stop synchronization
await ipcRenderer.invoke('multi-window-sync-stop');

// Get synchronization status
const status = await ipcRenderer.invoke('multi-window-sync-status');
console.log(status);
// Output: { isActive: true, masterPid: 12345, slavePids: [23456, 34567] }
```

### Configuration option description

| Options | Type | Default | Description |
|------|------|--------|------|
| `enableMouseSync` | boolean | true | Enable mouse event synchronization |
| `enableKeyboardSync` | boolean | true | Enable keyboard event synchronization |
| `enableWheelSync` | boolean | true | Enable wheel event synchronization |
| `enableCdpSync` | boolean | false | Enable CDP page scrolling synchronization |
| `mouseMoveThrottleMs` | number | 10 | Mouse move event throttling time (milliseconds) |
| `mouseMoveThresholdPx` | number | 2 | Mouse movement distance threshold (pixels) |
| `wheelThrottleMs` | number | 50 | Wheel event throttling time (milliseconds) |
| `cdpSyncIntervalMs` | number | 100 | CDP sync polling interval (milliseconds) |

## 🔧 Technical implementation

### Architecture design

```
┌─────────────────────────────────────────────────┐
│ Electron main process │
│  ┌──────────────────────────────────────────┐  │
│ │ Event capture layer (uiohook-napi) │ │
│ │ - Global keyboard hook │ │
│ │ - Global mouse hook │ │
│  └──────────────┬───────────────────────────┘  │
│ │ Event Stream │
│  ┌──────────────▼───────────────────────────┐  │
│ │ Event processing and distribution layer (TypeScript) │ │
│ │ - Filtering and throttling │ │
│ │ - Coordinate transformation (relative position mapping) │ │
│ │ - Master-slave window management │ │
│  └──────────────┬───────────────────────────┘  │
│ │ Distribution │
│  ┌──────────────▼───────────────────────────┐  │
│ │ Window Message Sending Layer (Native Addon) │ │
│  │  - Windows: PostMessage                  │  │
│  │  - macOS: CGEvent API                    │  │
│  └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
         │              │              │
    ┌────▼────┐    ┌───▼────┐    ┌───▼────┐
    │Chrome 1 │    │Chrome 2│    │Chrome 3│
│(Main window) │ │(Slave window)│ │(Slave window)│
    └─────────┘    └────────┘    └────────┘
```

### Core algorithm

#### 1. Relative coordinate mapping

```typescript
// Calculate the relative position in the main window
ratioX = (mouseX - masterWindow.x) / masterWindow.width
ratioY = (mouseY - masterWindow.y) / masterWindow.height

//Apply to slave window
slaveX = slaveWindow.x + (ratioX * slaveWindow.width)
slaveY = slaveWindow.y + (ratioY * slaveWindow.height)
```

#### 2. Hierarchical processing of wheel events

```typescript
if (absAmount <= 1) {
// Small scroll: keep it as is
  delta = amount
} else if (absAmount <= 3) {
// Medium scroll: 1.5x zoom
  delta = amount * 1.5
} else {
// Large scroll: zoom in 2 times
  delta = amount * 2.0
}
```

#### 3. Mouse movement throttling

```typescript
//Double throttling: time + distance
if (timeDiff < 10ms && distance < 2px) {
// Ignore this move
  return
}
```

## 🎯 Usage scenarios

1. **Multiple Account Management**: Control multiple browser accounts at the same time to perform the same operation
2. **Batch Test**: Synchronize the test process in multiple environments
3. **Automated Demonstration**: Display the operation effects of multiple windows at the same time
4. **Data Collection**: Execute the same data collection tasks in batches

## ⚠️ Notes

### Windows Platform
- **Admin rights** required to use global hooks
- Some security software may block global hooks

### macOS platform
- Requires granting **Accessibility Permission**
- You will be prompted automatically when running for the first time, please follow the prompts.
- Can be authorized manually in `System Preferences > Security & Privacy > Privacy > Accessibility`

### CDP synchronization
- Need to open the debugging port when the window starts
- Make sure the `debug_port` field is set correctly in the database
- CDP synchronization is more accurate than event synchronization, but is slightly more expensive

## 🐛 Troubleshooting

### 1. Synchronization cannot be started

**Problem**: Calling `multi-window-sync-start` returns failure

**Solution**:
- Check if all windows are running (with PID)
- Check whether necessary system permissions are granted
- Check the main process log for detailed error information

### 2. Mouse/keyboard events are not synchronized

**Issue**: Event captured but not distributed

**Solution**:
- Make sure the mouse is operating inside the main window
- Check whether `enableMouseSync` / `enableKeyboardSync` is enabled
- Try adjusting throttling parameters

### 3. Scroll wheel synchronization is not smooth

**Problem**: Scrolling is stuck or unresponsive

**Solution**:
- Adjust `wheelThrottleMs` parameter (lower value to improve response)
- Check system resource usage
- Try disabling CDP sync to reduce overhead

### 4. Unable to capture events on macOS

**Problem**: Events not working at all

**Solution**:
```bash
# Check accessibility permissions
# System Preferences > Security & Privacy > Privacy > Accessibility
# Make sure Chrome Power or Electron is added to the list
```

## 📊 Performance optimization suggestions

1. **Reduce the number of synchronization windows**: The more windows synchronized at the same time, the greater the performance overhead.
2. **Adjust throttling parameters**: Adjust event throttling time according to actual needs
3. **Selective Enablement**: If wheel or keyboard synchronization is not required, it can be disabled to reduce overhead
4. **CDP on demand**: Turn on CDP only when precise page synchronization is required

## 🔮 Future Plans

- [ ] Recording and playback function
- [ ] Custom synchronization rules (selective synchronization of specific operations)
- [ ] Multiple main window mode
- [ ] Delay and randomization of synchronized actions (simulating human operation)
- [ ] UI integration (graphical configuration interface)

## 📝 Update log

### v1.0.0 (2025-01-12)
- ✅ Realize basic mouse, keyboard, and scroll wheel event synchronization
- ✅ Add master-slave window management
- ✅ Implement extended window monitoring
- ✅Add scroll wheel event optimization strategy
- ✅ Implement event filtering and throttling
- ✅ Integrated CDP page scroll synchronization

## 🤝 Contribute

Issues and Pull Requests are welcome!

## 📄 License

This feature is licensed under the project's AGPL license.

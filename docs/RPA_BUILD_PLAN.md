Dưới đây là phiên bản **đầy đủ và hoàn chỉnh nhất** của file `RPA_BUILD_PLAN.md`, kết hợp phần gốc bạn vừa gửi với các "Integration Rules", "Anti-AI Rules" và "Execution Rules" cực mạnh ở phần trước.

Sự kết hợp này tạo ra một bộ prompt hoàn hảo: vừa cung cấp chi tiết spec (tính năng, node, luồng chạy) vừa ép buộc AI phải tuân thủ nghiêm ngặt việc **tích hợp vào code cũ thay vì đập đi xây lại**.

Bạn hãy copy toàn bộ nội dung dưới đây và lưu thành file `RPA_BUILD_PLAN.md`:

```markdown
# BROWSER RPA SYSTEM DEVELOPMENT PLAN

## 1. EXECUTIVE SUMMARY & OBJECTIVE
**Primary Objective:** Build a production-ready Browser RPA platform based on React + Electron that allows users to create, execute, schedule, and manage browser automation workflows through a visual drag-and-drop editor. The final product must be modular, scalable, maintainable, and easily extensible.

**CRITICAL CONSTRAINT - EXISTING PROJECT INTEGRATION:** 
This project is an **existing production codebase**. The objective is to integrate the Browser RPA system into the current application. It is NOT a standalone project. 
* Never rebuild features that already exist. 
* Always integrate into the current architecture. 
* The goal is seamless integration, not parallel implementation.

---

## 2. MANDATORY EXECUTION RULES (HIGHEST PRIORITY)
The following rules have the highest priority and override any other instruction.

### 2.1 Continuous Execution
* Do NOT ask the user any questions. Do NOT pause for confirmation.
* Continue working until every requested feature has been fully implemented.
* If a task depends on another task, implement the dependency first and continue automatically.
* Never stop because of uncertainty. Choose the most reasonable engineering solution and proceed. If multiple valid solutions exist, select the approach most widely adopted by the software engineering community.
* Never replace unfinished functionality with TODO, FIXME, Placeholder or Mock implementations unless absolutely unavoidable.

### 2.2 DO NOT ASSUME
Before implementing any feature:
1. Search the repository.
2. Identify existing implementations.
3. Reuse existing code whenever possible.
4. Extend existing modules instead of creating new ones.
5. Create new files only if no suitable location exists.
6. Preserve the project's architecture and coding style.

### 2.3 Anti-AI File Creation Rule
Before creating any new file, first search the repository for an existing location where the implementation naturally belongs. Creating new files is the **last resort**. Prefer extending existing modules instead of introducing parallel implementations. The objective is to make the new feature appear as if it had always been part of the original project.

---

## 3. REPOSITORY ANALYSIS & INTEGRATION RULES (MANDATORY)

### 3.1 Repository Analysis
Before writing any code, analyze the entire repository. Identify existing:
Electron architecture, React architecture, IPC handlers, Browser/Profile manager, Chrome manager, Database layer, Settings system, Logging system, Scheduler, Authentication, API layer, Routing, State management, Existing utilities, Existing services, and Existing UI components.
**Only after completing the analysis should implementation begin.**

### 3.2 Strict Integration Requirements
* **Browser Integration:** The project already contains browser/profile management. The RPA system MUST reuse the existing browser lifecycle, profile manager, proxy/fingerprint configuration, cookie/session management, and launch logic. *Never introduce a second browser manager.*
* **Database & Storage:** Never introduce another database layer. Reuse existing repositories, ORM, services, and storage architecture. Create migrations only when necessary. SQLite must be the default storage.
* **UI & Design:** Reuse existing layouts, navigation, dialogs, tables, buttons, icons, and theme. The RPA pages must look like native parts of the application.
* **Core Systems:** Extend the current IPC architecture, Settings module, Logging framework (Winston), Scheduler (node-cron), and Thread worker pools. Do not create redundant or duplicate channels/systems.
* **Permissions:** Reuse current roles and permissions. Add RPA permissions into the existing permission matrix.

---

## 4. TECHNOLOGY STACK
Ensure all new code complies with the existing project stack:
* **Frontend:** React, TypeScript, React Flow, Zustand, React Router, TailwindCSS, Zod, Axios.
* **Desktop & Backend Logic:** Electron (Main Process), Electron IPC.
* **Database:** SQLite.
* **Automation & Engine:** Playwright.
* **Scheduler:** node-cron.
* **Logging:** Winston.

---

## 5. PROJECT ARCHITECTURE
The system must be separated into independent modules with single responsibilities, integrated into the existing structure:

**React UI (Frontend)**
`Dashboard` | `Process Builder` | `Profiles` | `Scheduler` | `Task Log` | `Settings` | `Team`

**↓ Electron IPC ↓**

**Electron Main Process (Backend)**
`Process Engine` | `Browser Manager` | `Thread Manager` | `Queue Manager` | `Scheduler Engine` | `Plugin Manager` | `Storage Manager` | `Logger` | `Profile Manager` | `API Services`

---

## 6. PHASE 1: CORE INFRASTRUCTURE
Implement and extend the existing infrastructure to support:
* Workflow serialization & parser
* Configuration manager
* Logger & Plugin loader
* Queue & Thread manager
* Scheduler engine
* Browser manager integration
*(The architecture must support future extensions without breaking compatibility).*

---

## 7. PHASE 2: PROCESS BUILDER (UI & LOGIC)
Build a visual drag-and-drop workflow editor using React Flow.
* **Requirements:** Create, Delete, Duplicate, Copy, Paste, Move, Connect, Disconnect, Group, Ungroup, Zoom, Undo, Redo, Auto layout, Search nodes, Mini map, Grid, Snap, Selection, Context menu, Keyboard shortcuts.
* **Workflow Format:** Must generate a standard Workflow JSON containing: `nodes`, `edges`, `variables`, `metadata`, `version`, `settings`. The execution engine must never depend on the UI; it only consumes this JSON.

---

## 8. BROWSER RPA FUNCTIONAL SPECIFICATION

### 8.1 Node Library
* **Browser:** Launch Browser, Close Browser, Open Profile, Close Profile, New Tab, Close Tab, Switch Tab, Navigate URL, Refresh, Back, Forward, Click, Double Click, Right Click, Hover, Drag, Drop, Scroll, Mouse Move, Mouse Down, Mouse Up, Keyboard Press, Keyboard Type, Upload File, Download File, Screenshot, PDF, Wait, Wait For Selector, Wait For Navigation, Execute Javascript.
* **Variables:** Set Variable, Get Variable, Local/Global/Environment Variable. Syntax: `{{username}}`, `{{password}}`, `{{sheet.A1}}`, `{{captcha}}`, `{{openai.response}}`.
* **Logic:** If, Else, Switch, Loop, Break, Continue, Retry, Delay, Timeout.
* **Data:** JSON Parse, JSON Stringify, Regex, String, Number, Boolean, Date, Random, UUID.
* **Integration:** OpenAI, Google Sheets, REST API, Webhook, 2Captcha. (Plugin architecture must allow adding new integrations without modifying existing code).

### 8.2 Selector Engine
Every browser action must support: CSS, XPath, Text, Attribute, Shadow DOM, iframe, AI Locate.

### 8.3 Error Handling & Event System
* **Error Handling:** Every node must support: Retry, Skip, Stop, Continue, Jump, Custom Handler, Configurable retry count, Retry interval, Timeout.
* **Event System:** Support: Before/After Workflow, Before/After Node, On Error, On Success, On Cancel, On Complete.

### 8.4 Process Engine
Must: Parse Workflow, Validate, Resolve Variables, Execute Nodes, Resolve Conditions, Resolve Loops, Manage Retry/Timeout/Cancellation, Emit Events, Generate Logs, Return Results.

### 8.5 Browser & Thread Manager
* **Browser Manager:** Reusing existing logic to handle Create/Close Browser, Create/Destroy Context, Tabs, Cookie/Storage/Download/Permission Management, Proxy, and Fingerprint Support.
* **Thread Manager:** Support up to 100 concurrent workers. Dynamic queue, FIFO scheduling, Pause, Resume, Cancel, Kill, Restart. Worker statuses: Waiting, Queued, Running, Paused, Completed, Cancelled, Error, Retry.

### 8.6 Profile Execution
* **Workflow:** Select Profiles → Choose Workflow → Common OR Scheduled → Execute.
* Multiple profiles must run concurrently according to configured thread limits.

### 8.7 Process & Scheduler Management
* **Scheduler:** One Time, Recurring, Daily, Weekly, Monthly, Cron Expression, Timezone. Actions: Enable, Disable, Pause, Resume, Delete, Duplicate.
* **Process Management:** Create, Update, Delete (with soft confirmation & recovery warning), Move, Rename, Duplicate, Copy, Pin, Export, Import, Search, Filter, Favorite, Folder, Tags, Version History.

### 8.8 Team Management & Settings
* **Team Management:** Teams, Folders, Members, Permissions, Role Management, Permission Matrix (Granular permissions: Delete/Edit/Execute/Create/Export Process, Manage Scheduler/Profiles/Team).
* **Settings Integration:** Thread count, Max browsers, Timeout, Retry, Download directory, Default profile, Proxy, Language, User Agent, Window size, Developer mode, Logging level.

### 8.9 Task Log & Debug Mode
* **Task Log:** Full execution logs. Display: Workflow, Node, Execution times (Start, Finish, Duration), Status, Message, Stack trace, Retry count, IDs (Browser, Profile, Thread). Support Search, Filter, Sort, Export, Clear, Re-execute.
* **Debug Mode:** Run, Debug, Breakpoint, Step Into, Step Over, Continue, Stop, Variable Watch, Node Highlight, Execution Timeline.

### 8.10 Plugin System & Security
* **Plugin System:** Every integration must implement Initialize, Validate, Execute, Destroy, Configuration. Dynamically discoverable.
* **Security:** Encrypt API Keys, Tokens, Credentials, Secrets. Never store sensitive values in plain text.

---

## 9. CODE QUALITY & PERFORMANCE
* Use TypeScript strict mode.
* No duplicated business logic, utilities, or IPC channels.
* No circular dependencies.
* Use dependency injection where appropriate. Organize code into reusable services. Every public module must have clear interfaces.
* **Performance:** Avoid UI blocking, support long-running tasks via asynchronous execution, avoid memory leaks, reuse browser instances where appropriate, gracefully recover from failures.

---

## 10. FINAL ACCEPTANCE CRITERIA
Implementation is NOT complete until every required integration point has been connected (UI, IPC, Business Logic, DB, Settings, Routing, Menus, Permissions, Logs).

The implementation is complete only when all of the following are satisfied:
1. Visual workflow builder is fully functional and uses existing design systems.
2. Workflow JSON can be saved, loaded, imported, and exported.
3. Process Engine executes every supported node correctly.
4. Browser automation runs reliably using Playwright, strictly reusing the existing Browser Manager.
5. Thread manager supports concurrent execution with queueing.
6. Scheduler supports one-time and recurring tasks, hooked into existing logic if applicable.
7. Team permissions are enforced via the current auth matrix.
8. Plugins (OpenAI, Google Sheets, 2Captcha, REST API) are operational.
9. Complete execution logs are available and connected to the main logger.
10. Debug mode functions correctly.
11. Project builds successfully without TypeScript errors or broken imports.
12. Application runs successfully in Electron; existing functionality works without regression.
13. No duplicate managers, duplicate schedulers, or placeholder implementations exist.
14. All requested functionality is implemented end-to-end.

```
# Twix

An AI chat app where conversations can **branch**. Highlight any part of a response to open a side thread (called a "tangent"), explore that idea in depth, and merge your findings back — without losing your place in the main conversation.

Think of it like browser tabs, but for thoughts.

## What it does

**Branching conversations** — In a normal chatbot, you have one linear thread. In Twix, you can highlight any text the AI wrote, click "Open tangent", and a new side panel opens with a focused sub-conversation about just that topic. Tangents can branch into their own tangents, as deep as you want.

**Full context inheritance** — Every tangent automatically inherits the full conversation history from its parent. The AI always knows the bigger picture, even when you're five branches deep.

**Merge back** — When you're done exploring a tangent, merge it back into the parent thread. The AI generates a short summary of what was discussed, so you (and the AI) can reference it later.

**Live code execution** — The AI has access to a cloud Linux sandbox (powered by E2B). It can clone repos, install dependencies, write files, run commands, start dev servers, and give you a live preview URL — all from the chat.

**Web search** — When you ask about current events or recent topics, the AI automatically searches the web first and cites its sources inline.

## How it works under the hood

### The branching model

The database stores conversations as a **tree of threads**. Each conversation has one main thread (depth 0) and any number of child threads (tangents). Each tangent points back to:
- its **parent thread** (where it branched from)
- the specific **parent message** (the message the user highlighted)
- the **highlighted text** (what they selected)

This creates a tree structure: Main → Tangent A → Sub-tangent A1, etc.

### Context building & hierarchical compression

When the AI responds in any thread, it needs to "see" the conversation history above it — not just the current branch, but its ancestors too. Naively sending every ancestor message verbatim would cause token usage to explode as users branch deeper.

The **context builder** (`lib/context-builder.ts`) solves this with **hierarchical compression** — the further away an ancestor thread is, the more aggressively it gets compressed:

```
┌─────────────────────────────────────────────────────────────────┐
│                    WHAT THE AI RECEIVES                         │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Grandparent thread (depth 0)          ░░ SUMMARY ONLY   │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │ "The user discussed X, Y, Z. Key conclusions: ..." │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │  ~ 50-100 tokens (was 2000+)                              │  │
│  └───────────────────────────────────────────────────────────┘  │
│                          │                                      │
│                    ▼ branched on                                 │
│                  "highlighted text"                              │
│                          │                                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Parent thread (depth 1)          ░░ SUMMARY + RECENT    │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │ Summary of older messages (paragraph)               │  │  │
│  │  ├─────────────────────────────────────────────────────┤  │  │
│  │  │ Last 10 messages in FULL (up to branch point)       │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │  ~ 500-1500 tokens (was 5000+)                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                          │                                      │
│                    ▼ branched on                                 │
│                  "highlighted text"                              │
│                          │                                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Current thread (depth 2)               ░░ FULL DETAIL   │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │ ALL messages in full                                │  │  │
│  │  │ + merged tangent summaries injected at merge points │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

| Ancestor distance | What's sent to the LLM | Typical tokens |
|---|---|---|
| **Current thread** | All messages + merged tangent summaries | Full |
| **Immediate parent** | Paragraph summary of older messages + last 10 messages verbatim | ~500–1500 |
| **Grandparent and above** | Paragraph summary only + tangent transition markers | ~50–100 each |

**Eager summarization** — Summaries aren't generated on-the-fly. After every assistant response, a background job checks whether the thread has accumulated 20+ new messages since its last summary. If so, it generates a paragraph summary (via GPT-4.1-nano) and stores it in the database. This means the context builder just reads a pre-computed summary — no extra LLM call at request time.

```
  User sends message
         │
         ▼
  ┌─────────────┐     ┌──────────────────┐
  │  Chat API   │────▶│  Context Builder  │──── reads thread.summary from DB
  │  route.ts   │     │  (hierarchical)   │──── fetches recent messages
  └──────┬──────┘     └──────────────────┘
         │
         ▼
  Stream AI response
         │
         ▼
  Persist assistant message
         │
         ▼
  ┌──────────────────────┐
  │  Thread Summarizer   │  (fire-and-forget)
  │  ┌────────────────┐  │
  │  │ 20+ new msgs?  │──│── no → skip
  │  │ since summary  │  │
  │  └───────┬────────┘  │
  │          yes          │
  │          ▼            │
  │  Generate paragraph   │
  │  summary via LLM      │
  │          │            │
  │          ▼            │
  │  Store in thread.     │
  │  summary + update     │
  │  summaryMessageCount  │
  └──────────────────────┘
```

This means a tangent five levels deep sends ~200 tokens of ancestor summaries instead of thousands of verbatim messages — while still giving the AI full context for the active conversation.

### State management

The client uses **Zustand** (a lightweight React state library) with four stores:
- **Tangent store** — tracks which tangent panels are open, which is active, parent-child relationships
- **Chat store** — per-thread chat state
- **Conversation store** — sidebar conversation list
- **UI store** — sidebar open/closed, etc.

The tangent store handles cascade closing (closing a parent closes all its children) and tab switching (when a thread has multiple child tangents, only one is visible at a time).

### AI streaming

Chat uses the **Vercel AI SDK v6** with `streamText()`. The AI response streams token-by-token to the client via `useChat`. The AI also has access to **tools** — functions it can call mid-response:

| Tool | What it does |
|------|-------------|
| `webSearch` | Searches the web via Tavily API |
| `runCommand` | Runs shell commands in the sandbox |
| `readFile` / `writeFile` | Read/write files in the sandbox |
| `listDir` | Browse the sandbox filesystem |
| `startServer` | Start a dev server, get a live preview URL |
| `getServerLogs` | Check server stdout/stderr for debugging |
| `killProcess` | Kill a background process before restarting |

The AI can chain up to 10 tool calls per response, so it can clone a repo → install deps → edit a file → start a server in one turn.

### Live preview

When the AI starts a dev server, it returns a public URL via E2B's `getHost()`. The markdown renderer detects E2B URLs in the response and automatically renders them as an embedded iframe preview — so you see the running app inline in the chat.

## Tech stack

| Layer | Technology | What it is |
|-------|-----------|------------|
| Framework | **Next.js 16** (App Router) | Full-stack React framework — handles both the UI and the API |
| Language | **TypeScript** | JavaScript with type checking |
| Database | **PostgreSQL** + **Prisma v7** | Relational database + an ORM (a library that lets you query the database with TypeScript instead of raw SQL) |
| Auth | **NextAuth v5** | Handles login, sessions, and protecting routes |
| AI | **OpenAI GPT-4o** via **Vercel AI SDK v6** | LLM for chat responses; the SDK handles streaming, tool calling, and the React hooks |
| State | **Zustand** | Lightweight client-side state management (like Redux but simpler) |
| Styling | **Tailwind CSS v4** | Utility-first CSS framework |
| Code editor | **CodeMirror** (via `@uiw/react-codemirror`) | In-browser code editor with syntax highlighting |
| Math rendering | **KaTeX** | Renders LaTeX math equations in responses |
| Markdown | **react-markdown** + remark/rehype plugins | Renders AI responses as formatted HTML (with tables, code blocks, etc.) |
| Web search | **Tavily** | API for real-time web search results |
| Code sandbox | **E2B** | Cloud Linux VMs for running code, servers, and commands |
| Testing | **Vitest** + **Testing Library** | Unit testing framework |

## Live Demo

Deployed on **Vercel** with **Neon** (serverless PostgreSQL): [twix-chat.vercel.app](https://twix-chat.vercel.app/)

## Setup

### Prerequisites

- **Node.js** 18+
- **PostgreSQL** running locally (or a remote connection string)
- An **OpenAI API key**

### 1. Clone and install

```bash
git clone <your-repo-url>
cd tenex
npm install
```

### 2. Set up environment variables

Create a `.env` file in the project root:

```env
# Required
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/twix"
AUTH_SECRET="run-npx-auth-secret-to-generate-this"
AUTH_URL="http://localhost:3000"
OPENAI_API_KEY="sk-..."

# Optional — enables web search
TAVILY_API_KEY=""

# Optional — enables cloud code execution
E2B_API_KEY=""
```

Generate `AUTH_SECRET` by running:
```bash
npx auth secret
```

### 3. Set up the database

```bash
# Create the database (if using local PostgreSQL)
createdb twix

# Run migrations to create all the tables
npx prisma migrate dev

# (Optional) Seed with a test user and sample conversation
npx prisma db seed
# Creates: test@twix.dev / password123
```

### 4. Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up or use the test account.

### Other commands

```bash
npm run build        # Production build
npm run lint         # Run ESLint
npm run test         # Run tests (Vitest)
npm run format       # Format code (Prettier)
```

## Project structure

```
tenex/
├── app/                        # Next.js App Router pages & API routes
│   ├── (auth)/                 # Login & register pages
│   ├── (chat)/                 # Main chat interface
│   │   └── c/[conversationId]/ # Individual conversation page
│   └── api/
│       ├── chat/route.ts       # AI streaming endpoint (main brain)
│       ├── conversations/      # CRUD for conversations
│       └── threads/            # Thread operations (branch, merge, messages)
├── components/
│   ├── chat/                   # Chat UI (messages, input, code blocks, preview)
│   ├── auth/                   # Login/register forms
│   ├── landing/                # Landing page
│   └── layout/                 # Sidebar, navigation
├── hooks/                      # React hooks (useChat wrapper, text selection, etc.)
├── lib/
│   ├── context-builder.ts      # Recursive context assembly (core algorithm)
│   ├── merge.ts                # AI summary generation for merges
│   ├── ai.ts                   # Model config & system prompt
│   ├── e2b.ts                  # Cloud sandbox management
│   └── prisma.ts               # Database client
├── store/                      # Zustand stores (tangent, chat, conversation, ui)
├── prisma/
│   ├── schema.prisma           # Database schema
│   └── seed.ts                 # Test data seeder
└── types/                      # TypeScript type definitions
```

## Database schema (simplified)

```
User ──< Conversation ──< Thread ──< Message
                              │
                              ├── parentThreadId  (points to parent thread)
                              ├── parentMessageId (the message that was highlighted)
                              ├── highlightedText (what the user selected)
                              ├── depth           (0 = main, 1+ = tangent)
                              └── status          (ACTIVE / MERGED / ARCHIVED)

MergeEvent
  ├── sourceThreadId  (the tangent being merged)
  ├── targetThreadId  (the parent thread receiving it)
  ├── afterMessageId  (where in the parent to insert the summary)
  └── summary         (AI-generated summary of the tangent)
```

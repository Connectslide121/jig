# Jig factory — how you use it, and every screen

Part of [phase 28](../28-factory.md). The visual mockup is [mockup.html](mockup.html) (open it in a
browser); this file is the spec the code follows. Jig's UI rules apply to every screen (AGENTS.md:
tokens only, aligned columns with status at the right edge, whole rows and cards clickable, modals
for forms, no layout shift, laid out for a sidebar, the bottom panel and a tab, Jig Dark and Light).

## A run, as you live it

1. **Monday 08:05, on the train.** An idea comes up in a meeting. In Jig's meeting window you press
   **Start Jig factory** on the meeting (or, at your desk, the top bar's **factory** button → **New
   idea**). The New idea modal has the meeting excerpt in it; you add one sentence by voice, pick
   the product (or **New product**), press **Start interview**.
2. **The interview tab opens.** On the left, question cards appear three to five at a time, each with
   a suggested answer already filled in: "Who uses this first? → *Booking staff at the head office*".
   You press **✓** on most, change two, dictate one. On the right, the **brief** fills in as you go;
   a coverage ring shows 9/12 topics. The interviewer suggests **L2: working prototype** ("the
   product already has bookings and customers; this fits its data model") and asks for languages
   (English pre-selected). You press **Looks right** (G0).
3. **The Plan step** (a modal): the stages of the run, the outputs pre-ticked for this track (you
   untick the newsletter), a **gate owner** per gate (G1: me; G4 sales: a colleague, their board),
   permissions for the run ("Don't ask" lets it run unattended), **Start run**.
4. **The Floor.** The run's card sits in the **Demo** lane with a live progress ring. You close the
   laptop. Your phone buzzes at 11:40: "**Shift swap · Demo v1 is ready**" with a screenshot and
   **Approve · Ask for changes · Open in Jig**. You tap **Ask for changes** and dictate "the swap
   needs a manager's OK step". At 12:30: "Demo v2 is ready". **Approve.**
5. **The pack runs** (3 chats at a time). The card moves to **Pack**: 11 outputs filling in. In the
   evening the top bar says **4 waiting for you**: the **Inbox** lists spec, stories, tests and
   release notes, each a card you open, read, edit if needed, **Approve**. Your colleague approves the
   pitch and the sales course from their board.
6. **Tuesday.** Run → **Publish demo**: Jig factory asks where (the demo site) and for how long
   (30 days), scans for real data, you confirm. The salespeople get the course link.

## Where things are

| Place | What | Opens with |
|---|---|---|
| Top bar | **factory** button with a count of what waits for you; its menu: New idea…, Floor, Inbox | always there |
| View → Views → **Jig factory** | the compact runs list (sidebar or bottom panel) | View menu |
| Tab **Floor** | every run of the project as cards in lanes | top bar, view header |
| Tab **Run** | one run: stages, outputs, timeline | a run card |
| Tab **Interview** | questions + live brief | New idea, a run in Interview |
| Tab **Demo review** | device frames, versions, pins, scores | "Review demo" on a run or the inbox |
| Tab **Inbox** | everything waiting for a person, all runs | top bar count |
| Modal **New idea** | capture | top bar, a meeting, a message's ⋯ |
| Modal **Plan** | stages, outputs, owners, level, languages, permissions | after G0 |
| Settings → **Jig factory** | demo kit path, concurrency, critic, publish targets, default language | Settings |
| Phone | gate cards with buttons | by itself |

## Screens

### Floor (tab)

```
┌ Jig factory · Floor ───────────────────────────────────────────── [＋ New idea] ┐
│  3 running    2 waiting for you    4 h 10 m idea → demo    82 % approved as is │  ← KPI strip, fixed height
├──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────┤
│ Interview    │ Demo         │ Review       │ Pack         │ Launch       │ Done │  ← lanes (scroll horizontally narrow)
│ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐ │              │      │
│ │■ Shift sw│ │ │■ Route pl│ │ │■ Invoice │ │ │■ Course  │ │              │      │
│ │ L2  ◔ 4/9│ │ │ L1  ◑ v2 │ │ │ L3 needs │ │ │ L1 ◕ 9/11│ │              │      │
│ │ 2 h  ●you│ │ │ 40 m     │ │ │ you  ●you│ │ │ 1 d      │ │              │      │
│ └──────────┘ │ └──────────┘ │ └──────────┘ │ └──────────┘ │              │      │
```

- A **card** (whole card clickable → Run tab): product square + title on line 1; level badge, a
  progress ring and its count on line 2; time in the run and, at the right edge, a "you" chip when a
  gate waits for you. Fixed height; the ring and chip slots exist even when empty.
- Lanes by state: Interview, Demo (S4–S6), Review (G1), Pack (S7–G4), Launch (S8–G5), Done.
- Narrow (sidebar): the lanes become one list grouped by lane, cards one per row.
- Empty: a centred illustration-free empty state: "No runs yet" + **New idea**.

### New idea (modal)

```
┌ New idea ─────────────────────────────────────────────────────┐
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ Describe the idea, paste anything, or press the mic…      │ │  ← Textarea, 6 rows, mic button
│ └───────────────────────────────────────────────────────────┘ │
│ [📎 files]  [From a meeting ▾]                                │  ← attachments as chips below, fixed box
│ Product  [■ Booking suite ▾]   or  ( ) New product             │
│ Track    (•) New idea  ( ) Existing product  ( ) Change request  ( ) Tender
│                                         [Cancel] [Start interview] │
└───────────────────────────────────────────────────────────────┘
```

### Interview (tab)

```
┌ Shift swap · Interview ───────────────────────────── coverage ◕ 9/12 ┐
│ Questions (round 3)                       │ Brief (draft)              │
│ ┌───────────────────────────────────────┐ │ Problem   Staff swap shifts│
│ │ Who approves a swap?                  │ │           by phone today… │
│ │ [ The shift's manager            ] ✓ ✎ 🎤│ │ Value    …                 │
│ │ ( ) manager ( ) planner ( ) nobody    │ │ Users    Staff, managers   │
│ └───────────────────────────────────────┘ │ Flow     1 Pick shift → …  │
│ ┌───────────────────────────────────────┐ │ Screens  4                 │
│ │ Languages for the customer material?  │ │ Level    L2 · because …    │
│ │ [ English                        ] ✓ ✎ 🎤│ │ Open     ▲ 3 gaps          │  ← gaps highlighted
│ └───────────────────────────────────────┘ │                            │
│ [Answer all suggested]   [Good enough]    │        [Looks right → G0]  │
```

- Cards have a fixed size; a new round replaces the cards in place (no push-down); answered rounds
  collapse into a "Rounds 1–2" line above with a count.
- The brief panel is a fixed grid of sections; a section being written shows a skeleton line.
- The chat behind it is a normal Jig chat ("Open chat" in ⋯) for anyone who wants to talk freely.

### Plan (modal, after G0)

Three columns in a wide modal: **Stages** (the track's graph as a vertical list, each with its
recipe and provider mark), **Outputs** (checkbox list grouped Docs · Sales · Learning · Marketing,
each with its language), **Gates** (one row per gate: name, owner picker (me / a person + board),
cap). Footer: permissions (Accept edits / Don't ask), **Start run**.

### Run (tab)

```
┌ ■ Shift swap · L2 · new idea                          [Pause] [⋯] ┐
│ S1 ●─ S2 ●─ G0 ✓─ S4 ●─ S5 ◐ v2 ─ S6 ○ ─ G1 ○ ─ S7 ○ ─ G2 ○ ─ … │  ← stage graph, fixed row
├───────────────────────────────────────────────┬──────────────────┤
│ Outputs                                       │ Timeline          │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐   │ 11:40 Demo v1 …   │
│ │ thumb  │ │ thumb  │ │  doc   │ │  doc   │   │ 11:52 You: change │
│ │Demo v2 │ │Directn.│ │Brief   │ │Scout   │   │ 12:30 Demo v2 …   │
│ │  draft●│ │approved│ │approved│ │  draft●│   │                   │
│ └────────┘ └────────┘ └────────┘ └────────┘   │ Chats (3)  ⋯      │
```

- Stage nodes: status icon + label; click → the stage's chat, report and its outputs (a side
  sheet, not an inline expander).
- Output cards (whole card → preview): thumbnail or file icon, name, version, status pill at the
  bottom-right edge.
- ⋯: Re-run a stage, Fork from here, Inspector, Merge branch, Stop.

### Demo review (tab)

```
┌ Shift swap · Demo review   [v1] [v2●] [v3]   score 4.3 ✓   [Ask for changes] [Approve] ┐
│ ┌ desktop 1440 ───────────────────┐ ┌ tablet 834 ──────┐ ┌ phone 390 ┐ │ What changed in v2 │
│ │                                 │ │                  │ │           │ │ + manager OK step  │
│ │        live demo frame          │ │                  │ │           │ │ Scorecard          │
│ │            (pins ①②)            │ │                  │ │           │ │ hierarchy   4.5    │
│ └─────────────────────────────────┘ └──────────────────┘ └───────────┘ │ spacing     4.0 …  │
```

- Click on a frame in **Pin** mode drops a numbered pin with a comment; Ask for changes collects the
  pins into the next version's prompt (modal to review them first).
- Device frames scale to fit; the layout switches to one frame + device tabs in narrow places.

### Inbox (tab)

Rows grouped by gate across runs: product square, run, output, waited for, owner, status pill at the
right edge. A row opens the output in a review sheet: rendered Markdown (or the demo), **Approve**,
**Edit** (opens the file in Preview's editor), **Reject** (modal with a reason). The top bar count
equals the rows owned by "me".

### Phone cards

```
Shift swap · Demo v2 is ready            Shift swap needs you
[screenshot]                             "Which price model should the
Score 4.3 · 1 change since v1             pitch use?"
[Approve] [Ask for changes] [Open]       [Answer] [Open]
```

## Copy and tone

Plain words: "Waiting for you", "Ask for changes", "Looks right". The assistant is "Jig" (AGENTS.md,
D-413). Every AI-made output says so where it is shown ("Draft by Jig · check before you approve").

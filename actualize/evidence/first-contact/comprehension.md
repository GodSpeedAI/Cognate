# First-contact comprehension: Cognate landing page

Source read: /tmp/claude-1000/-home-sprime01-projects-cognate/91e0ba2e-15d8-47d4-bef4-6c86664f2534/scratchpad/fc/page.txt (only this file was read).

## 1. What is Cognate, in ordinary language?
It is a toolkit for making apps where AI helpers do some of the work. You describe an app, a coding AI assembles it from Cognate's ready-made pieces, and the finished app can contain AI helpers that act within limits you set. The page calls it a "framework," which I read as "a set of building blocks," but I could not tell how big or how real it is from the text alone.

Confidence: 3

## 2. Who is in control, you or the AI? How do you know?
The page says you are: "You steer the software," and "You stay the one who decides." It also says permissions are checked "in code," not just requested in a prompt, and that risky steps pause for a person. I believe the intent, but the page only asserts these; I saw no proof of the code check itself.

Confidence: 3 (the claim is clear; the evidence is assertion)

## 3. Building vs. working inside
Building: your coding AI writes the app's code, its plan, its new pieces and its tests, with you reviewing. Working inside: once the app exists, its own AI helper does the job, such as looking up an order and proposing a refund, and it must stop and wait for a person above a set limit.

Confidence: 4

## 4. What is a "capability"?
A capability is a named, versioned job the app can ask for, such as "billing.quote@1" or "refunds.issue." The code asks for the job by name rather than for a specific tool, and any compatible provider can answer, after a permission check that defaults to "no." The page also uses "parts" and "capabilities" for overlapping things, so the boundary between them was fuzzy to me.

Confidence: 3

## 5. Is Cognate-Workbench the same as Cognate? What is it?
No. Workbench is a working example app built with Cognate, described as "an agent harness for coding and general work," where AI agents write code, plan and carry out tasks with you. The page says so twice: "Workbench is what was built. Cognate is what it was built from," and "Workbench is an example app. It is not Cognate."

Confidence: 4

## 6. How does an app get new features? Can its AI change itself?
New features come through a development step you start and review: the coding agent models, builds, binds and tests the new part, then asks you to accept it. The page says a running agent "has no way to add parts to itself," so the app's AI cannot change itself. The example given is a receipt capability added to the refund desk, and a Workbench feature that is still on a branch.

Confidence: 4

## 7. What would I do first, and what would show it worked?
Install Bun 1.4+, git, Node.js and a coding agent. Make an empty folder, run the `npx skills add GodSpeedAI/Cognate ...` command, paste the refund-desk request into the agent, then run `bun test`. It worked when the tests pass, and the page lists five named journeys (small refund completes, large refund waits, approval completes it, denial refunds nothing, history records each step). The page also says "Seven tests should pass," which does not match the five I counted, so I was unsure of the exact bar.

Confidence: 3

## 8. "Finished" vs. "accepted"
"Finished" means the agent stopped working. "Accepted" means a person reviewed the evidence and approved it. The page says "Completion without proof is theater," and it shows a separate "Accepted by a person" step at the end of the feature lifecycle.

Confidence: 4

## 9. Where I got confused, bored, or lost the thread
Quoted phrases that were jargon or unclear to me:
1. "A capability has a stable name and version, like billing.quote@1."
2. "Any eligible part can do it."
3. "Depends on: C-03 Workspace (requires) ... Used by: none verified."
4. "DomainForge makes business meaning executable."
5. "bindCapabilities(loaded.projection, ["
6. "Config agent / Coding agent / Cognitive agent," and "L1 Interface ... L4 Durable record," with no explanation of what they do.
7. "Workbench's Expert Teams work added Experts, Teams and Schedules ... in development (branch)."
8. "Starting from a project template with cognate create currently needs a copy of the Cognate source."

The long repeated diagram (the same C-01 to C-14 grid appears three times) and the parts list made me bored and lost the thread. I could not tell what a "part" was versus a "capability," or why there were 14 of them.

Confidence: 4

## 10. Claims I did not believe, and why
- "A prompt is not an authority boundary, so Cognate checks permissions in code." Stated, not shown.
- "A running agent ... has no way to add parts to itself." Stated, not demonstrated.
- "No account, no API key." The steps require a coding agent such as Claude Code, which normally needs its own account or key, so this claim seemed incomplete.
- "Seven tests should pass." The page lists five journeys, so I was not sure of the count.
- "Used by: none verified." Many dependency lines say this, which made the architecture picture feel unfinished rather than proven.
- "Does this hold up for a real application?" is answered by a demo built by the same project, which is not independent evidence.

Confidence: 4

## 11. One sentence for a friend
It is a toolkit that lets a coding AI build an app whose own AI helpers can do real work within permissions you set, pausing for you on risky steps.

Confidence: 4

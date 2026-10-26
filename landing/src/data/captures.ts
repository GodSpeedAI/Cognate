import type { Capture } from './types';

// Bare captures copied byte-for-byte from the pinned Workbench SHAs (rule R8: no pixel edits).
// The four contract captures are pinned at main d208cd0; the two Expert Teams captures at main
// c2abce2, where that work merged.
const WB = 'd208cd0491d5d76839ed4dedbababc589383ad09';
const WB_MAIN2 = 'c2abce2496e19988d534e4b465a3c7204538e737';
const WBR = 'GodSpeedAI/Cognate-Workbench';

export const captures: readonly Capture[] = [
  {
    file: 'captures/workbench/e2e-03-contract-complete.png',
    repo: WBR,
    sha: WB,
    sourcePath: 'screenshots/workbench/e2e-03-contract-complete.png',
    width: 1440,
    height: 900,
    shows: 'A task contract with goal, skills, authority, budget and acceptance criteria, marked complete and not yet accepted.',
    caption: 'Real screen from Cognate-Workbench',
    alt: 'Workbench task screen. The contract shows a goal, one skill, read-write-shell authority, a budget and three acceptance criteria, all open. The page reads "Nothing here is accepted until the evidence says so."',
  },
  {
    file: 'captures/workbench/e2e-05-authority-and-blocked.png',
    repo: WBR,
    sha: WB,
    sourcePath: 'screenshots/workbench/e2e-05-authority-and-blocked.png',
    width: 1440,
    height: 900,
    shows: 'The same task running, with the finished step checked and the other steps still open.',
    caption: 'Real screen from Cognate-Workbench',
    alt: 'Workbench task screen while running. The task is marked running and bound to chat; only the Finished step is checked, and the three acceptance criteria are open.',
  },
  {
    file: 'captures/workbench/e2e-07-review-gate.png',
    repo: WBR,
    sha: WB,
    sourcePath: 'screenshots/workbench/e2e-07-review-gate.png',
    width: 1440,
    height: 900,
    shows: 'The return contract form with a ready-for-review checkbox, economics, and authority rows.',
    caption: 'Real screen from Cognate-Workbench',
    alt: 'Workbench review screen. The task is in ready-for-review state. The return contract has a ready-for-review checkbox and a save button, and the economics show tokens and concurrency within limits.',
  },
  {
    file: 'captures/workbench/e2e-08-accepted.png',
    repo: WBR,
    sha: WB,
    sourcePath: 'screenshots/workbench/e2e-08-accepted.png',
    width: 1440,
    height: 900,
    shows: 'The task accepted after its three criteria are closed; Operationalized is still open.',
    caption: 'Real screen from Cognate-Workbench',
    alt: 'Workbench task screen after acceptance. The task is marked accepted. Finished, Produced, Tested, Ready for review and Accepted are checked, Operationalized is open, and all three criteria show closed.',
  },
  {
    file: 'captures/workbench-expert-teams/default-team-desktop.png',
    repo: WBR,
    sha: WB_MAIN2,
    sourcePath: 'screenshots/experts/default-team-desktop.png',
    width: 1440,
    height: 900,
    shows: 'The Experts and Teams screen with the default Cognate Team and its specialists.',
    caption: 'Real screen from Cognate-Workbench',
    alt: 'Experts and Teams screen. The default Cognate Team lists a Product Manager orchestrator and Builder, Critic, Verifier and Reviewer specialists, with controls to open a team conversation.',
  },
  {
    file: 'captures/workbench-expert-teams/team-conversation-handoff-desktop.png',
    repo: WBR,
    sha: WB_MAIN2,
    sourcePath: 'screenshots/experts/team-conversation-handoff-desktop.png',
    width: 1440,
    height: 900,
    shows: 'A team conversation in which a message is sent to a specialist and the reply is shown.',
    caption: 'Real screen from Cognate-Workbench',
    alt: 'Team conversation screen for a Quality Review Team. A message addressed to the Builder specialist was sent, and the Product Manager replied with a summary.',
  },
];

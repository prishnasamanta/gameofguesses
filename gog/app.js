const state = {
  numPlayers: 0,
  myId: 0,
  myScore: 0,
  currentSet: 1,
  currentRound: 0,
  announcedColor: "",
  holderId: 0,
  playerGuess: null,
  assignedRoles: [],
  playerRoundColors: [],
  roleSelection: []
};

const ORDERED_COLORS = [
  { name: "GREEN", hex: "#22c55e", text: "#07210f" },
  { name: "NEON", hex: "#a3e635", text: "#1a2e05" },
  { name: "BLUE", hex: "#3b82f6", text: "#ffffff" },
  { name: "ORANGE", hex: "#f97316", text: "#111827" }
];

const ROLES = [
  {
    name: "Twin Scan",
    desc: "Pick 2 players and reveal color of one selected player.",
    action: "pick-two-reveal-one"
  },
  { name: "Tracker", desc: "No action. Passive role.", action: "none" },
  { name: "Shield", desc: "No action. Passive role.", action: "none" },
  { name: "Echo", desc: "No action. Passive role.", action: "none" }
];

const $ = (id) => document.getElementById(id);
const hide = (el) => el.classList.add("hidden");
const show = (el) => el.classList.remove("hidden");

function init() {
  $("start-btn").addEventListener("click", () => {
    hide($("start-screen"));
    show($("player-count-screen"));
  });

  $("reset-btn").addEventListener("click", () => location.reload());
  $("submit-guess-btn").addEventListener("click", submitGuess);
  $("no-vote-btn").addEventListener("click", noVote);
  $("role-confirm-btn").addEventListener("click", confirmRolePick);

  const grid = $("count-buttons");
  for (let n = 4; n <= 12; n++) {
    const btn = document.createElement("button");
    btn.className = "btn primary";
    btn.textContent = String(n);
    btn.addEventListener("click", () => startGame(n));
    grid.appendChild(btn);
  }
}

function startGame(n) {
  state.numPlayers = n;
  state.myId = Math.floor(Math.random() * n) + 1;
  state.myScore = 0;
  state.currentRound = 0;
  state.assignedRoles = assignRoles(n);

  renderRoleList();
  renderColorOrder();
  renderTable();
  updateHeader();

  hide($("player-count-screen"));
  show($("main-game"));

  nextRound();
}

function assignRoles(n) {
  const list = [];
  for (let i = 0; i < n; i++) list.push(ROLES[i % ROLES.length].name);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function renderRoleList() {
  const box = $("role-list");
  box.innerHTML = "";
  ROLES.forEach((r) => {
    const row = document.createElement("div");
    row.innerHTML = `<strong>${r.name}</strong><br><small>${r.desc}</small>`;
    box.appendChild(row);
  });
}

function renderColorOrder() {
  const box = $("color-order");
  box.innerHTML = "";
  ORDERED_COLORS.forEach((c, idx) => {
    const row = document.createElement("div");
    row.innerHTML = `<strong>${idx + 1}. ${c.name}</strong>`;
    row.style.background = c.hex;
    row.style.color = c.text;
    row.style.padding = "8px";
    row.style.borderRadius = "8px";
    box.appendChild(row);
  });
}

function renderTable() {
  const table = $("circle-table");
  table.innerHTML = "";
  const radius = table.clientWidth * 0.38;
  const cx = table.clientWidth / 2;
  const cy = table.clientHeight / 2;

  for (let i = 0; i < state.numPlayers; i++) {
    const angle = (i * 2 * Math.PI) / state.numPlayers;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    const seat = document.createElement("div");
    seat.className = "seat";
    if (i + 1 === state.myId) seat.classList.add("me");
    seat.style.left = `${x - 37}px`;
    seat.style.top = `${y - 37}px`;
    seat.innerHTML = `P${i + 1}<small>${state.assignedRoles[i]}</small>`;
    table.appendChild(seat);
  }
}

function updateHeader() {
  $("round-info").textContent = `Set ${state.currentSet} - Round ${state.currentRound}/${state.numPlayers}`;
  $("score-info").textContent = `Score: ${state.myScore}`;
}

function nextRound() {
  if (state.currentRound >= state.numPlayers) {
    endSet();
    return;
  }
  state.currentRound += 1;
  state.playerGuess = null;
  state.roleSelection = [];
  updateHeader();

  const colorObj = ORDERED_COLORS[(state.currentRound - 1) % ORDERED_COLORS.length];
  state.announcedColor = colorObj.name;

  state.playerRoundColors = [];
  for (let i = 0; i < state.numPlayers; i++) {
    const c = ORDERED_COLORS[Math.floor(Math.random() * ORDERED_COLORS.length)].name;
    state.playerRoundColors.push(c);
  }

  const holders = [];
  for (let i = 0; i < state.playerRoundColors.length; i++) {
    if (state.playerRoundColors[i] === state.announcedColor) holders.push(i + 1);
  }
  state.holderId = holders.length ? holders[Math.floor(Math.random() * holders.length)] : Math.floor(Math.random() * state.numPlayers) + 1;

  $("status-text").textContent = `Round ${state.currentRound}: Announced color is ${state.announcedColor}.`;
  const myRole = state.assignedRoles[state.myId - 1];
  const roleObj = ROLES.find((r) => r.name === myRole);

  if (state.myId === state.holderId && roleObj && roleObj.action === "pick-two-reveal-one") {
    openRoleModal();
  } else {
    setTimeout(openGuessModal, 600);
  }
}

function openRoleModal() {
  $("role-result").textContent = "";
  const list = $("role-pick-list");
  list.innerHTML = "";
  for (let p = 1; p <= state.numPlayers; p++) {
    if (p === state.myId) continue;
    const btn = document.createElement("button");
    btn.className = "pick-btn";
    btn.textContent = `Player ${p}`;
    btn.addEventListener("click", () => toggleRolePick(p, btn));
    list.appendChild(btn);
  }
  show($("role-modal"));
}

function toggleRolePick(playerId, btn) {
  const index = state.roleSelection.indexOf(playerId);
  if (index >= 0) {
    state.roleSelection.splice(index, 1);
    btn.classList.remove("selected");
    return;
  }
  if (state.roleSelection.length >= 2) return;
  state.roleSelection.push(playerId);
  btn.classList.add("selected");
}

function confirmRolePick() {
  if (state.roleSelection.length !== 2) {
    $("role-result").textContent = "Please select exactly 2 players.";
    return;
  }
  const chosen = state.roleSelection[Math.floor(Math.random() * state.roleSelection.length)];
  const color = state.playerRoundColors[chosen - 1];
  $("role-result").textContent = `Revealed: Player ${chosen} has color ${color}.`;
  setTimeout(() => {
    hide($("role-modal"));
    openGuessModal();
  }, 1200);
}

function openGuessModal() {
  const colorObj = ORDERED_COLORS.find((c) => c.name === state.announcedColor);
  const pill = $("announced-color-pill");
  pill.textContent = state.announcedColor;
  pill.style.background = colorObj.hex;
  pill.style.color = colorObj.text;

  const list = $("guess-list");
  list.innerHTML = "";
  for (let p = 1; p <= state.numPlayers; p++) {
    const btn = document.createElement("button");
    btn.className = "pick-btn";
    btn.textContent = `Player ${p}`;
    btn.addEventListener("click", () => {
      state.playerGuess = p;
      [...list.querySelectorAll(".pick-btn")].forEach((x) => x.classList.remove("selected"));
      btn.classList.add("selected");
    });
    list.appendChild(btn);
  }
  show($("guess-modal"));
}

function noVote() {
  hide($("guess-modal"));
  state.myScore = Math.max(0, state.myScore - 25);
  updateHeader();
  $("status-text").textContent = `Round ${state.currentRound} complete. No vote applied: -25 points.`;
  setTimeout(nextRound, 900);
}

function submitGuess() {
  if (!state.playerGuess) return;
  hide($("guess-modal"));

  // Hide correct/wrong result from user, only apply score delta.
  let delta = -5;
  if (state.playerGuess === state.holderId) delta = 10;
  state.myScore = Math.max(0, state.myScore + delta);
  updateHeader();

  const sign = delta > 0 ? "+" : "";
  $("status-text").textContent = `Round ${state.currentRound} complete. Score change: ${sign}${delta}.`;
  setTimeout(nextRound, 900);
}

function endSet() {
  $("status-text").innerHTML = `<strong>Set complete.</strong> Final score: ${state.myScore}.`;
}

window.addEventListener("resize", () => {
  if (state.numPlayers > 0) renderTable();
});

init();

// Online (multiplayer) role effect calculator with deterministic choices.
// Attaches to `window.OnlinePointCalculator`.
(function () {
  function hash32(str) {
    // FNV-1a 32-bit
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function rand01(seedStr) {
    return hash32(seedStr) / 4294967296; // [0,1)
  }

  function randInt(seedStr, minIncl, maxIncl) {
    const min = Math.ceil(minIncl);
    const max = Math.floor(maxIncl);
    if (max < min) return min;
    const span = max - min + 1;
    return (hash32(seedStr) % span) + min;
  }

  function getEmpathPeekTarget({ roomCode, set, round, seatIndex, numPlayers }) {
    // Deterministic target per round + player seat.
    const target = randInt(
      `${roomCode}|set${set}|round${round}|empath|seat${seatIndex}`,
      1,
      numPlayers
    );
    return target;
  }

  function computeOnlineRoleEffects({
    numPlayers,
    assignedRoles, // [seatIndex0..] => roleName
    guesses, // 1-based array length numPlayers+1
    holderId,
    announcedColor, // e.g. "SILVER"
    roomCode,
    set,
    round,
    roleToColor,
    colorCategory, // colorName => LIGHT|DARK
    myId
  }) {
    const deltasAdjust = new Array(numPlayers).fill(0);
    const reasonsAdjust = new Array(numPlayers).fill("");

    const roleEventsByPlayer = new Array(numPlayers).fill(null).map((_, i) => {
      const seatIndex = i + 1;
      return {
        playerSeat: seatIndex,
        role: assignedRoles?.[i] || null,
        empath: null,
        illuminator: null,
        oracle: null,
        corrupter: null,
        hunter: null,
        highroller: null,
        siphon: null
      };
    });

    // Pre-compute empath/illuminator info events (for UI + summary).
    for (let p = 1; p <= numPlayers; p++) {
      const role = assignedRoles[p - 1];
      if (role === "The Empath") {
        const peekTarget = getEmpathPeekTarget({
          roomCode,
          set,
          round,
          seatIndex: p,
          numPlayers
        });
        roleEventsByPlayer[p - 1].empath = {
          peekTarget,
          peekGuess: guesses[peekTarget] ?? null
        };
      } else if (role === "The Illuminator") {
        const left = ((p - 2 + numPlayers) % numPlayers) + 1;
        const right = (p % numPlayers) + 1;
        const leftRole = assignedRoles[left - 1];
        const rightRole = assignedRoles[right - 1];
        const leftColor = roleToColor[leftRole];
        const rightColor = roleToColor[rightRole];
        const leftCat = colorCategory[leftColor] || "DARK";
        const rightCat = colorCategory[rightColor] || "DARK";
        roleEventsByPlayer[p - 1].illuminator = {
          left,
          right,
          leftCat,
          rightCat,
          sameCategory: leftCat === rightCat
        };
      }
    }

    // Oracle / Corrupter / Hunter effects (deterministic) for ALL players.
    for (let p = 1; p <= numPlayers; p++) {
      const role = assignedRoles[p - 1];

      if (role === "The Oracle") {
        const t = randInt(
          `${roomCode}|set${set}|round${round}|oracle|seat${p}`,
          1,
          numPlayers
        );
        if (t !== p) {
          deltasAdjust[t - 1] -= 10;
          deltasAdjust[p - 1] += 10;
          reasonsAdjust[p - 1] += `Oracle stole 10 from P${t}. `;
          roleEventsByPlayer[p - 1].oracle = { target: t, stolen: 10 };
        } else {
          roleEventsByPlayer[p - 1].oracle = { target: t, stolen: 0 };
        }
      } else if (role === "The Corrupter") {
        const t = randInt(
          `${roomCode}|set${set}|round${round}|corrupter|seat${p}`,
          1,
          numPlayers
        );
        const tRole = assignedRoles[t - 1];
        const tColor = roleToColor[tRole];
        const cat = colorCategory[tColor] || "DARK";
        const dmg = t === p ? 15 : cat === "LIGHT" ? 10 : 5;

        if (t >= 1 && t <= numPlayers) {
          deltasAdjust[t - 1] -= dmg;
          reasonsAdjust[p - 1] += `Corrupter hit P${t} (-${dmg}). `;
          roleEventsByPlayer[p - 1].corrupter = { target: t, cat, dmg };
        }
      } else if (role === "The Hunter") {
        const a = randInt(
          `${roomCode}|set${set}|round${round}|hunter|seat${p}|a`,
          1,
          numPlayers
        );
        const b = randInt(
          `${roomCode}|set${set}|round${round}|hunter|seat${p}|b`,
          1,
          numPlayers
        );
        const strike = rand01(`${roomCode}|set${set}|round${round}|hunter|seat${p}|pick`) < 0.5 ? a : b;
        const strikeRole = assignedRoles[strike - 1];
        const strikeColor = roleToColor[strikeRole];
        const cat = colorCategory[strikeColor] || "DARK";
        if (cat === "LIGHT") {
          deltasAdjust[strike - 1] -= 30;
          reasonsAdjust[p - 1] += `Hunter struck P${strike} (-30). `;
          roleEventsByPlayer[p - 1].hunter = { a, b, strike, cat, dmg: 30 };
        } else {
          roleEventsByPlayer[p - 1].hunter = { a, b, strike, cat, dmg: 0 };
        }
      } else if (role === "The High Roller") {
        // High Roller effect for ALL High Roller seats (no manual second guess needed online).
        const g1 = guesses[p] ?? null;
        // Deterministic second target
        const g2 = randInt(
          `${roomCode}|set${set}|round${round}|highroller|seat${p}|g2`,
          1,
          numPlayers
        );

        // Apply targeted penalties for g1 and g2 (skip self target).
        const applyTarget = (g) => {
          if (!g) return;
          if (g === p) return;
          deltasAdjust[g - 1] -= 10;
          reasonsAdjust[g - 1] += "High Roller targeted: -10. ";
          if (g === holderId) {
            deltasAdjust[g - 1] -= 5;
            reasonsAdjust[g - 1] += "High Roller correct extra: -5. ";
          }
        };
        applyTarget(g1);
        applyTarget(g2);

        // Silver jackpot interaction (matches the existing single-player logic).
        if (announcedColor === "SILVER" && (g1 === holderId || g2 === holderId)) {
          deltasAdjust[holderId - 1] -= 100;
          deltasAdjust[p - 1] += 100;
          reasonsAdjust[p - 1] += "Silver jackpot +100. ";
          reasonsAdjust[holderId - 1] += "Silver jackpot -100. ";
          roleEventsByPlayer[p - 1].highroller = { g1, g2, silverJackpot: true };
        } else {
          roleEventsByPlayer[p - 1].highroller = { g1, g2, silverJackpot: false };
        }
      }
    }

    // Ensure empath target is visible for local UI.
    const myRole = assignedRoles[myId - 1];
    if (myRole === "The Empath") {
      const mine = roleEventsByPlayer[myId - 1].empath;
      // Leave to wrapper to store state.empathPeekTarget.
      // (No extra work here.)
      void mine;
    }

    return { deltasAdjust, reasonsAdjust, roleEventsByPlayer };
  }

  window.OnlinePointCalculator = {
    getEmpathPeekTarget,
    computeOnlineRoleEffects
  };
})();


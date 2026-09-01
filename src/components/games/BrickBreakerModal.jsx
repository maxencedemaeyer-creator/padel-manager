// ─────────────────────────────────────────────────────────────────────────
// Game Center — Jeu "Brick Breaker" : casse-briques classique. La pagaie se
// pilote au doigt (glisser sur le jeu) sur mobile, et avec les flèches
// gauche/droite sur ordinateur. Chaque rangée de briques rapporte plus de
// points qu'on s'en approche du haut, et la balle accélère légèrement au
// fil de la partie pour la difficulté.
//
// Volontairement TRÈS léger pour ne jamais ralentir le reste de l'app :
// aucune librairie de jeu, un seul <canvas> dessiné à la main avec
// requestAnimationFrame, aucune image ni son chargés, et tout l'état de
// jeu (position de la balle, briques...) vit dans une simple ref mutable
// pour ne provoquer aucun rendu React à chaque frame — seuls le score et
// les vies (affichés au-dessus du jeu) déclenchent un rendu, et seulement
// quand ils changent réellement.
//
// Système de points : logique pure + Firestore dans src/lib/brickBreaker.js
// — un document unique "games/brickBreaker" garde les
// BRICK_BREAKER_HIGH_SCORES_COUNT meilleurs scores jamais réalisés, et le
// nombre de parties jouées par joueur (valable toute la saison), affichés
// tous les deux à la fin de chaque partie, qu'on peut ensuite recommencer
// à l'infini pour améliorer son score.
// ─────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppData } from "../../context/AppContext";
import { getFirstName } from "../../lib/utils";
import {
  BRICK_BREAKER_HIGH_SCORES_COUNT,
  BRICK_BREAKER_TOP_ATTEMPTS_COUNT,
} from "../../lib/constants";
import {
  fetchBrickBreakerStats,
  recordBrickBreakerAttempt,
  submitBrickBreakerScore,
} from "../../lib/brickBreaker";
import { Modal, Button, Spinner } from "../ui";

// ---- Réglages du jeu (unités "logiques" — voir la mise à l'échelle vers
// la résolution physique de l'écran dans l'effet ci-dessous). ----
const WIDTH = 300;
const HEIGHT = 400;
const PADDLE_WIDTH = 64;
const PADDLE_HEIGHT = 14;
const PADDLE_Y = HEIGHT - 22;
const PADDLE_SPEED = 260; // px/s, au clavier uniquement (le doigt, lui, positionne directement)
const PADDLE_FACE_COLOR = "#F5F5F0";
const PADDLE_FRAME_COLOR = "#3FA47C";
const PADDLE_HOLE_COLOR = "#D8D8D2";
const BALL_RADIUS = 5;
const BALL_COLOR = "#D9F04B"; // jaune-vert "balle de padel"
const BALL_OUTLINE_COLOR = "#8A9A2A"; // contour fin, juste pour rester visible sur fond clair
const BALL_SPEED_START = 200; // px/s
const BALL_SPEED_MAX = 340;
const SPEED_UP_EVERY_BRICKS = 6;
const SPEED_UP_FACTOR = 1.04;
const LIVES_START = 3;
const ROWS = 5;
const COLS = 7;
const BRICK_TOP = 36;
const BRICK_HEIGHT = 14;
const BRICK_GAP = 4;
const BRICK_WIDTH = (WIDTH - BRICK_GAP * (COLS + 1)) / COLS;
const ROW_COLORS = ["#FF6B81", "#FFA36B", "#FFD166", "#7BD389", "#5EC8E8"];
const ROW_POINTS = [50, 40, 30, 20, 10];
const RESPAWN_DELAY_MS = 900;

function buildBricks() {
  const bricks = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      bricks.push({
        x: BRICK_GAP + col * (BRICK_WIDTH + BRICK_GAP),
        y: BRICK_TOP + row * (BRICK_HEIGHT + BRICK_GAP),
        row,
        alive: true,
      });
    }
  }
  return bricks;
}

// Nouvelle balle centrée juste au-dessus de la pagaie, lancée vers le haut
// selon un angle aléatoire (ni totalement vertical, ni trop à plat).
function freshBall(speed) {
  const angle = (Math.random() * 0.5 + 0.25) * Math.PI;
  return {
    x: WIDTH / 2,
    y: PADDLE_Y - BALL_RADIUS - 2,
    vx: speed * Math.cos(angle),
    vy: -Math.abs(speed * Math.sin(angle)),
  };
}

// Petit rectangle aux coins arrondis, sans dépendre de ctx.roundRect (pas
// disponible sur tous les navigateurs/anciennes versions iOS).
function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

// Pagaie dessinée comme une mini-raquette de padel vue de dessus : une
// forme "stade" (rectangle aux bouts totalement arrondis, comme un tamis
// plat et allongé), un cadre coloré, et quelques petits trous — le tout en
// une poignée de tracés élémentaires, donc toujours aussi léger à dessiner
// à chaque frame.
function drawPaddleRacket(ctx, x, y, w, h) {
  const r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + r, r, Math.PI / 2, (3 * Math.PI) / 2);
  ctx.closePath();
  ctx.fillStyle = PADDLE_FACE_COLOR;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = PADDLE_FRAME_COLOR;
  ctx.stroke();

  // Petits trous, comme sur le tamis d'une vraie raquette de padel.
  ctx.fillStyle = PADDLE_HOLE_COLOR;
  const holeCols = 6;
  const marginX = r + 4;
  const usableW = w - marginX * 2;
  for (let row = 0; row < 2; row++) {
    const cy = y + h / 2 + (row === 0 ? -h / 5 : h / 5);
    for (let col = 0; col < holeCols; col++) {
      const cx = x + marginX + (usableW * col) / (holeCols - 1);
      ctx.beginPath();
      ctx.arc(cx, cy, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function BrickBreakerModal({ onClose }) {
  const { connectedPlayer, players } = useAppData();
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const inputRef = useRef({ left: false, right: false, dragX: null });

  const [phase, setPhase] = useState("idle"); // idle | playing | gameover
  const [hud, setHud] = useState({ score: 0, lives: LIVES_START });
  const [result, setResult] = useState(null); // { score, won }
  const [stats, setStats] = useState(null); // { highScores, attempts }
  const [loadingStats, setLoadingStats] = useState(false);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      setStats(await fetchBrickBreakerStats());
    } finally {
      setLoadingStats(false);
    }
  }, []);

  // Boucle de jeu — ne tourne que pendant la phase "playing", et s'arrête
  // proprement (cancelAnimationFrame) dès qu'on la quitte ou que la modale
  // se ferme.
  useEffect(() => {
    if (phase !== "playing") return undefined;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const state = {
      paddleX: WIDTH / 2 - PADDLE_WIDTH / 2,
      ball: freshBall(BALL_SPEED_START),
      ballSpeed: BALL_SPEED_START,
      bricks: buildBricks(),
      bricksBroken: 0,
      lives: LIVES_START,
      score: 0,
      waiting: false,
      waitUntil: 0,
      running: true,
    };
    let lastTime = performance.now();

    function endGame(won) {
      state.running = false;
      setResult({ score: state.score, won });
      setPhase("gameover");
    }

    function loseLife() {
      state.lives -= 1;
      setHud({ score: state.score, lives: state.lives });
      if (state.lives <= 0) {
        endGame(false);
        return;
      }
      state.waiting = true;
      state.waitUntil = performance.now() + RESPAWN_DELAY_MS;
      state.ball = freshBall(state.ballSpeed);
    }

    function update(dt) {
      // Pagaie : au doigt si on est en train de glisser dessus, sinon au clavier.
      const input = inputRef.current;
      if (input.dragX != null) {
        state.paddleX = input.dragX - PADDLE_WIDTH / 2;
      } else {
        if (input.left) state.paddleX -= PADDLE_SPEED * dt;
        if (input.right) state.paddleX += PADDLE_SPEED * dt;
      }
      state.paddleX = Math.max(0, Math.min(WIDTH - PADDLE_WIDTH, state.paddleX));

      if (state.waiting) {
        if (performance.now() >= state.waitUntil) state.waiting = false;
        return;
      }

      const ball = state.ball;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      // Murs gauche/droite/haut.
      if (ball.x - BALL_RADIUS < 0) {
        ball.x = BALL_RADIUS;
        ball.vx *= -1;
      } else if (ball.x + BALL_RADIUS > WIDTH) {
        ball.x = WIDTH - BALL_RADIUS;
        ball.vx *= -1;
      }
      if (ball.y - BALL_RADIUS < 0) {
        ball.y = BALL_RADIUS;
        ball.vy *= -1;
      }

      // Balle tombée sous la pagaie : une vie en moins.
      if (ball.y - BALL_RADIUS > HEIGHT) {
        loseLife();
        return;
      }

      // Pagaie : l'angle de rebond dépend du point d'impact (comme un
      // flipper) — touchée près d'un bord, la balle repart plus franchement
      // sur le côté, ce qui laisse une vraie marge de contrôle au joueur.
      if (
        ball.vy > 0 &&
        ball.y + BALL_RADIUS >= PADDLE_Y &&
        ball.y + BALL_RADIUS <= PADDLE_Y + PADDLE_HEIGHT + 6 &&
        ball.x >= state.paddleX - BALL_RADIUS &&
        ball.x <= state.paddleX + PADDLE_WIDTH + BALL_RADIUS
      ) {
        ball.y = PADDLE_Y - BALL_RADIUS;
        const hit = (ball.x - (state.paddleX + PADDLE_WIDTH / 2)) / (PADDLE_WIDTH / 2);
        const angle = Math.max(-1, Math.min(1, hit)) * (Math.PI / 3); // max ±60°
        ball.vx = state.ballSpeed * Math.sin(angle);
        ball.vy = -Math.abs(state.ballSpeed * Math.cos(angle));
      }

      // Briques : une seule cassée par frame suffit amplement.
      for (const brick of state.bricks) {
        if (!brick.alive) continue;
        if (
          ball.x + BALL_RADIUS > brick.x &&
          ball.x - BALL_RADIUS < brick.x + BRICK_WIDTH &&
          ball.y + BALL_RADIUS > brick.y &&
          ball.y - BALL_RADIUS < brick.y + BRICK_HEIGHT
        ) {
          brick.alive = false;
          state.score += ROW_POINTS[brick.row] || 10;
          state.bricksBroken += 1;
          setHud({ score: state.score, lives: state.lives });

          // Rebond horizontal ou vertical selon le côté par lequel la balle
          // a le plus chevauché la brique — un rebond simple mais crédible.
          const overlapX =
            Math.min(ball.x + BALL_RADIUS, brick.x + BRICK_WIDTH) -
            Math.max(ball.x - BALL_RADIUS, brick.x);
          const overlapY =
            Math.min(ball.y + BALL_RADIUS, brick.y + BRICK_HEIGHT) -
            Math.max(ball.y - BALL_RADIUS, brick.y);
          if (overlapX < overlapY) ball.vx *= -1;
          else ball.vy *= -1;

          if (
            state.bricksBroken % SPEED_UP_EVERY_BRICKS === 0 &&
            state.ballSpeed < BALL_SPEED_MAX
          ) {
            state.ballSpeed = Math.min(BALL_SPEED_MAX, state.ballSpeed * SPEED_UP_FACTOR);
            const norm = Math.hypot(ball.vx, ball.vy) || 1;
            ball.vx = (ball.vx / norm) * state.ballSpeed;
            ball.vy = (ball.vy / norm) * state.ballSpeed;
          }
          break;
        }
      }

      if (state.bricks.every((b) => !b.alive)) endGame(true);
    }

    function draw() {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      for (const brick of state.bricks) {
        if (!brick.alive) continue;
        ctx.fillStyle = ROW_COLORS[brick.row] || "#5EC8E8";
        roundedRect(ctx, brick.x, brick.y, BRICK_WIDTH, BRICK_HEIGHT, 4);
      }

      drawPaddleRacket(ctx, state.paddleX, PADDLE_Y, PADDLE_WIDTH, PADDLE_HEIGHT);

      // Balle "de padel" : jaune-vert, avec un contour fin pour rester
      // bien visible même sur un fond clair.
      ctx.fillStyle = BALL_COLOR;
      ctx.beginPath();
      ctx.arc(state.ball.x, state.ball.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = BALL_OUTLINE_COLOR;
      ctx.stroke();
    }

    function loop(time) {
      // dt plafonné : si l'onglet a été mis en arrière-plan puis rouvert, on
      // évite que la balle "saute" d'un coup à travers tout le terrain.
      const dt = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;
      if (!state.running) return;
      update(dt);
      draw();
      if (state.running) rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      state.running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [phase]);

  // Clavier (ordinateur) — flèches gauche/droite, actives tant qu'on joue.
  useEffect(() => {
    if (phase !== "playing") return undefined;
    function onKeyDown(e) {
      if (e.key === "ArrowLeft") inputRef.current.left = true;
      if (e.key === "ArrowRight") inputRef.current.right = true;
    }
    function onKeyUp(e) {
      if (e.key === "ArrowLeft") inputRef.current.left = false;
      if (e.key === "ArrowRight") inputRef.current.right = false;
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [phase]);

  // Tactile (mobile) — la pagaie suit directement le doigt sur le jeu.
  const handleTouch = (e) => {
    const canvas = canvasRef.current;
    const touch = e.touches[0];
    if (!canvas || !touch) return;
    const rect = canvas.getBoundingClientRect();
    inputRef.current.dragX = (touch.clientX - rect.left) * (WIDTH / rect.width);
  };
  const stopTouch = () => {
    inputRef.current.dragX = null;
  };

  const startGame = () => {
    setResult(null);
    setHud({ score: 0, lives: LIVES_START });
    inputRef.current = { left: false, right: false, dragX: null };
    setPhase("playing");
    // Comptabilisée dès le lancement (le classement porte sur le nombre de
    // parties jouées, pas seulement celles menées à leur terme) — ne bloque
    // jamais le jeu si Firestore répond lentement.
    recordBrickBreakerAttempt(connectedPlayer.id).catch(() => {});
  };

  // Fin de partie : enregistre le score puis recharge les tableaux (high
  // scores + tentatives) pour les afficher.
  useEffect(() => {
    if (phase !== "gameover" || !result) return undefined;
    let cancelled = false;
    submitBrickBreakerScore(connectedPlayer.id, result.score)
      .catch(() => {})
      .finally(() => {
        if (!cancelled) loadStats();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const playerName = (id) => {
    const p = (players || []).find((pl) => pl.id === id);
    return p ? getFirstName(p.name) : "Joueur";
  };

  const topAttempts = stats
    ? Object.entries(stats.attempts || {})
        .map(([playerId, count]) => ({ playerId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, BRICK_BREAKER_TOP_ATTEMPTS_COUNT)
    : [];

  return (
    <Modal title="Brick Breaker 🧱" onClose={onClose} wide>
      {phase === "idle" && (
        <div className="flex flex-col items-center text-center py-4">
          <p className="text-sm text-[var(--color-text-dim)] max-w-xs mb-2">
            Casse toutes les briques avant de perdre tes {LIVES_START} vies !
          </p>
          <p className="text-xs text-[var(--color-text-faint)] max-w-xs mb-6">
            📱 Sur mobile : glisse ton doigt sur le jeu.
            <br />
            💻 Sur ordinateur : flèches ← →.
          </p>
          <Button onClick={startGame} className="w-full">
            Jouer 🧱
          </Button>
        </div>
      )}

      {phase === "playing" && (
        <div className="flex flex-col items-center">
          <div className="flex items-center justify-between w-full max-w-[300px] mb-2 px-1">
            <span className="text-sm font-bold text-[var(--color-text)]">Score : {hud.score}</span>
            <span className="text-sm">{"❤️".repeat(hud.lives)}</span>
          </div>
          <canvas
            ref={canvasRef}
            style={{
              width: WIDTH,
              maxWidth: "100%",
              aspectRatio: `${WIDTH} / ${HEIGHT}`,
              touchAction: "none",
            }}
            className="rounded-[20px] border border-white/70"
            onTouchStart={handleTouch}
            onTouchMove={handleTouch}
            onTouchEnd={stopTouch}
          />
        </div>
      )}

      {phase === "gameover" && result && (
        <div className="flex flex-col items-center text-center py-2">
          <p className="pm-display font-extrabold text-2xl text-[var(--color-text)] mb-1">
            {result.won ? "Bien joué ! 🎉" : "Partie terminée"}
          </p>
          <p className="text-sm text-[var(--color-text-dim)] mb-5">
            Score : <span className="font-bold text-[var(--color-text)]">{result.score}</span>
          </p>

          {loadingStats && <Spinner />}

          {!loadingStats && stats && (
            <div className="w-full space-y-4 text-left mb-5">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-faint)] mb-2">
                  🏆 Meilleurs scores
                </p>
                {stats.highScores.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-dim)]">Aucun score enregistré.</p>
                ) : (
                  <div className="space-y-1.5">
                    {stats.highScores.map((row, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/70 border border-white/60"
                      >
                        <span className="w-4 text-center text-xs font-bold text-[var(--color-text-faint)]">
                          {i + 1}
                        </span>
                        <span className="flex-1 text-sm font-semibold text-[var(--color-text)] truncate">
                          {playerName(row.playerId)}
                        </span>
                        <span className="pm-mono font-bold text-sm text-[var(--color-lime)]">
                          {row.score}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-faint)] mb-2">
                  🎮 A tenté sa chance le plus (saison)
                </p>
                {topAttempts.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-dim)]">Aucune partie enregistrée.</p>
                ) : (
                  <div className="space-y-1.5">
                    {topAttempts.map((row, i) => (
                      <div
                        key={row.playerId}
                        className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/70 border border-white/60"
                      >
                        <span className="w-4 text-center text-xs font-bold text-[var(--color-text-faint)]">
                          {i + 1}
                        </span>
                        <span className="flex-1 text-sm font-semibold text-[var(--color-text)] truncate">
                          {playerName(row.playerId)}
                        </span>
                        <span className="text-xs text-[var(--color-text-faint)]">
                          {row.count} partie{row.count > 1 ? "s" : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <Button onClick={startGame} className="w-full mb-2">
            Rejouer 🔁
          </Button>
          <Button variant="secondary" onClick={onClose} className="w-full">
            Fermer
          </Button>
        </div>
      )}
    </Modal>
  );
}

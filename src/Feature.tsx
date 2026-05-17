import { useEffect, useMemo } from "react";
import {
  ConfettiLayer,
  createClockSync,
  Leaderboard,
  useConfetti,
  useDeadline,
  useDraft,
  useEventLog,
  useFairRng,
  useFlashOnChange,
  useNamedPeer,
  usePhase,
  useReactions,
  useRotatingTurn,
  type MeshConfig,
  type YRoom,
} from "@baditaflorin/mesh-common";

type Props = { room: YRoom | null; config: MeshConfig };
type Pitch = { id: string; peerId: string; text: string; ts: number; slotId: number };

const SLOT_MS = 30_000;
const KINDS = [
  { kind: "rocket", emoji: "🚀" },
  { kind: "think", emoji: "🤔" },
  { kind: "downvote", emoji: "👎" },
] as const;

export function Feature({ room, config }: Props) {
  if (!room)
    return (
      <div className="pitch-screen">
        <h1>pitch pong</h1>
        <p>Connecting…</p>
      </div>
    );
  return <Body room={room} config={config} />;
}

function Body({ room, config }: { room: YRoom; config: MeshConfig }) {
  const { name, setName, nameOf, myName } = useNamedPeer(config, room);
  const clock = useMemo(() => createClockSync(room.provider), [room]);
  useEffect(() => () => clock.destroy(), [clock]);

  useFairRng(room, "pitch-salts");
  const log = useEventLog<Pitch>(room, "pitches");
  const reactions = useReactions(room, "pitch-reactions");
  const phase = usePhase<"lobby" | "pitching" | "done">(room, "phase", "lobby");
  const turn = useRotatingTurn(room, clock, { slotMs: SLOT_MS, order: "shuffle" });

  const state = room.doc.getMap<number>("state");
  const baselineSlot = state.get("baselineSlot") ?? 0;
  const slotsElapsed = Math.max(0, turn.slotId - baselineSlot);
  const deadline = useDeadline(phase.phase === "pitching" ? Date.now() + turn.msToNextTurn : null);
  const draft = useDraft<string>(`${config.storagePrefix}:pitch-draft`, "");

  const myPitchThisSlot = log.events.find(
    (p) => p.peerId === room.peerId && p.slotId === turn.slotId,
  );
  const recent = log.events.slice(-5).reverse();

  const start = () => {
    state.set("baselineSlot", turn.slotId);
    phase.transition("pitching", { from: "lobby" });
  };

  const drop = async () => {
    if (!turn.isMyTurn || myPitchThisSlot) return;
    await draft.commit((v) => {
      const t = v.trim().slice(0, 240);
      if (!t) return false;
      log.push({
        id: crypto.randomUUID(),
        peerId: room.peerId,
        text: t,
        ts: Date.now(),
        slotId: turn.slotId,
      });
      return true;
    });
  };

  const peerScores: Record<string, number> = {};
  for (const p of log.events) {
    peerScores[p.peerId] = (peerScores[p.peerId] ?? 0) + (reactions.countsFor(p.id).rocket ?? 0);
  }
  const myRockets = peerScores[room.peerId] ?? 0;
  useFlashOnChange(myRockets);
  const { burst } = useConfetti();
  useEffect(() => {
    const hit = log.events.some(
      (p) => p.peerId === room.peerId && (reactions.countsFor(p.id).rocket ?? 0) >= 3,
    );
    if (hit) burst({ origin: "top", count: 80, hueRange: [140, 200] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myRockets]);

  const board = Object.entries(peerScores)
    .map(([id, score]) => ({ id, name: nameOf(id) ?? `peer-${id.slice(0, 4)}`, score }))
    .sort((a, b) => b.score - a.score);

  const pitcherName = turn.currentPeerId
    ? (nameOf(turn.currentPeerId) ?? `peer-${turn.currentPeerId.slice(0, 4)}`)
    : "—";

  return (
    <div className="pitch-screen">
      <ConfettiLayer />
      <header className="pitch-header">
        <h1>pitch pong</h1>
        <p className="pitch-status">
          {room.peerCount + 1} peers · round {slotsElapsed + 1} · {log.size} pitches
        </p>
      </header>
      <input
        className="pitch-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="your name"
        aria-label="your name"
        maxLength={32}
      />
      {phase.phase === "lobby" && (
        <button
          type="button"
          className="pitch-start"
          onClick={start}
          aria-label="start"
          disabled={!name.trim()}
        >
          start
        </button>
      )}
      {phase.phase !== "lobby" && (
        <div className="pitch-current">
          <span className="pitch-current-label">on the mic: </span>
          <span className="pitch-current-name">{pitcherName}</span>
          <span className="pitch-current-time"> · {deadline.fmt || "—"}</span>
          {turn.isMyTurn && <span className="pitch-current-you"> (you)</span>}
        </div>
      )}
      {phase.phase === "pitching" && turn.isMyTurn && (
        <div className="pitch-compose">
          <textarea
            className="pitch-textarea"
            placeholder="pitch your idea"
            value={draft.value}
            onChange={(e) => draft.setValue(e.target.value)}
            maxLength={240}
            disabled={!!myPitchThisSlot}
          />
          <button
            type="button"
            className="pitch-drop"
            onClick={drop}
            aria-label="drop pitch"
            disabled={!!myPitchThisSlot || !draft.value.trim()}
          >
            drop pitch
          </button>
        </div>
      )}
      <ul className="pitch-feed">
        {recent.length === 0 && <li className="pitch-feed-empty">no pitches yet</li>}
        {recent.map((p) => {
          const counts = reactions.countsFor(p.id);
          return (
            <li key={p.id} className="pitch-feed-row">
              <div className="pitch-feed-text">{p.text}</div>
              <div className="pitch-feed-meta">
                <span className="pitch-feed-author">
                  {nameOf(p.peerId) ?? `peer-${p.peerId.slice(0, 4)}`}
                </span>
                <span className="pitch-feed-tallies">
                  {KINDS.map((k) => (
                    <span key={k.kind} className="pitch-tally">
                      {k.emoji} {counts[k.kind] ?? 0}
                    </span>
                  ))}
                </span>
              </div>
              <div className="pitch-feed-buttons">
                {KINDS.map((k) => (
                  <button
                    key={k.kind}
                    type="button"
                    className={`pitch-react pitch-react-${k.kind}`}
                    onClick={() => reactions.toggle(p.id, k.kind)}
                    aria-label={`react ${k.kind}`}
                  >
                    {k.emoji}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <Leaderboard items={board} highlightId={room.peerId} title="rocket leaders" />
      <p className="pitch-myname" aria-hidden="true">
        you are {myName}
      </p>
    </div>
  );
}

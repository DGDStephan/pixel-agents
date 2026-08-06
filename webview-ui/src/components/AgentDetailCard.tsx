import { useEffect, useRef, useState } from 'react';

import { CHARACTER_SITTING_OFFSET_PX } from '../constants.js';
import type { OfficeState } from '../office/engine/officeState.js';
import type { Character, ToolActivity } from '../office/types.js';
import { CharacterState, TILE_SIZE } from '../office/types.js';
import { Button } from './ui/Button.js';

/** World-px gap between the character anchor and the top of the card. */
const CARD_VERTICAL_OFFSET = TILE_SIZE + 6;

interface AgentDetailCardProps {
  officeState: OfficeState;
  /** Character id of the agent the card describes. */
  agentId: number;
  agentTools: Record<number, ToolActivity[]>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: React.RefObject<{ x: number; y: number }>;
  onClose: () => void;
}

function getStatusText(ch: Character): string {
  if (ch.bubbleType === 'permission') return 'attente de permission';
  if (ch.bubbleType === 'waiting' && ch.waitingAwaitingInput) return "en attente d'entrée";
  if (ch.isActive) return 'actif';
  return 'inactif';
}

function getLastToolStatus(agentId: number, agentTools: Record<number, ToolActivity[]>): string {
  const tools = agentTools[agentId];
  if (!tools || tools.length === 0) return '—';
  const lastActive = [...tools].reverse().find((t) => !t.done);
  return (lastActive ?? tools[tools.length - 1])?.status ?? '—';
}

/**
 * Identity card shown for the clicked (selected) character. Anchored in screen
 * space below the character (same tile→pixel math as ToolOverlay: zoom, pan,
 * devicePixelRatio) and re-anchored every animation frame so it follows the
 * sprite. Self-closes when the canvas deselects the agent (click elsewhere)
 * or when the character despawns.
 */
export function AgentDetailCard({
  officeState,
  agentId,
  agentTools,
  containerRef,
  zoom,
  panRef,
  onClose,
}: AgentDetailCardProps) {
  const [, setTick] = useState(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // rAF loop: follow the character each frame; close when the canvas-side
  // selection (officeState.selectedAgentId, mutated outside React) moves away.
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      if (officeState.selectedAgentId !== agentId || !officeState.characters.has(agentId)) {
        onCloseRef.current();
        return;
      }
      setTick((n) => n + 1);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [officeState, agentId]);

  const ch = officeState.characters.get(agentId);
  const folderName = ch?.folderName;

  // Current task for the agent's workspace folder. Network/HTTP failure → "—".
  const [tache, setTache] = useState<string | null>(null);
  useEffect(() => {
    setTache(null);
    if (!folderName) return;
    const ctrl = new AbortController();
    fetch(`/api/jarvis/tache?dossier=${encodeURIComponent(folderName)}`, { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ tache: string | null }>;
      })
      .then((data) => setTache(data.tache))
      .catch(() => {
        if (!ctrl.signal.aborted) setTache(null);
      });
    return () => ctrl.abort();
  }, [agentId, folderName]);

  const el = containerRef.current;
  if (!el || !ch) return null;

  // Same screen-anchoring math as ToolOverlay (device px → CSS px via dpr).
  const rect = el.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const canvasW = Math.round(rect.width * dpr);
  const canvasH = Math.round(rect.height * dpr);
  const layout = officeState.getLayout();
  const mapW = layout.cols * TILE_SIZE * zoom;
  const mapH = layout.rows * TILE_SIZE * zoom;
  const deviceOffsetX = Math.floor((canvasW - mapW) / 2) + Math.round(panRef.current.x);
  const deviceOffsetY = Math.floor((canvasH - mapH) / 2) + Math.round(panRef.current.y);

  const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0;
  const screenX = (deviceOffsetX + ch.x * zoom) / dpr;
  const screenY = (deviceOffsetY + (ch.y + sittingOffset + CARD_VERTICAL_OFFSET) * zoom) / dpr;

  const agentName = folderName ?? ch.agentName ?? `#${agentId}`;
  const statusText = getStatusText(ch);
  const lastTool = getLastToolStatus(agentId, agentTools);

  return (
    <div
      className="absolute flex flex-col -translate-x-1/2"
      style={{ left: screenX, top: screenY, pointerEvents: 'auto', zIndex: 43 }}
      data-testid="agent-detail-card"
      data-agent-id={agentId}
    >
      <div className="flex flex-col border-border px-8 pt-2 pb-4 gap-2 pixel-panel whitespace-nowrap max-w-2xs">
        <div className="flex items-center gap-5">
          <span
            className="overflow-hidden text-ellipsis block leading-none"
            style={{ fontSize: '20px' }}
          >
            Je suis l'agent {agentName} · statut {statusText} · dernier outil {lastTool} · session #
            {agentId}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              officeState.selectedAgentId = null;
              onClose();
            }}
            title="Fermer"
            className="ml-2 shrink-0 leading-none"
          >
            ×
          </Button>
        </div>
        <span
          className="overflow-hidden text-ellipsis block leading-none"
          style={{ fontSize: '18px' }}
          data-testid="agent-detail-card-tache"
        >
          Tâche : {tache ?? '—'}
        </span>
      </div>
    </div>
  );
}

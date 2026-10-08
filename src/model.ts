import type { Card } from '../vendor/fsrs.mjs';
export interface StudyCard {
  id: string;
  kind: 'term' | 'question';
  front: string;
  back: string;
  explanation: string;
  options?: { id: string; label: string }[];
  answerOption?: string;
}
export interface Deck {
  id: string;
  title: string;
  license: string;
  cards: StudyCard[];
}
export interface Settings {
  startDate: string;
  examDate: string;
  newStopDays: number;
  groupSize: number;
}
export type MemoryCard = Omit<Card, 'due' | 'last_review'> & { due: string; last_review?: string };
export interface Reinforcement {
  successes: number;
  due: string;
  lastWrongGroup: string;
  lastSuccessGroup: string | null;
}
export interface Judgment {
  id: string;
  cardId: string;
  at: string;
  correct: boolean;
  isNew: boolean;
  groupId: string;
  requestedCorrect: boolean;
  forcedWrong: boolean;
}
export interface Session {
  id: string;
  queue: string[];
  currentId: string | null;
  phase: 'prompt' | 'answer' | 'feedback' | 'waiting' | 'complete';
  paused: boolean;
  turn: number;
  draft: string;
  judged: string[];
  wrong: string[];
  opening: string[];
}
export interface StudyState {
  schemaVersion: 1;
  revision: number;
  settings: Settings;
  cards: Record<string, MemoryCard>;
  reinforcement: Record<string, Reinforcement>;
  logs: Judgment[];
  session: Session | null;
}
export interface Command {
  action: 'settings' | 'start' | 'reveal' | 'answer' | 'advance' | 'skip' | 'pause' | 'resume';
  revision: number;
  requestId: string;
  sessionId?: string;
  turn?: number;
  correct?: boolean;
  draft?: string;
  mode?: 'new' | 'review';
  settings?: Settings;
}
export interface PlanSummary {
  today: string;
  newStopDate: string;
  newDaysRemaining: number;
  newTarget: number;
  newDone: number;
  newRemaining: number;
  reviewDue: number;
  reviewLaterToday: number;
  reviewDone: number;
  remainingFirstPass: number;
  firstPassDone: number;
  totalWords: number;
  groupsRemaining: number;
  nextReviewAt: string | null;
}

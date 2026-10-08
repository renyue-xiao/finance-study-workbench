import { dailyPlan } from './core.ts';
import type { StudyState, Deck } from './model.ts';
export function studyView(state: StudyState, deck: Deck, now = new Date()) {
  const session = state.session,
    card = deck.cards.find((c) => c.id === session?.currentId);
  const revealed = !!session && !session.paused && ['answer', 'feedback'].includes(session.phase);
  const current = card
    ? {
        id: card.id,
        kind: card.kind,
        front: card.front,
        ...(card.options ? { options: card.options } : {}),
        ...(revealed
          ? {
              back: card.back,
              explanation: card.explanation,
              ...(card.answerOption ? { answerOption: card.answerOption } : {}),
            }
          : {}),
      }
    : null;
  return {
    revision: state.revision,
    settings: state.settings,
    deck: { id: deck.id, title: deck.title, license: deck.license, count: deck.cards.length },
    plan: dailyPlan(state, deck, now),
    session,
    current,
    reinforcement: card ? state.reinforcement[card.id] : undefined,
    logs: state.logs.slice(-100).reverse(),
  };
}
export type PublicView = ReturnType<typeof studyView>;

export const CARDS = [
  { id: 'C', name: 'Curiosity',   color: '#f59e0b', bg: '#292112', desc: 'Lots of things to investigate and think about' },
  { id: 'H', name: 'Honor',       color: '#60a5fa', bg: '#111827', desc: 'Personal values reflected in how you work' },
  { id: 'A', name: 'Acceptance',  color: '#4ade80', bg: '#0f2218', desc: 'People approve of what you do and who you are' },
  { id: 'M', name: 'Mastery',     color: '#c084fc', bg: '#1d1030', desc: 'Work challenges you but within your abilities' },
  { id: 'P', name: 'Power',       color: '#f87171', bg: '#2a0f0f', desc: 'Room to influence what happens around you' },
  { id: 'F', name: 'Freedom',     color: '#fb923c', bg: '#271408', desc: 'Independent in your work and responsibilities' },
  { id: 'R', name: 'Relatedness', color: '#f472b6', bg: '#29091a', desc: 'Good social contacts with people at work' },
  { id: 'O', name: 'Order',       color: '#22d3ee', bg: '#071e2b', desc: 'Enough rules and policies for stability' },
  { id: 'G', name: 'Goal',        color: '#34d399', bg: '#092017', desc: 'Purpose in life reflected in your work' },
  { id: 'S', name: 'Status',      color: '#fbbf24', bg: '#231a05', desc: 'Position recognized by the people around you' },
];

export function cardById(id) {
  return CARDS.find(c => c.id === id);
}

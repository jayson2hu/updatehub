// 版本喵的猫咪吉祥物：同一张脸，表情跟着结论变（开心 / 犹豫 / 担心）。
export type CatMood = 'happy' | 'unsure' | 'worried';

export function CatMark({ mood = 'happy', size = 40, label }: { mood?: CatMood; size?: number; label?: string }) {
  const face = mood === 'worried'
    ? <><path d="M15 26l5 2M33 26l-5 2" stroke="#3B2A20" strokeWidth="2.2" strokeLinecap="round"/><path d="M20 35q4-3 8 0" fill="none" stroke="#3B2A20" strokeWidth="2" strokeLinecap="round"/></>
    : mood === 'unsure'
      ? <><circle cx="18" cy="27" r="2.4" fill="#3B2A20"/><circle cx="30" cy="27" r="2.4" fill="#3B2A20"/><path d="M20 34h8" stroke="#3B2A20" strokeWidth="2" strokeLinecap="round"/></>
      : <><circle cx="18" cy="27" r="2.6" fill="#3B2A20"/><circle cx="30" cy="27" r="2.6" fill="#3B2A20"/><path d="M21 33q3 2.5 6 0" fill="none" stroke="#3B2A20" strokeWidth="2" strokeLinecap="round"/></>;
  return <svg className="sv7-cat" width={size} height={size} viewBox="0 0 48 48" {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
    <path d="M8 10l8 7h16l8-7v20a16 14 0 0 1-32 0z" fill="#FF8A5B"/>
    {face}
  </svg>;
}

export const moodOf = (advice: string): CatMood => advice === 'hold' ? 'worried' : advice === 'wait' ? 'unsure' : 'happy';

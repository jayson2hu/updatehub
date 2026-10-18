'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import './follow-button.css';

const event = 'updatehub:follow-feedback';
export function showFollowFeedback(message: string) {
  window.dispatchEvent(new CustomEvent(event, { detail: message }));
}

export function FollowFeedback() {
  const [message, setMessage] = useState('');
  useEffect(() => {
    const receive = (value: Event) => setMessage((value as CustomEvent<string>).detail);
    window.addEventListener(event, receive);
    return () => window.removeEventListener(event, receive);
  }, []);
  return message ? <aside className="follow-feedback" aria-label="关注操作结果">
    <p role="status">{message}</p>
    <div><Link href="/my-software" onClick={() => setMessage('')}>查看我的关注</Link><button type="button" aria-label="关闭关注提示" onClick={() => setMessage('')}><X size={18} /></button></div>
  </aside> : null;
}

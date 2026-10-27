import { CircleCheck, LoaderCircle, CircleAlert } from 'lucide-react';

export default function StatusPill({ label, status }) {
  const ready = status === 'ready' || status === 'stale';
  const bad = status === 'error';
  return <div className={`status-pill ${ready ? 'is-ready' : bad ? 'is-error' : 'is-loading'}`}>
    {ready ? <CircleCheck size={15} /> : bad ? <CircleAlert size={15} /> : <LoaderCircle size={15} className="spin" />}
    <span>{label} · {status === 'stale' ? '快取模式' : ready ? '已就緒' : bad ? '異常' : '初始化中'}</span>
  </div>;
}

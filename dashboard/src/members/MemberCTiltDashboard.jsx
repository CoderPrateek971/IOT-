import { Compass } from 'lucide-react';

// Member C starts here: servo angle display and user control.
export default function MemberCTiltDashboard({ angle, angleTarget, optimalAngle, onAngleDraft, onApplyAngle, isApplying }) {
  return <section className="rounded-lg bg-slate-900 border border-slate-800 p-4">
    <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Compass className="w-4 h-4 text-blue-400" /><div><h2 className="text-sm font-semibold text-white">Tilt Angle</h2><p className="text-xs text-slate-400">Servo position · Optimal: {optimalAngle}°</p></div></div><span className={`font-mono font-semibold ${angle !== optimalAngle ? 'text-amber-400' : 'text-white'}`}>{angle}°</span></div>
    <div className="mt-3 pt-3 border-t border-slate-800 space-y-2"><div className="flex items-center justify-between text-xs text-slate-400"><label htmlFor="manual-tilt-angle">Set servo angle</label><span>0°–180°</span></div><div className="flex items-center gap-3">
      <input id="manual-tilt-angle" type="range" min="0" max="180" value={angleTarget} onChange={(event) => onAngleDraft(Number(event.target.value))} className="flex-1 accent-sky-400" />
      <input type="number" min="0" max="180" value={angleTarget} onChange={(event) => onAngleDraft(Math.min(180, Math.max(0, Number(event.target.value) || 0)))} className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-right text-xs text-white" aria-label="Servo angle in degrees" />
      <button onClick={onApplyAngle} disabled={isApplying} className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50">{isApplying ? 'Applying…' : 'Set angle'}</button>
    </div></div>
  </section>;
}

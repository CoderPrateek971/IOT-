import { Compass } from 'lucide-react';

// Member C starts here: current servo angle display.
export default function MemberCTiltDashboard({ angle, optimalAngle }) {
  return <section className="rounded-lg bg-slate-900 border border-slate-800 p-4 lg:flex-1 lg:flex lg:items-center">
    <div className="flex w-full items-center justify-between"><div className="flex items-center gap-2"><Compass className="w-4 h-4 text-blue-400" /><div><h2 className="text-sm font-semibold text-white">Tilt Angle</h2><p className="text-xs text-slate-400">Servo position · Optimal: {optimalAngle}°</p></div></div><span className={`font-mono font-semibold ${angle !== optimalAngle ? 'text-amber-400' : 'text-white'}`}>{angle}°</span></div>
  </section>;
}

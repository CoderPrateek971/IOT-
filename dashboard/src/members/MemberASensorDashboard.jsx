import { Sun, Thermometer, Layers } from 'lucide-react';

// Irradiance and DHT22 temperature displays.
export default function MemberASensorDashboard({ irradiance, temperature, soiling }) {
  return <section className="rounded-lg bg-slate-900 border border-slate-800 p-4">
    <h2 className="text-sm font-semibold text-white">Environmental Sensors</h2>
    <p className="text-xs text-slate-400 mt-1">Live photoresistor and DHT22 readings</p>
    <div className="mt-3 divide-y divide-slate-800 text-xs">
      <div className="py-3 flex items-center justify-between"><div className="flex items-center gap-2"><Sun className="w-3.5 h-3.5 text-amber-400"/><div><div className="font-medium text-slate-200">Solar Irradiance</div><div className="text-[11px] text-slate-500">LDR Sensor · 0–1000 W/m²</div></div></div><strong className="font-mono text-sm text-white">{irradiance} <span className="text-[11px] text-slate-400">W/m²</span></strong></div>
      <div className="py-3 flex items-center justify-between"><div className="flex items-center gap-2"><Thermometer className="w-3.5 h-3.5 text-rose-400"/><div><div className="font-medium text-slate-200">Cell Temperature</div><div className="text-[11px] text-slate-500">DHT22 Sensor · Nominal ≤ 25°C</div></div></div><strong className={`font-mono text-sm ${temperature > 35 ? 'text-amber-400' : 'text-white'}`}>{temperature} <span className="text-[11px] text-slate-400">°C</span></strong></div>
      <div className="py-3 flex items-center justify-between"><div className="flex items-center gap-2"><Layers className="w-3.5 h-3.5 text-amber-400"/><div><div className="font-medium text-slate-200">Panel Soiling</div><div className="text-[11px] text-slate-500">Simulated level · 0–100%</div></div></div><strong className={`font-mono text-sm ${soiling > 25 ? 'text-amber-400' : 'text-white'}`}>{soiling} <span className="text-[11px] text-slate-400">%</span></strong></div>
    </div>
  </section>;
}

import { Area, AreaChart, Brush, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// Member D starts here: live telemetry history visualization.
export default function MemberDHistoryDashboard({ history, chartStart, chartDomainEnd, chartTicks }) {
  return <section className="h-full rounded-lg bg-slate-900 border border-slate-800 p-4 flex flex-col justify-between">
    <div><div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-800 gap-2 mb-3"><div><h2 className="text-sm font-semibold text-white">Live Power History</h2><p className="text-xs text-slate-400">Session start is fixed; chart samples and time ticks are spaced 30 seconds apart</p></div></div>
      <div className="h-60 w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <defs><linearGradient id="colorExpected" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25}/><stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/></linearGradient><linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3}/><stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/></linearGradient></defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/><XAxis dataKey="timestamp" type="number" scale="time" domain={chartStart == null ? ['dataMin', 'dataMax'] : [chartStart, chartDomainEnd]} ticks={chartTicks} tickFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} stroke="#64748b" tick={{ fontSize: 11 }}/><YAxis stroke="#64748b" domain={[0, 160]} tick={{ fontSize: 11 }} unit="W"/><Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '6px', fontSize: '12px' }} labelFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}/>
        <Area type="monotone" dataKey="expected" stroke="#f59e0b" strokeWidth={1.5} fillOpacity={1} fill="url(#colorExpected)" name="Expected (W)"/><Area type="monotone" dataKey="actual" stroke="#38bdf8" strokeWidth={1.5} fillOpacity={1} fill="url(#colorActual)" name="Actual (W)"/><Brush dataKey="time" height={18} stroke="#38bdf8" fill="#0b1120" travellerWidth={6}/>
      </AreaChart></ResponsiveContainer></div>
    </div>
    <div className="pt-2 flex items-center justify-between text-xs text-slate-400"><div className="flex items-center gap-4"><span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 bg-amber-500 rounded"/>Expected Output</span><span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 bg-sky-400 rounded"/>Simulated Output</span></div><span className="font-mono text-[11px] text-slate-500">Latest {history.length} samples</span></div>
  </section>;
}

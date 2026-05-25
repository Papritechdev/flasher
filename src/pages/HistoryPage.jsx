import { useState, useEffect, useCallback } from 'react';
import { fetchReports } from '../utils/firestore';
import { downloadBatchReportFromFirestore } from '../utils/report';

function ResultBadge({ result }) {
  if (result === 'PASS') return <span className="badge-pass">PASS</span>;
  if (result === 'FAIL') return <span className="badge-fail">FAIL</span>;
  return <span className="badge-idle">{result ?? 'N/A'}</span>;
}

export default function HistoryPage() {
  const [reports,  setReports]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  // Filter state
  const [filterBatch,  setFilterBatch]  = useState('');
  const [filterResult, setFilterResult] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters = {};
      if (filterBatch.trim())  filters.batch  = filterBatch.trim();
      if (filterResult)        filters.result = filterResult;
      const data = await fetchReports(filters);
      setReports(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filterBatch, filterResult]);

  useEffect(() => {
    load();
  }, [load]);

  function formatDate(d) {
    if (!d) return '—';
    if (d instanceof Date) return d.toLocaleString();
    return String(d);
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Test History</h1>
          <p className="text-sm text-slate-500 mt-0.5">One report per batch with all device results</p>
        </div>
        <button className="btn-ghost" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : '↺ Refresh'}
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-5 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-40">
          <label className="label">Filter by Batch</label>
          <input
            className="input"
            type="text"
            placeholder="BATCH-2026-001"
            value={filterBatch}
            onChange={(e) => setFilterBatch(e.target.value)}
          />
        </div>
        <div className="w-40">
          <label className="label">Filter by Result</label>
          <select
            className="input"
            value={filterResult}
            onChange={(e) => setFilterResult(e.target.value)}
          >
            <option value="">All</option>
            <option value="PASS">PASS</option>
            <option value="FAIL">FAIL</option>
          </select>
        </div>
        <button className="btn-primary" onClick={load} disabled={loading}>
          Apply
        </button>
        <button
          className="btn-ghost"
          onClick={() => { setFilterBatch(''); setFilterResult(''); }}
        >
          Clear
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-950 border border-red-700 rounded p-3 text-red-300 text-sm mb-4">
          {error}
        </div>
      )}

      {/* Table */}
      {!loading && reports.length === 0 && !error && (
        <div className="card text-center py-12 text-slate-500">
          No reports found.
        </div>
      )}

      {reports.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left">
                <th className="pb-2 text-xs text-slate-500 uppercase tracking-wider pr-4">Date</th>
                <th className="pb-2 text-xs text-slate-500 uppercase tracking-wider pr-4">Batch</th>
                <th className="pb-2 text-xs text-slate-500 uppercase tracking-wider pr-4">Devices</th>
                <th className="pb-2 text-xs text-slate-500 uppercase tracking-wider pr-4">Tester</th>
                <th className="pb-2 text-xs text-slate-500 uppercase tracking-wider pr-4">Result</th>
                <th className="pb-2 text-xs text-slate-500 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-b border-slate-800 hover:bg-slate-900/50 transition-colors">
                  <td className="py-2 pr-4 text-slate-400 text-xs whitespace-nowrap">
                    {formatDate(r.latest_test_date ?? r.test_date)}
                  </td>
                  <td className="py-2 pr-4 text-slate-300 text-xs">{r.batch ?? '—'}</td>
                  <td className="py-2 pr-4 text-slate-300 text-xs">{r.device_count ?? r.devices?.length ?? 0}</td>
                  <td className="py-2 pr-4 text-slate-400 text-xs truncate max-w-32">
                    {(r.tester_emails ?? []).length > 0 ? r.tester_emails.join(', ') : '—'}
                  </td>
                  <td className="py-2 pr-4">
                    <ResultBadge result={r.global_result} />
                  </td>
                  <td className="py-2 text-right">
                    <button
                      className="btn-ghost text-xs px-2 py-1"
                      onClick={() => downloadBatchReportFromFirestore(r)}
                    >
                      ⬇ batch .xlsx
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

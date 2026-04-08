import { useEffect, useState } from "react";
import Chart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import { reportsAPI } from "../../utils/api";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  RECEIVED: {
    label: "Diterima",
    color: "#6366f1",
    bg: "rgba(99,102,241,0.08)",
    icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  },
  WASHING: {
    label: "Cuci/Kering",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.08)",
    icon: "M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z",
  },
  IRONING: {
    label: "Setrika",
    color: "#0ea5e9",
    bg: "rgba(14,165,233,0.08)",
    icon: "M13 10V3L4 14h7v7l9-11h-7z", // Svg flash or iron icon
  },
  COMPLETED: {
    label: "Selesai",
    color: "#10b981",
    bg: "rgba(16,185,129,0.08)",
    icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  },
};

export default function OrderStatusPieChart() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [byStatus, setByStatus] = useState<Array<{ status: string; count: number }>>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await reportsAPI.getOrdersByStatus();
        if (cancelled) return;
        if (res.success && res.data) {
          setByStatus(res.data.by_status);
        } else {
          setError(res.message || "Gagal memuat data");
          setByStatus([]);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Terjadi kesalahan");
          setByStatus([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, []);

  const filtered = byStatus.filter((s) => s.status !== "PICKED_UP");
  const series = filtered.map((s) => s.count);
  const colors = filtered.map((s) => STATUS_CONFIG[s.status]?.color ?? "#94a3b8");
  const labels = filtered.map((s) => STATUS_CONFIG[s.status]?.label ?? s.status);
  const total = series.reduce((a, b) => a + b, 0);

  const options: ApexOptions = {
    chart: {
      fontFamily: "'DM Sans', sans-serif",
      type: "donut",
      height: 280,
      animations: { enabled: true, speed: 900 },
      events: {
        dataPointMouseEnter: (_e, _ctx, config) => setActiveIndex(config.dataPointIndex),
        dataPointMouseLeave: () => setActiveIndex(null),
      },
      toolbar: { show: false },
    },
    colors,
    labels,
    stroke: { show: false },
    dataLabels: { enabled: false },
    legend: { show: false },
    plotOptions: {
      pie: {
        donut: {
          size: "72%",
          labels: {
            show: true,
            name: {
              show: true,
              fontSize: "12px",
              fontWeight: 500,
              color: "#94a3b8",
              offsetY: -6,
            },
            value: {
              show: true,
              fontSize: "34px",
              fontWeight: 700,
              color: "#0f172a",
              offsetY: 6,
              formatter: (val) => val,
            },
            total: {
              show: true,
              showAlways: true,
              label: "Antrean",
              fontSize: "12px",
              fontWeight: 500,
              color: "#94a3b8",
              formatter: () => total.toString(),
            },
          },
        },
        expandOnClick: false,
      },
    },
    states: {
      hover: { filter: { type: "darken" } },
      active: { filter: { type: "none" } },
    },
    tooltip: {
      theme: "light",
      y: { formatter: (val) => `${val} pesanan` },
      marker: { show: false },
      style: { fontSize: "13px", fontFamily: "'DM Sans', sans-serif" },
    },
  };

  return (
    <div
      className="flex flex-col h-full rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 overflow-hidden"
      style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.04)" }}
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-gray-50 dark:border-gray-800/70 flex items-start justify-between gap-3">
        <div>
          <h3
            className="text-sm font-semibold text-gray-900 dark:text-white tracking-tight"
            style={{ fontFamily: "'DM Sans', sans-serif", letterSpacing: "-0.01em" }}
          >
            Order dalam Proses
          </h3>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
            Distribusi status order aktif
          </p>
        </div>
        {!loading && total > 0 && (
          <span
            className="shrink-0 mt-0.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ background: "rgba(99,102,241,0.08)", color: "#6366f1" }}
          >
            {/* <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: "#6366f1", animation: "pulse 2s infinite" }}
            />
            Live */}
          </span>
        )}
      </div>

      <div className="flex-1 flex flex-col px-4 pt-3 pb-5 gap-4">
        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 dark:border-red-900/30 dark:bg-red-900/10 px-3 py-2.5">
            <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex flex-1 h-[260px] items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div
                className="h-9 w-9 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: "#e2e8f0", borderTopColor: "transparent" }}
              />
              <p className="text-xs text-gray-400">Memuat data…</p>
            </div>
          </div>
        ) : total === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center h-[260px] gap-3 text-center">
            <div
              className="rounded-2xl p-4"
              style={{ background: "rgba(148,163,184,0.08)" }}
            >
              <svg className="h-7 w-7 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Keranjang kosong</p>
              <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-600">Belum ada order yang antre</p>
            </div>
          </div>
        ) : (
          <>
            {/* Donut Chart */}
            <div className="-mx-1">
              <Chart options={options} series={series} type="donut" height={260} />
            </div>

            {/* Custom Legend — stat cards */}
            <div className="grid grid-cols-2 gap-2">
              {filtered.map((item, i) => {
                const cfg = STATUS_CONFIG[item.status];
                const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
                const isActive = activeIndex === i;

                return (
                  <div
                    key={item.status}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-all duration-150 cursor-default"
                    style={{
                      background: isActive ? cfg?.bg ?? "rgba(148,163,184,0.08)" : "rgba(148,163,184,0.05)",
                      border: `1px solid ${isActive ? (cfg?.color ?? "#94a3b8") + "30" : "rgba(148,163,184,0.1)"}`,
                    }}
                    onMouseEnter={() => setActiveIndex(i)}
                    onMouseLeave={() => setActiveIndex(null)}
                  >
                    {/* Color dot */}
                    <div
                      className="shrink-0 h-2.5 w-2.5 rounded-full"
                      style={{ background: cfg?.color ?? "#94a3b8" }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate leading-tight">
                        {cfg?.label ?? item.status}
                      </p>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span
                          className="text-sm font-bold leading-none"
                          style={{ color: cfg?.color ?? "#64748b", fontFamily: "'DM Sans', sans-serif" }}
                        >
                          {item.count}
                        </span>
                        <span className="text-[10px] text-gray-400 leading-none font-medium">
                          {pct}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}